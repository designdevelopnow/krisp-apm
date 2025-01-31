const net = require('net');
const fs = require('fs');
const KrispProcessor = require('../lib/krisp-processor');
const os = require('os');
const http = require('http');

// Server metrics
const metrics = {
    activeConnections: 0,
    totalConnections: 0,
    totalBytesProcessed: 0,
    totalFramesProcessed: 0,
    errors: 0,
    startTime: Date.now(),
    maxConcurrentConnections: 0,  // Track peak total connections
    maxActiveConnections: 0       // Track peak active connections
};

class AudioStreamProcessor {
    constructor(socket, modelPath, sampleRate = 8000) {
        this.socket = socket;
        this.processor = null;
        this.modelPath = modelPath;
        this.sampleRate = sampleRate;
        this.closed = false;

        // Calculate frame sizes
        const samplesPerFrame = Math.floor(sampleRate * 0.01); // 10ms for processing
        this.processingFrameSize = samplesPerFrame * 2; // 2 bytes per sample for PCM16
        this.outputFrameSize = this.processingFrameSize * 2; // 20ms for output
        
        this.inputBuffer = Buffer.alloc(0);  // For incoming 10ms frames
        this.outputBuffer = Buffer.alloc(0);  // For outgoing 20ms frames
        
        this.totalBytesReceived = 0;
        this.totalBytesSent = 0;
        this.framesProcessed = 0;
        
        // Add backpressure handling
        this.socket.pause(); // Start paused
        this.socket.on('drain', () => {
            if (!this.closed) {
                this.socket.resume();
            }
        });
    }

    async initialize() {
        try {
            this.processor = new KrispProcessor(this.modelPath, this.sampleRate);
            await this.processor.initialize();
            this.socket.resume(); // Start receiving data
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
            // Check if socket is still connected
            if (!this.socket.writable) {
                this.close();
                return;
            }

            this.totalBytesReceived += data.length;
            metrics.totalBytesProcessed += data.length;
            this.inputBuffer = Buffer.concat([this.inputBuffer, data]);

            // Process complete 10ms frames
            const numCompleteFrames = Math.floor(this.inputBuffer.length / this.processingFrameSize);
            const bytesToProcess = numCompleteFrames * this.processingFrameSize;

            if (bytesToProcess > 0) {
                // Process all complete frames
                const inputFrames = this.inputBuffer.slice(0, bytesToProcess);
                const processedFrames = Buffer.alloc(bytesToProcess);
                
                this.processor.processFrames(inputFrames, processedFrames);
                this.framesProcessed += numCompleteFrames;
                metrics.totalFramesProcessed += numCompleteFrames;
                
                // Add processed frames to output buffer
                this.outputBuffer = Buffer.concat([this.outputBuffer, processedFrames]);

                // Send complete 20ms chunks from output buffer
                const numCompleteOutputFrames = Math.floor(this.outputBuffer.length / this.outputFrameSize);
                const bytesToSend = numCompleteOutputFrames * this.outputFrameSize;
                
                if (bytesToSend > 0 && this.socket.writable) {
                    try {
                        const outputFrames = this.outputBuffer.slice(0, bytesToSend);
                        const canWrite = this.socket.write(outputFrames);
                        this.totalBytesSent += bytesToSend;
                        
                        // Handle backpressure
                        if (!canWrite && !this.closed) {
                            this.socket.pause();
                        }
                    } catch (writeErr) {
                        this.close();
                        return;
                    }
                    
                    // Keep remaining partial frame in output buffer
                    this.outputBuffer = this.outputBuffer.slice(bytesToSend);
                }

                // Keep remaining partial frame in input buffer
                this.inputBuffer = this.inputBuffer.slice(bytesToProcess);
            }
        } catch (err) {
            metrics.errors++;
            this.close();
        }
    }

    close() {
        if (!this.closed) {
            this.closed = true;
            try {
                // Clean up resources
                if (this.processor) {
                    this.processor = null;
                }

                // Only try to end socket if it's still open
                if (this.socket.writable) {
                    this.socket.end();
                }

                metrics.activeConnections--;
                // Update max active connections after decrementing
                metrics.maxActiveConnections = Math.max(metrics.maxActiveConnections, metrics.activeConnections);
            } catch (err) {
                metrics.errors++;
                // Force socket destruction if normal close fails
                try {
                    this.socket.destroy();
                } catch (destroyErr) {}
            }
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
            healthCheckPort: options.healthCheckPort || (port + 1),
            metricsInterval: options.metricsInterval || 5000, // 5 seconds for more frequent updates
            ...options
        };
        this.healthServer = null;
        this.metricsInterval = null;
        this.lastMetricsLog = Date.now();
    }

