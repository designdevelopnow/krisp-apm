const net = require('net');
const fs = require('fs');
const { WaveFile } = require('wavefile');
const KrispProcessor = require('./krisp-processor');

class AudioStreamProcessor {
    constructor(socket, modelPath, sampleRate = 8000) {
        this.socket = socket;
        this.processor = new KrispProcessor(modelPath, sampleRate);
        this.processor.initialize();

        // Calculate frame sizes
        const samplesPerFrame = Math.floor(sampleRate * 0.01); // 10ms for processing
        this.processingFrameSize = samplesPerFrame * 2; // 2 bytes per sample for PCM16
        this.outputFrameSize = this.processingFrameSize * 2; // 20ms for output
        
        this.inputBuffer = Buffer.alloc(0);  // For incoming 10ms frames
        this.outputBuffer = Buffer.alloc(0);  // For outgoing 20ms frames
        
        // Debug buffers to save raw audio
        this.rawInputBuffer = Buffer.alloc(0);
        this.processedBuffer = Buffer.alloc(0);
        
        this.sampleRate = sampleRate;
        this.totalBytesReceived = 0;
        this.totalBytesSent = 0;
        this.framesProcessed = 0;
    }

    debugSaveWav(buffer, filename) {
        const wav = new WaveFile();
        const samples = new Int16Array(buffer.length / 2);
        for (let i = 0; i < buffer.length; i += 2) {
            samples[i/2] = buffer.readInt16LE(i);
        }
        wav.fromScratch(1, this.sampleRate, '16', samples);
        fs.writeFileSync(filename, wav.toBuffer());
    }

    processData(data) {
        this.totalBytesReceived += data.length;
        this.rawInputBuffer = Buffer.concat([this.rawInputBuffer, data]);
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
            
            // Save processed frames for debug
            this.processedBuffer = Buffer.concat([this.processedBuffer, processedFrames]);
            
            // Add processed frames to output buffer
            this.outputBuffer = Buffer.concat([this.outputBuffer, processedFrames]);

            // Send complete 20ms chunks from output buffer
            const numCompleteOutputFrames = Math.floor(this.outputBuffer.length / this.outputFrameSize);
            const bytesToSend = numCompleteOutputFrames * this.outputFrameSize;
            
            if (bytesToSend > 0) {
                const outputFrames = this.outputBuffer.slice(0, bytesToSend);
                this.socket.write(outputFrames);
                this.totalBytesSent += bytesToSend;
                
                // Keep remaining partial frame in output buffer
                this.outputBuffer = this.outputBuffer.slice(bytesToSend);
            }

            // Keep remaining partial frame in input buffer
            this.inputBuffer = this.inputBuffer.slice(bytesToProcess);
        }
    }

    flush() {
        // Process any remaining data in input buffer
        if (this.inputBuffer.length > 0) {
            const paddedBuffer = Buffer.alloc(this.processingFrameSize);
            this.inputBuffer.copy(paddedBuffer);
            
            const processedFrame = Buffer.alloc(this.processingFrameSize);
            this.processor.processFrames(paddedBuffer, processedFrame);
            
            // Add to output buffer
            const validBytes = this.inputBuffer.length;
            this.outputBuffer = Buffer.concat([this.outputBuffer, processedFrame.slice(0, validBytes)]);
            this.processedBuffer = Buffer.concat([this.processedBuffer, processedFrame.slice(0, validBytes)]);
        }

        // Send any remaining data in output buffer
        if (this.outputBuffer.length > 0) {
            // If we have more than 10ms but less than 20ms, pad to 20ms
            if (this.outputBuffer.length > this.processingFrameSize) {
                const paddedBuffer = Buffer.alloc(this.outputFrameSize);
                this.outputBuffer.copy(paddedBuffer);
                this.socket.write(paddedBuffer.slice(0, this.outputBuffer.length));
            } else {
                // If we have less than 10ms, just send what we have
                this.socket.write(this.outputBuffer);
            }
            
            this.totalBytesSent += this.outputBuffer.length;
        }
        

        console.log(`\nProcessing complete:`);
        console.log(`Total bytes received: ${this.totalBytesReceived}`);
        console.log(`Total bytes sent: ${this.totalBytesSent}`);
        console.log(`Total frames processed: ${this.framesProcessed}`);
    }
}

class AudioServer {
    constructor(port, modelPath) {
        this.port = port;
        this.modelPath = modelPath;
        this.server = null;
    }

    start() {
        this.server = net.createServer((socket) => {
            console.log('Client connected');

            const processor = new AudioStreamProcessor(socket, this.modelPath);

            socket.on('data', (data) => {
                try {
                    processor.processData(data);
                } catch (err) {
                    console.error('Error processing audio:', err);
                    socket.end();
                }
            });

            socket.on('end', () => {
                try {
                    processor.flush();
                    console.log('Client disconnected');
                } catch (err) {
                    console.error('Error during flush:', err);
                }
            });

            socket.on('error', (err) => {
                console.error('Socket error:', err);
            });
        });

        this.server.on('error', (err) => {
            console.error('Server error:', err);
        });

        this.server.listen(this.port, () => {
            console.log(`Audio processing server listening on port ${this.port}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

// Start the server if this file is run directly
if (require.main === module) {
    const modelPath = process.env.KRISP_MODEL_PATH;
    
    if(!modelPath) {
        console.error('Error: KRISP_MODEL_PATH environment variable is not set');
        process.exit(1);
    }

    const port = parseInt(process.env.PORT) || 3000;

    const server = new AudioServer(port, modelPath);
    server.start();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down server...');
        server.stop();
        process.exit(0);
    });
}

module.exports = AudioServer;
