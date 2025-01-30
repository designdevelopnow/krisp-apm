const fs = require('fs');
const WaveFile = require('wavefile').WaveFile;
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
    const samples = new Int16Array(processedAudio.buffer, processedAudio.byteOffset, processedAudio.length / 2);
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
    const processedAudio = processor.processFrames(audioData);

    // Save processed audio
    writeWavFile(options.outputWav, processedAudio, sampleRate);

    console.log('Audio processing completed successfully');
} catch (err) {
    console.error(err.message);
    process.exit(1);
}