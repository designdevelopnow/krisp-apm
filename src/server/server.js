const net = require('net');
const fs = require('fs');
const os = require('os');
const http = require('http');
const KrispProcessor = require('../lib/krisp-processor');

// Global server metrics for logging and health monitoring.
const metrics = {
    activeConnections: 0,
    totalConnections: 0,
    totalBytesProcessed: 0,
    totalFramesProcessed: 0,
    errors: 0,
    startTime: Date.now(),
    maxConcurrentConnections: 0,
    maxActiveConnections: 0
};

class AudioStreamProcessor {
    constructor(socket, modelPath, sampleRate = 16000) {
        this.socket = socket;
        this.processor = new KrispProcessor(modelPath, sampleRate);
        this.sampleRate = sampleRate;
        this.closed = false;

        // Calculate sizes:
        // For a 10ms frame: floor(sampleRate * 0.01) samples, each 2 bytes (PCM16).
        const samplesPerFrame = Math.floor(sampleRate * 0.01);
        this.processingFrameSize = samplesPerFrame * 2; // bytes in one 10ms frame
        this.outputFrameSize = this.processingFrameSize * 2; // network expects 20ms chunks

        // Pre-allocate buffers for incoming and outgoing data.
        // (Using a moderate initial size; these will grow if needed.)
        this.inputBuffer = Buffer.alloc(32768);
        this.inputBufferUsed = 0;
        this.outputBuffer = Buffer.alloc(32768);
        this.outputBufferUsed = 0;

        this.totalBytesReceived = 0;
        this.totalBytesSent = 0;
        this.framesProcessed = 0;

        // Start with the socket paused.
        this.socket.pause();
        this.socket.on('drain', () => {
            if (!this.closed) this.socket.resume();
        });
    }

    initialize() {
        try {
            this.processor.initialize();
            this.socket.resume();
            return true;
        } catch (err) {
            console.error('Failed to initialize processor:', err);
            metrics.errors++;
            this.close();
            return false;
        }
    }

    processData(data) {
        if (this.closed) return;
        try {
            if (!this.socket.writable) {
                this.close();
                return;
            }
            this.totalBytesReceived += data.length;
            metrics.totalBytesProcessed += data.length;

            // Append the new incoming data to our pre-allocated input buffer.
            this._appendToInputBuffer(data);

            // Process complete 10ms frames from the input buffer.
            while (this.inputBufferUsed >= this.processingFrameSize) {
                // Copy one complete 10ms frame.
                let frame = Buffer.alloc(this.processingFrameSize);
                this.inputBuffer.copy(frame, 0, 0, this.processingFrameSize);

                // Process this frame via the native Krisp processor.
                let processedFrame = Buffer.alloc(this.processingFrameSize);
                this.processor.processFrames(frame, processedFrame);
                this.framesProcessed++;
                metrics.totalFramesProcessed++;

                // Append the processed frame into the output buffer.
                this._appendToOutputBuffer(processedFrame);

                // Remove the processed frame bytes from the input buffer.
                this._consumeInputBuffer(this.processingFrameSize);
            }

            // When we have at least one 20ms chunk in the output buffer, send it.
            while (this.outputBufferUsed >= this.outputFrameSize) {
                let outputChunk = Buffer.alloc(this.outputFrameSize);
                this.outputBuffer.copy(outputChunk, 0, 0, this.outputFrameSize);
                const canWrite = this.socket.write(outputChunk);
                this.totalBytesSent += this.outputFrameSize;
                this._consumeOutputBuffer(this.outputFrameSize);
                if (!canWrite) {
                    this.socket.pause();
                    break;
                }
            }
        } catch (err) {
            metrics.errors++;
            this.close();
        }
    }

