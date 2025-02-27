#include <iostream>
#include <string>
#include <memory>
#include <array>
#include <vector>
#include <thread>
#include <cstdlib>
#include <locale>
#include <codecvt>
#include <mutex>
#include <atomic>
#include <csignal>
#include <functional>
#include <chrono>

#include <boost/asio.hpp>

#include <krisp-audio-sdk.hpp>
#include <krisp-audio-sdk-nc.hpp>

using Krisp::AudioSdk::globalInit;
using Krisp::AudioSdk::globalDestroy;
using Krisp::AudioSdk::NcSessionConfig;
using Krisp::AudioSdk::Nc;
using Krisp::AudioSdk::ModelInfo;
using Krisp::AudioSdk::FrameDuration;
using Krisp::AudioSdk::SamplingRate;

using boost::asio::ip::tcp;

// --- Logging Utility ---
std::mutex log_mutex;
void log_info(const std::string& msg) {
    std::lock_guard<std::mutex> lock(log_mutex);
    std::cout << "[INFO] " << msg << std::endl;
}
void log_error(const std::string& msg) {
    std::lock_guard<std::mutex> lock(log_mutex);
    std::cerr << "[ERROR] " << msg << std::endl;
}

// Constants for 16 kHz PCM16.
// Each 20-ms chunk contains 320 samples (640 bytes).
static constexpr size_t sample_rate = 16000;
static constexpr size_t samples_per_20ms = sample_rate * 20 / 1000;    // 320 samples
static constexpr size_t bytes_per_sample = sizeof(int16_t);         // 2 bytes
static constexpr size_t buffer_size = samples_per_20ms * bytes_per_sample; // 640 bytes

//
// Session class: handles a single TCP connection.
// Each session creates its own Krisp session and processes incoming 20-ms audio chunks.
//
class session : public std::enable_shared_from_this<session> {
public:
    session(tcp::socket socket, const std::string& model_path, float noiseSuppressionLevel, std::atomic<int>& activeCount, std::atomic<int>& totalCount)
        : socket_(std::move(socket)),
          strand_(boost::asio::make_strand(socket_.get_executor())),
          noiseSuppressionLevel_(noiseSuppressionLevel),
          connectionCount_(activeCount),
          totalConnections_(totalCount)
    {
        try {
            remoteAddress_ = socket_.remote_endpoint().address().to_string();
        } catch (std::exception&) {
            remoteAddress_ = "unknown";
        }
        // Increase active connection count.
        ++connectionCount_;
        log_info("New connection accepted from " + remoteAddress_ +
                 " | Active: " + std::to_string(connectionCount_.load()) +
                 " | Total: " + std::to_string(totalConnections_.load()));

        // Create a dedicated Krisp session for this connection.
        std::wstring_convert<std::codecvt_utf8<wchar_t>> converter;
        ModelInfo ncModelInfo;
        ncModelInfo.path = converter.from_bytes(model_path);

        NcSessionConfig ncCfg{
            SamplingRate::Sr16000Hz,   // Input sampling rate
            FrameDuration::Fd20ms,      // Processing frame duration (20ms)
            SamplingRate::Sr16000Hz,    // Output sampling rate (same as input)
            &ncModelInfo,              // Model info
            false,                     // Disable per-frame stats (enable if needed)
            nullptr                    // No ringtone config
        };

        ncSession_ = Nc<int16_t>::create(ncCfg);
    }

    ~session() {
        --connectionCount_;
        log_info("Connection closed from " + remoteAddress_ +
                 " | Active: " + std::to_string(connectionCount_.load()) +
                 " | Total: " + std::to_string(totalConnections_.load()));
    }

    void start() {
        do_read();
    }

private:
    void do_read() {
        auto self(shared_from_this());
        boost::asio::async_read(socket_,
            boost::asio::buffer(read_buffer_),
            boost::asio::transfer_exactly(buffer_size),
            boost::asio::bind_executor(strand_,
                [this, self](boost::system::error_code ec, std::size_t) {
                    if (!ec) {
                        process_chunk();
                    } else if (ec == boost::asio::error::eof) {
                        log_info("Connection closed gracefully by " + remoteAddress_);
                    } else {
                        log_error("Read error (" + remoteAddress_ + "): " + ec.message());
                    }
                }
            )
        );
    }

    void process_chunk() {
        const int16_t* in_samples = reinterpret_cast<const int16_t*>(read_buffer_.data());
        int16_t* out_samples = reinterpret_cast<int16_t*>(write_buffer_.data());

        ncSession_->process(in_samples, samples_per_20ms,
                            out_samples, samples_per_20ms,
                            noiseSuppressionLevel_, nullptr);
        do_write();
    }

    void do_write() {
        auto self(shared_from_this());
        boost::asio::async_write(socket_,
            boost::asio::buffer(write_buffer_),
            boost::asio::bind_executor(strand_,
                [this, self](boost::system::error_code ec, std::size_t) {
                    if (!ec) {
                        do_read();
                    } else {
                        log_error("Write error (" + remoteAddress_ + "): " + ec.message());
                    }
                }
            )
        );
    }

    tcp::socket socket_;
    boost::asio::strand<boost::asio::any_io_executor> strand_;
    std::array<char, buffer_size> read_buffer_;
    std::array<char, buffer_size> write_buffer_;
    std::shared_ptr<Nc<int16_t>> ncSession_;
    float noiseSuppressionLevel_;
    std::string remoteAddress_;
    std::atomic<int>& connectionCount_;
    std::atomic<int>& totalConnections_;
};

