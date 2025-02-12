const addon = require('../../build/Release/caretalk-apm-krisp.node');

class KrispProcessor {
    constructor(modelPath, sampleRate, noiseSuppressionLevel = 100) {
        this.modelPath = modelPath;
        this.sampleRate = sampleRate;
        this.noiseSuppressionLevel = noiseSuppressionLevel;
        this.processor = null;
        this.sampleSize = 2; // PCM16 = 2 bytes per sample
    }

    // Returns the number of samples for a 10ms frame
    getFrameSize() {
        return Math.floor(this.sampleRate * 0.01);
    }

    initialize() {
        if (this.processor) {
            throw new Error('Krisp processor is already initialized');
        }

        if (!addon.KrispAudioProcessorPcm16) {
            throw new Error('Native addon not properly loaded');
        }

        this.processor = new addon.KrispAudioProcessorPcm16();
        this.processor.configure(this.modelPath, this.sampleRate, this.noiseSuppressionLevel);
    }

    processFrames(inputBuffer, outputBuffer) {
        if (!this.processor) {
            throw new Error('Krisp processor is not initialized');
        }

        if (!Buffer.isBuffer(inputBuffer) || !Buffer.isBuffer(outputBuffer)) {
            throw new Error('Input and output must be Buffer objects');
        }

        if (inputBuffer.length !== outputBuffer.length) {
            throw new Error('Input and output buffers must have the same length');
        }

        const frameSizeInSamples = this.getFrameSize();
        const frameSizeInBytes = frameSizeInSamples * this.sampleSize;

        if (inputBuffer.length < frameSizeInBytes) {
            throw new Error('Input buffer too small for one frame');
        }

        // Process frames directly into output buffer
        this.processor.processFrames(inputBuffer, outputBuffer);
    }
}

module.exports = KrispProcessor;
