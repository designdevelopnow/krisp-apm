const fs = require('fs');
const { WaveFile } = require('wavefile');
const KrispProcessor = require('./krisp-processor');

class AudioProcessor {
    constructor(modelPath, sampleRate = 8000) {
        this.processor = new KrispProcessor(modelPath, sampleRate);
        this.processor.initialize();
        this.sampleRate = sampleRate;
    }

    processFile(inputFile, outputFile) {
        // Read input WAV file
        const wav = new WaveFile(fs.readFileSync(inputFile));
        
        // Validate format
        if (wav.fmt.numChannels !== 1) {
            throw new Error('Only mono audio is supported');
        }
        
        if (wav.fmt.audioFormat !== 1 || wav.fmt.bitsPerSample !== 16) {
            throw new Error('Only 16-bit PCM audio is supported');
        }

        if (wav.fmt.sampleRate !== this.sampleRate) {
            throw new Error(`Input file must be ${this.sampleRate}Hz`);
        }

        // Get raw PCM data
        const inputData = Buffer.from(wav.data.samples);
        const outputBuffer = Buffer.alloc(inputData.length);

        // Process audio
        this.processor.processFrames(inputData, outputBuffer);

        // Create output WAV file
        const outputWav = new WaveFile();
        const samples = new Int16Array(outputBuffer.length / 2);
        for (let i = 0; i < outputBuffer.length; i += 2) {
            samples[i/2] = outputBuffer.readInt16LE(i);
        }
        
        outputWav.fromScratch(1, this.sampleRate, '16', samples);
        fs.writeFileSync(outputFile, outputWav.toBuffer());
    }
}

// Run as command-line tool if called directly
if (require.main === module) {
    const fs = require('fs');
    const { Command } = require('commander');
    const KrispProcessor = require('./krisp-processor');

    const program = new Command();

    program
        .name('node-js-krisp')
        .description('Krisp NodeJS audio processing sample')
        .requiredOption('-o --output-wav <path>', 'Path to the processed WAV file')
        .requiredOption('-i --input-wav <path>', 'Path to the input WAV file')
        .requiredOption('-m --model <model>', 'Path to the model file')
        .option('-n --noise-suppression <level>', 'Noise suppression level (0-100)', '100');

    program.parse(process.argv);
    const options = program.opts();

    function readWavFileSync(filePath) {
        try {
            const wav = new WaveFile(fs.readFileSync(filePath));
            
            if (wav.fmt.numChannels !== 1) {
                throw new Error(`Unsupported number of channels: ${wav.fmt.numChannels}. Only mono is supported.`);
            }
            
            if (wav.fmt.audioFormat !== 1 || wav.fmt.bitsPerSample !== 16) {
                throw new Error('Only 16-bit PCM audio is supported');
            }
            
            return {
                audioData: wav.data.samples,
                sampleRate: wav.fmt.sampleRate
            };
        } catch (err) {
            throw new Error(`Error reading WAV file: ${err.message}`);
        }
    }

    function writeWavFile(filePath, processedAudio, sampleRate) {
        const wav = new WaveFile();
        const samples = new Int16Array(processedAudio.length / 2);
        for (let i = 0; i < processedAudio.length; i += 2) {
            samples[i/2] = processedAudio.readInt16LE(i);
        }
        wav.fromScratch(1, sampleRate, '16', samples);
        fs.writeFileSync(filePath, wav.toBuffer());
    }

    try {
        console.log('Input WAV:', options.inputWav);
        console.log('Output WAV:', options.outputWav);
        console.log('Model:', options.model);
        console.log('Noise suppression level:', options.noiseSuppression);

        // Read input WAV file
        const { audioData, sampleRate } = readWavFileSync(options.inputWav);
        console.log('Sample rate:', sampleRate);

        // Create and initialize Krisp processor
        const processor = new KrispProcessor(options.model, sampleRate, parseFloat(options.noiseSuppression));
        processor.initialize();

        // Process audio
        const outputBuffer = Buffer.alloc(audioData.length);
        processor.processFrames(audioData, outputBuffer);

        // Save processed audio
        writeWavFile(options.outputWav, outputBuffer, sampleRate);

        console.log('Audio processing completed successfully');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

module.exports = AudioProcessor;