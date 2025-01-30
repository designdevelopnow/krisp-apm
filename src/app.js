const fs = require('fs');
const addon = require('../build/Release/caretalk-apm-krisp.node');
const WaveFile = require('wavefile').WaveFile;

const { Command } = require('commander');
const program = new Command();

program
    .name('node-js-krisp')
    .description('Krisp NodeJS audio processing sample')
    .requiredOption('-o --output-wav <path>', 'Path to the processed WAV file')
    .requiredOption('-i --input-wav <path>', 'Path to the input WAV file')
    .requiredOption('-m --model <model>', 'Path to the model file')
    .option('-n --noise-suppression <level>', 'Noise suppression level (0-100)', '100');

program.parse(process.argv)

const options = program.opts();

const inputWavPath = options.inputWav;
const outputWavPath = options.outputWav;
const modelPath = options.model;
const noiseSuppressionLevel = parseFloat(options.noiseSuppression);

console.log('Input WAV:', inputWavPath);
console.log('Output WAV:', outputWavPath);
console.log('Model:', modelPath);
console.log('Noise suppression level:', noiseSuppressionLevel);

function readFileSync(filePath) {
    try {
        const buffer = fs.readFileSync(filePath);
        return buffer;
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`Error: file at "${filePath}" does not exist.`)
        }
        else if (err.code === 'EACCES') {
            throw new Error(`Error: can't access the "${filePath}".`);
        }
        else {
            throw new Error(`Error: reading "${filePath}" file.`);
        }
    }
}

function readWavFileSync(filePath) {
    const buffer = readFileSync(filePath);
    let wav;
    try {
        wav = new WaveFile(buffer);
    }
    catch (err) {
        throw new Error(`${err}\nError decoding ${filePath} WAV file`);
    }
    if (wav.fmt.numChannels !== 1) {
        throw new Error(`Unsupported number of channels: ${wav.fmt.numChannels}. Only mono is supported.`);
    }
    const sampleRate = wav.fmt.sampleRate;
    console.log("Sample rate is", sampleRate)
    const WAV_PCM_TYPE = 1;
    const WAV_FLOAT_TYPE = 3;
    if (wav.fmt.audioFormat == WAV_FLOAT_TYPE && wav.fmt.bitsPerSample == 32) {
        const sampleSize = 4;
        const audioData = wav.data.samples;
        return [audioData, sampleRate, sampleSize, "FLOAT32"];
    }
    else if (wav.fmt.audioFormat == WAV_PCM_TYPE && wav.fmt.bitsPerSample == 16) {
        const sampleSize = 2;
        const audioData = wav.data.samples;
        return [audioData, sampleRate, sampleSize, "PCM16"];
    }
    else {
        throw new Error(`Unsupported WAV format: ${wav.fmt.audioFormat} and depth: ${wav.fmt.bitsPerSample}\nonly PCM16 and FLOAT32 are supported`);
    }
}

function getFrameSize(sampleRate) {
    const FRAME_DURATION_MS = 20;
    return Math.floor((FRAME_DURATION_MS / 1000) * sampleRate);
}

function audioDataToWavFile(outputWavPath, processedAudio, sampleRate, sampleType) {
    const processedWav = new WaveFile();
    if (sampleType === "PCM16") {
        const typedSamples = new Int16Array(processedAudio.buffer, processedAudio.byteOffset, processedAudio.length / 2);
        processedWav.fromScratch(1, sampleRate, '16', typedSamples);
    } else if (sampleType === "FLOAT32") {
        const typedSamples = new Float32Array(processedAudio.buffer, processedAudio.byteOffset, processedAudio.length / 4);
        processedWav.fromScratch(1, sampleRate, '32f', typedSamples);
    } else {
        throw new Error("Unsupported sample type");
    }
    fs.writeFileSync(outputWavPath, processedWav.toBuffer());
}

function createKrispAudioProcessor(sampleType) {
    switch (sampleType) {
        case "PCM16":
            return new addon.KrispAudioProcessorPcm16();
        case "FLOAT32":
            return new addon.KrispAudioProcessorPcmFloat();
        default:
            throw new Error("Unexpected sample type: " + sampleType);
    }
}

function processAudio(inputWavPath, outputWavPath) {
    const [audioData, sampleRate, sampleSize, sampleType] = readWavFileSync(inputWavPath);
    let KrispAudioProcessor;
    switch (sampleType) {
        case "PCM16":
            KrispAudioProcessor = addon.KrispAudioProcessorPcm16;
            break;
        case "FLOAT32":
            KrispAudioProcessor = addon.KrispAudioProcessorPcmFloat;
            break;
        default:
            throw new Error("Unexpected sample type: " + sampleType);
    }
    const audioProcessor = createKrispAudioProcessor(sampleType);
    audioProcessor.configure(modelPath, sampleRate, noiseSuppressionLevel);
    const frameSizeInSamples = getFrameSize(sampleRate);
    const frameSizeInBytes = frameSizeInSamples * sampleSize;
    const numberOfFrames = Math.floor(audioData.length / frameSizeInBytes);
    if (audioData.length % frameSizeInBytes) {
    }
    const processedAudio = Buffer.alloc(numberOfFrames * frameSizeInBytes);
    for (let i = 0; i < numberOfFrames; i++) {
        const start = i * frameSizeInBytes;
        const end = start + frameSizeInBytes;
        const frame = audioData.subarray(start, end);
        const processedFrame = processedAudio.slice(start, end);
        audioProcessor.processFrames(frame, processedFrame);
    }
    audioDataToWavFile(outputWavPath, processedAudio, sampleRate, sampleType);
}

try {
    processAudio(inputWavPath, outputWavPath);
}
catch (err) {
    console.log(err);
    process.exit(1);
}