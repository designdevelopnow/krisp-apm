const net = require('net');
const fs = require('fs');
const { WaveFile } = require('wavefile');

class AudioClient {
    constructor(host = 'localhost', port = 3344) {
        this.host = host;
        this.port = port;
        this.client = new net.Socket();
        this.startTime = null;
        this.totalFrames = 0;
        this.connected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
    }

    async processFile(inputFile, outputFile) {
        return new Promise((resolve, reject) => {
            // Read input WAV file
            let wav;
            try {
                wav = new WaveFile(fs.readFileSync(inputFile));
                if (wav.fmt.numChannels !== 1) {
                    throw new Error(`Unsupported number of channels: ${wav.fmt.numChannels}. Only mono is supported.`);
                }
                if (wav.fmt.audioFormat !== 1 || wav.fmt.bitsPerSample !== 16) {
                    throw new Error('Only 16-bit PCM audio is supported');
                }
            } catch (err) {
                reject(new Error(`Error reading WAV file: ${err.message}`));
                return;
            }

            // Create output directory if it doesn't exist
            const outputDir = outputFile.substring(0, outputFile.lastIndexOf('/'));
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Calculate frame size (20ms of audio)
            const sampleRate = wav.fmt.sampleRate;
            const samplesPerFrame = Math.floor(sampleRate * 0.02); // 20ms
            const bytesPerFrame = samplesPerFrame * 2; // 2 bytes per sample for PCM16
            const audioData = Buffer.from(wav.data.samples);

            let processedData = Buffer.alloc(0);
            let totalBytesReceived = 0;
            let totalBytesSent = 0;
            let frameIndex = 0;

            const connect = () => {
                if (this.retryCount >= this.maxRetries) {
                    reject(new Error('Max retries exceeded'));
                    return;
                }

                this.client.connect(this.port, this.host, () => {
                    this.connected = true;
                    this.startTime = process.hrtime.bigint();
                    
                    // Send audio data in frames with delay to prevent overwhelming the server
                    const sendFrame = () => {
                        if (!this.connected) return;

                        const frame = audioData.slice(frameIndex * bytesPerFrame, (frameIndex + 1) * bytesPerFrame);
                        if (frame.length === bytesPerFrame) {
                            this.client.write(frame);
                            totalBytesSent += frame.length;
                            this.totalFrames++;
                            frameIndex++;

                            if (frameIndex * bytesPerFrame < audioData.length) {
                                // Add small delay between frames
                                setTimeout(sendFrame, 1);
                            } else {
                                // All frames sent
                                this.client.end();
                            }
                        } else {
                            // Handle last incomplete frame
                            if (frame.length > 0) {
                                const lastFrame = Buffer.alloc(bytesPerFrame);
                                frame.copy(lastFrame);
                                this.client.write(lastFrame);
                                totalBytesSent += bytesPerFrame;
                                this.totalFrames++;
                            }
                            this.client.end();
                        }
                    };

                    // Start sending frames
                    sendFrame();
                });
            };

            // Handle processed audio data from server
            this.client.on('data', (data) => {
                totalBytesReceived += data.length;
                processedData = Buffer.concat([processedData, data]);
            });

            this.client.on('close', () => {
                this.connected = false;
                if (processedData.length === 0 && this.retryCount < this.maxRetries) {
                    console.log('Connection closed without data, retrying...');
                    this.retryCount++;
                    setTimeout(connect, 1000 * this.retryCount);
                    return;
                }

                try {
                    // Create output WAV file
                    const outWav = new WaveFile();
                    const samples = new Int16Array(processedData.length / 2);
                    for (let i = 0; i < processedData.length; i += 2) {
                        samples[i/2] = processedData.readInt16LE(i);
                    }
                    outWav.fromScratch(1, sampleRate, '16', samples);
                    fs.writeFileSync(outputFile, outWav.toBuffer());

                    const endTime = process.hrtime.bigint();
                    const totalTimeMs = Number(endTime - this.startTime) / 1_000_000;
                    const avgLatency = totalTimeMs / this.totalFrames;

                    console.log(`\nProcessing complete:`);
                    console.log(`Total frames: ${this.totalFrames}`);
                    console.log(`Total time: ${totalTimeMs.toFixed(2)}ms`);
                    console.log(`Average latency: ${avgLatency.toFixed(2)}ms per frame`);
                    console.log(`Total bytes sent: ${totalBytesSent}`);
                    console.log(`Total bytes received: ${totalBytesReceived}`);
                    console.log(`Output file generated: ${outputFile}`);

                    resolve();
                } catch (err) {
                    reject(new Error(`Error writing WAV file: ${err.message}`));
                }
            });

            this.client.on('error', (err) => {
                if (!this.connected && this.retryCount < this.maxRetries) {
                    console.log('Connection error, retrying...');
                    this.retryCount++;
                    setTimeout(connect, 1000 * this.retryCount);
                    return;
                }
                reject(new Error(`Connection error: ${err.message}`));
            });

            // Start connection
            connect();
        });
    }
}

// Run as command-line tool if called directly
if (require.main === module) {
    if (process.argv.length < 4) {
        console.error('Usage: node test-client.js <input-wav> <output-wav>  [port] [host]');
        process.exit(1);
    }

    const inputFile = process.argv[2];
    const outputFile = process.argv[3];
    const port = process.argv[4] ?? '3344';
    const host = process.argv[5] ?? 'localhost';

    const client = new AudioClient(host, port);
    client.processFile(inputFile, outputFile)
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}

module.exports = AudioClient;