    // Append data into the input buffer, expanding if necessary.
    _appendToInputBuffer(data) {
        if (this.inputBufferUsed + data.length > this.inputBuffer.length) {
            // First, try shifting existing data to the beginning.
            if (this.inputBufferUsed > 0) {
                this.inputBuffer.copy(this.inputBuffer, 0, 0, this.inputBufferUsed);
            }
            if (this.inputBufferUsed + data.length > this.inputBuffer.length) {
                // Still not enough space; allocate a larger buffer.
                let newSize = (this.inputBufferUsed + data.length) * 2;
                let newBuffer = Buffer.alloc(newSize);
                this.inputBuffer.copy(newBuffer, 0, 0, this.inputBufferUsed);
                this.inputBuffer = newBuffer;
            }
        }
        data.copy(this.inputBuffer, this.inputBufferUsed);
        this.inputBufferUsed += data.length;
    }

    // Remove n bytes from the beginning of the input buffer.
    _consumeInputBuffer(n) {
        if (n < this.inputBufferUsed) {
            this.inputBuffer.copy(this.inputBuffer, 0, n, this.inputBufferUsed);
        }
        this.inputBufferUsed -= n;
    }

    // Append data into the output buffer, expanding if necessary.
    _appendToOutputBuffer(data) {
        if (this.outputBufferUsed + data.length > this.outputBuffer.length) {
            if (this.outputBufferUsed > 0) {
                this.outputBuffer.copy(this.outputBuffer, 0, 0, this.outputBufferUsed);
            }
            if (this.outputBufferUsed + data.length > this.outputBuffer.length) {
                let newSize = (this.outputBufferUsed + data.length) * 2;
                let newBuffer = Buffer.alloc(newSize);
                this.outputBuffer.copy(newBuffer, 0, 0, this.outputBufferUsed);
                this.outputBuffer = newBuffer;
            }
        }
        data.copy(this.outputBuffer, this.outputBufferUsed);
        this.outputBufferUsed += data.length;
    }

    // Remove n bytes from the beginning of the output buffer.
    _consumeOutputBuffer(n) {
        if (n < this.outputBufferUsed) {
            this.outputBuffer.copy(this.outputBuffer, 0, n, this.outputBufferUsed);
        }
        this.outputBufferUsed -= n;
    }

    close() {
        if (!this.closed) {
            this.closed = true;
            this.processor = null;
            if (this.socket.writable) {
                this.socket.end();
            }
            metrics.activeConnections--;
            metrics.maxActiveConnections = Math.max(metrics.maxActiveConnections, metrics.activeConnections);
        }
    }
}

class AudioServer {
    constructor(port, modelPath, options = {}) {
        this.port = port;
        this.modelPath = modelPath;
        this.server = null;
        this.options = {
            maxConnections: options.maxConnections || 50,
            metricsPort: options.metricsPort || (port + 1),
            metricsInterval: options.metricsInterval || 5000,
            ...options
        };
        this.healthServer = null;
        this.metricsInterval = null;
        this.lastMetricsLog = Date.now();
    }

