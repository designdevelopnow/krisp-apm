const net = require('net');
const fs = require('fs');
const { WaveFile } = require('wavefile');

class AudioClient {
    constructor(host = 'localhost', port = 3000) {
        this.host = host;
        this.port = port;
        this.client = new net.Socket();
        this.startTime = null;
        this.totalFrames = 0;
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

            // Handle processed audio data from server
            this.client.on('data', (data) => {
                totalBytesReceived += data.length;
                processedData = Buffer.concat([processedData, data]);
            });

            this.client.on('close', () => {
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

                    resolve();
                } catch (err) {
                    reject(new Error(`Error writing WAV file: ${err.message}`));
                }
            });

            this.client.on('error', (err) => {
                reject(new Error(`Connection error: ${err.message}`));
            });

            // Connect to server and send audio data
            this.client.connect(this.port, this.host, () => {
                this.startTime = process.hrtime.bigint();

                // Send audio data in frames
                for (let i = 0; i < audioData.length; i += bytesPerFrame) {
                    const frame = audioData.slice(i, i + bytesPerFrame);
                    if (frame.length === bytesPerFrame) {
                        this.client.write(frame);
                        totalBytesSent += frame.length;
                        this.totalFrames++;
                    }
                }

                // Handle last frame if it's not complete
                const remaining = audioData.length % bytesPerFrame;
                if (remaining > 0) {
                    const lastFrame = Buffer.alloc(bytesPerFrame);
                    audioData.copy(lastFrame, 0, audioData.length - remaining);
                    this.client.write(lastFrame);
                    totalBytesSent += bytesPerFrame;
                    this.totalFrames++;
                }

                // Signal end of audio data
                this.client.end();
            });
        });
    }
}

// Run as command-line tool if called directly
if (require.main === module) {
    if (process.argv.length !== 4) {
        console.error('Usage: node test-client.js <input-wav> <output-wav>');
        process.exit(1);
    }

    const inputFile = process.argv[2];
    const outputFile = process.argv[3];

    const client = new AudioClient();
    client.processFile(inputFile, outputFile)
        .catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
}

module.exports = AudioClient;