    start() {
        // Validate model path
        if (!fs.existsSync(this.modelPath)) {
            throw new Error(`Model path does not exist: ${this.modelPath}`);
        }

        // Start main server
        this.server = net.createServer(async (socket) => {
            try {
                if (metrics.activeConnections >= this.options.maxConnections) {
                    socket.end();
                    return;
                }

                metrics.activeConnections++;
                metrics.totalConnections++;
                metrics.maxConcurrentConnections = Math.max(metrics.maxConcurrentConnections, metrics.totalConnections);
                metrics.maxActiveConnections = Math.max(metrics.maxActiveConnections, metrics.activeConnections);
                
                const processor = new AudioStreamProcessor(socket, this.modelPath);
                
                // Set socket timeout
                socket.setTimeout(30000);
                
                socket.on('timeout', () => {
                    processor.close();
                });

                // Initialize processor
                if (!await processor.initialize()) {
                    processor.close();
                    return;
                }

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

            } catch (err) {
                metrics.errors++;
                socket.end();
            }
        });

        // Error handling for the server
        this.server.on('error', (err) => {
            console.error('Server error:', err);
            metrics.errors++;
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${this.port} is already in use`);
                process.exit(1);
            }
        });

        // Start health check server (HTTP)
        this.healthServer = http.createServer((req, res) => {
            if (req.method === 'GET') {
                const health = this.getHealthStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(health, null, 2));
            } else {
                res.writeHead(405);
                res.end('Method Not Allowed');
            }
        });

        // Start servers
        this.server.listen(this.port, () => {
            console.log(`Audio processing server listening on port ${this.port}`);
            console.log(`Health check server listening on port ${this.options.healthCheckPort}`);
            console.log(`Max connections: ${this.options.maxConnections}`);
        });

        this.healthServer.listen(this.options.healthCheckPort);

        // Start metrics reporting more frequently
        this.metricsInterval = setInterval(() => {
            this.logMetrics();
        }, this.options.metricsInterval);

        // Handle process signals
        this.setupSignalHandlers();
    }

    getHealthStatus() {
        const uptime = Date.now() - metrics.startTime;
        const memory = process.memoryUsage();
        return {
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
    }

    logMetrics() {
        const now = Date.now();
        const health = this.getHealthStatus();
        
        // Calculate rates
        const elapsed = (now - this.lastMetricsLog) / 1000; // seconds
        const framesPerSec = Math.round(metrics.totalFramesProcessed / elapsed);
        const bytesPerSec = Math.round(metrics.totalBytesProcessed / elapsed);
        
        console.log('\n=== Server Metrics ===');
        console.log(`Uptime: ${health.uptime}s`);
        console.log(`Connections: ${metrics.activeConnections} active (peak: ${metrics.maxActiveConnections}) / ${metrics.totalConnections} total (peak: ${metrics.maxConcurrentConnections})`);
        console.log(`Processing: ${framesPerSec} frames/s, ${(bytesPerSec / 1024).toFixed(1)} KB/s`);
        console.log(`Memory: ${health.metrics.memoryUsage.heapUsed}MB heap, ${health.metrics.memoryUsage.rss}MB total`);
        console.log(`System Load: ${health.metrics.system.loadavg[0].toFixed(2)} (1m avg)`);
        if (metrics.errors > 0) {
            console.log(`Errors: ${metrics.errors}`);
        }
        console.log('==================\n');

        // Reset counters for rate calculation
        metrics.totalFramesProcessed = 0;
        metrics.totalBytesProcessed = 0;
        metrics.errors = 0;
        this.lastMetricsLog = now;
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

        // PM2 graceful shutdown support
        process.on('message', async (msg) => {
            if (msg === 'shutdown') {
                console.log('Received shutdown message from PM2, stopping gracefully...');
                await this.stop();
                process.exit(0);
            }
        });

        // Signal ready to PM2
        if (process.send) {
            process.send('ready');
        }
    }

    async stop() {
        console.log('Stopping server...');
        
        // Stop accepting new connections
        if (this.server) {
            this.server.close();
        }
        if (this.healthServer) {
            this.healthServer.close();
        }
        
        // Clear metrics interval
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }

        // Wait for active connections to finish
        const maxWait = 10000; // 10 seconds
        const startTime = Date.now();
        
        while (metrics.activeConnections > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('Server stopped');
        process.exit(0);
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const modelPath = process.env.KRISP_MODEL_PATH
    
    if(!modelPath) {
        console.error('Error: KRISP_MODEL_PATH environment variable is not set');
        process.exit(1);
    }

    const port = parseInt(process.env.PORT) || 3000;
    const maxConnections = parseInt(process.env.MAX_CONNECTIONS) || 10;

    const server = new AudioServer(port, modelPath, {
        maxConnections,
        healthCheckPort: port + 1,
        metricsInterval: 5000
    });

    server.start();
}

module.exports = AudioServer;