//
// Server class: listens for incoming connections, enforces a maximum connection limit,
// and creates a new session for each accepted connection.
// It also provides a shutdown() method to stop accepting new connections.
//
class server {
public:
    server(boost::asio::io_context& io_context, short port, const std::string& model_path,
           float noiseSuppressionLevel, int maxConnections)
        : acceptor_(io_context, tcp::endpoint(tcp::v4(), static_cast<unsigned short>(port))),
          model_path_(model_path),
          noiseSuppressionLevel_(noiseSuppressionLevel),
          maxConnections_(maxConnections),
          activeConnections_(0),
          totalConnections_(0)
    {
        try {
            log_info("Server listening on " + acceptor_.local_endpoint().address().to_string() +
                     ":" + std::to_string(acceptor_.local_endpoint().port()));
        } catch (std::exception& e) {
            log_error("Could not obtain local endpoint: " + std::string(e.what()));
        }
        do_accept();
    }

    // Shutdown the server: close the acceptor so no new connections are accepted.
    void shutdown() {
        boost::system::error_code ec;
        acceptor_.close(ec);
        if (ec) {
            log_error("Error closing acceptor: " + ec.message());
        } else {
            log_info("Acceptor closed. No longer accepting new connections.");
        }
    }

    // Returns the current active connection count.
    int get_active_connections() const {
        return activeConnections_.load();
    }

private:
    void do_accept() {
        acceptor_.async_accept(
            [this](boost::system::error_code ec, tcp::socket socket) {
                if (!ec) {
                    // Enforce maximum connection limit.
                    if (activeConnections_ >= maxConnections_) {
                        log_error("Max connections reached. Rejecting connection from " +
                                  socket.remote_endpoint().address().to_string());
                        socket.close();
                    } else {
                        ++totalConnections_;
                        std::make_shared<session>(std::move(socket), model_path_, noiseSuppressionLevel_, activeConnections_, totalConnections_)->start();
                    }
                } else {
                    log_error("Accept error: " + ec.message());
                }
                // Continue accepting if not shut down.
                if (acceptor_.is_open())
                    do_accept();
            }
        );
    }

    tcp::acceptor acceptor_;
    std::string model_path_;
    float noiseSuppressionLevel_;
    int maxConnections_;
    std::atomic<int> activeConnections_;
    std::atomic<int> totalConnections_;
};

//
// Main: Initializes the Krisp SDK, sets up signal handling for graceful shutdown,
// creates the server, and runs the asynchronous server on a thread pool.
// The graceful shutdown will wait for up to a configurable timeout (in seconds) for active
// connections to close before forcing shutdown.
//
int main(int argc, char* argv[]) {
    // Usage: server <port> <model_path> [noise_suppression_level] [max_connections] [shutdown_timeout_sec]
    if (argc < 3) {
        std::cerr << "Usage: apm-krisp-nc <port> <model_path> [noise_suppression_level] [max_connections] [shutdown_timeout_sec]\n";
        return 1;
    }

    std::cout.sync_with_stdio(false);
    setbuf(stdout, NULL);
    setbuf(stderr, NULL);

    short port = static_cast<short>(std::atoi(argv[1]));
    std::string model_path = argv[2];
    float noiseSuppressionLevel = 100.0f;
    if (argc >= 4) {
        noiseSuppressionLevel = std::stof(argv[3]);
    }
    int maxConnections = 10; // Default
    if (argc >= 5) {
        maxConnections = std::atoi(argv[4]);
    }
    int shutdownTimeoutSec = 120; // Default 60 seconds
    if (argc >= 6) {
        shutdownTimeoutSec = std::atoi(argv[5]);
    }

    try {
        // Global Krisp initialization (call once at startup).
        globalInit(L"");

        boost::asio::io_context io_context;

        // Create the server.
        server srv(io_context, port, model_path, noiseSuppressionLevel, maxConnections);

        // Set up signal handling for graceful shutdown.
        boost::asio::signal_set signals(io_context, SIGINT, SIGTERM);
        signals.async_wait([&io_context, &srv, shutdownTimeoutSec](boost::system::error_code /*ec*/, int signo) {
            log_info("Shutdown signal (" + std::to_string(signo) + ") received. Initiating graceful shutdown...");
            // Stop accepting new connections.
            srv.shutdown();
            // Set a deadline for graceful shutdown.
            auto shutdown_deadline = std::chrono::steady_clock::now() + std::chrono::seconds(shutdownTimeoutSec);
            // Create a timer to check active connections periodically.
            auto check_timer = std::make_shared<boost::asio::steady_timer>(io_context, std::chrono::seconds(1));
            // Define a lambda to check connection count.
            std::function<void()> check_connections;
            check_connections = [&, check_timer]() {
                if (srv.get_active_connections() == 0) {
                    log_info("All connections closed. Shutting down gracefully.");
                    io_context.stop();
                } else if (std::chrono::steady_clock::now() >= shutdown_deadline) {
                    log_info("Shutdown timeout reached. Forcing shutdown with " +
                            std::to_string(srv.get_active_connections()) + " active connection(s).");
                    io_context.stop();
                } else {
                    // Reschedule the timer to check again after 1 second.
                    check_timer->expires_after(std::chrono::seconds(1));
                    check_timer->async_wait([&](const boost::system::error_code& ec) {
                        if (!ec) {
                            check_connections();
                        }
                    });
                }
            };
            check_connections();
        });

        // Run io_context on a thread pool.
        std::vector<std::thread> threads;
        unsigned int thread_count = std::thread::hardware_concurrency();
        if (thread_count == 0)
            thread_count = 2;
        for (unsigned int i = 0; i < thread_count; ++i) {
            threads.emplace_back([&io_context]() { io_context.run(); });
        }
        for (auto& t : threads) {
            t.join();
        }
    } catch (std::exception& e) {
        log_error("Exception in main: " + std::string(e.what()));
    }

    globalDestroy();
    return 0;
}