    start() {
        if (!fs.existsSync(this.modelPath)) {
            throw new Error(`Model path does not exist: ${this.modelPath}`);
        }

        // Start the main TCP audio processing server.
        this.server = net.createServer((socket) => {
            if (metrics.activeConnections >= this.options.maxConnections) {
                socket.end();
                return;
            }
            metrics.activeConnections++;
            metrics.totalConnections++;
            metrics.maxConcurrentConnections = Math.max(metrics.maxConcurrentConnections, metrics.totalConnections);
            metrics.maxActiveConnections = Math.max(metrics.maxActiveConnections, metrics.activeConnections);

            let processor = new AudioStreamProcessor(socket, this.modelPath);
            if (!processor.initialize()) {
                processor.close();
                return;
            }

            // Set a socket timeout.
            socket.setTimeout(30000);
            socket.on('timeout', () => {
                processor.close();
            });
            socket.on('data', (data) => {
                try {
                    processor.processData(data);
                } catch (err) {
                    processor.close();
                }
            });
            socket.on('end', () => {
                processor.close();
            });
            socket.on('error', () => {
                processor.close();
            });
            socket.on('close', () => {
                processor.close();
            });
        });

        this.server.on('error', (err) => {
            console.error('Server error:', err);
            metrics.errors++;
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${this.port} is already in use`);
                process.exit(1);
            }
        });

        this.server.listen(this.port, () => {
            console.log(`Audio processing server listening on port ${this.port}`);
        });

        // Start an HTTP health check server.
        this.healthServer = http.createServer((req, res) => {
            if (req.method === 'GET') {
                const uptime = Date.now() - metrics.startTime;
                const memory = process.memoryUsage();
                const health = {
                    status: 'healthy',
                    uptime: Math.floor(uptime / 1000),
                    metrics: {
                        ...metrics,
                        memoryUsage: {
                            heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
                            heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
                            rss: Math.round(memory.rss / 1024 / 1024)
                        },
                        system: {
                            platform: process.platform,
                            arch: process.arch,
                            cpus: os.cpus().length,
                            loadavg: os.loadavg()
                        }
                    }
                };
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify(health, null, 2));
            } else {
                res.writeHead(405);
                res.end('Method Not Allowed');
            }
        });

        this.healthServer.listen(this.options.metricsPort, () => {
            console.log(`Health check server listening on port ${this.options.metricsPort}`);
        });

        // Periodically log metrics.
        this.metricsInterval = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - this.lastMetricsLog) / 1000;
            const framesPerSec = Math.round(metrics.totalFramesProcessed / elapsed);
            const bytesPerSec = Math.round(metrics.totalBytesProcessed / elapsed);
            console.log('\n=== Server Metrics ===');
            console.log(`Uptime: ${Math.floor((now - metrics.startTime) / 1000)}s`);
            console.log(`Connections: ${metrics.activeConnections} active (peak: ${metrics.maxActiveConnections}) / ${metrics.totalConnections} total (peak: ${metrics.maxConcurrentConnections})`);
            console.log(`Processing: ${framesPerSec} frames/s, ${(bytesPerSec / 1024).toFixed(1)} KB/s`);
            console.log(`Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap, ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB total`);
            console.log(`System Load: ${os.loadavg()[0].toFixed(2)} (1m avg)`);
            if (metrics.errors > 0) {
                console.log(`Errors: ${metrics.errors}`);
            }
            console.log('==================\n');

            // Reset counters for the next interval.
            metrics.totalFramesProcessed = 0;
            metrics.totalBytesProcessed = 0;
            metrics.errors = 0;
            this.lastMetricsLog = now;
        }, this.options.metricsInterval);

        this.setupSignalHandlers();
    }

    setupSignalHandlers() {
        const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        signals.forEach(signal => {
            process.on(signal, async () => {
                console.log(`Received ${signal}, shutting down gracefully...`);
                await this.stop();
                process.exit(0);
            });
        });
        process.on('message', async (msg) => {
            if (msg === 'shutdown') {
                console.log('Received shutdown message from PM2, stopping gracefully...');
                await this.stop();
                process.exit(0);
            }
        });
        if (process.send) {
            process.send('ready');
        }
    }

    async stop() {
        console.log('Stopping server...');
        if (this.server) {
            this.server.close();
        }
        if (this.healthServer) {
            this.healthServer.close();
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        // Wait a short time for active connections to close.
        const maxWait = 10000;
        const startTime = Date.now();
        while (metrics.activeConnections > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('Server stopped');
        process.exit(0);
    }
}

if (require.main === module) {
    const modelPath = process.env.KRISP_MODEL_PATH;
    if (!modelPath) {
        console.error('Error: KRISP_MODEL_PATH environment variable is not set');
        process.exit(1);
    }
    const port = parseInt(process.env.PORT, 10) || 3344;
    const metricsPort = parseInt(process.env.METRICS_PORT, 10) || port + 1;
    const maxConnections = parseInt(process.env.MAX_CONNECTIONS, 10) || 10;
    const server = new AudioServer(port, modelPath, {maxConnections, metricsPort});
    server.start();
}

module.exports = AudioServer;
