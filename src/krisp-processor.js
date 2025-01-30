const addon = require('../build/Release/caretalk-apm-krisp.node');

class KrispProcessor {
    constructor(modelPath, sampleRate, noiseSuppressionLevel = 100) {
        this.modelPath = modelPath;
        this.sampleRate = sampleRate;
        this.noiseSuppressionLevel = noiseSuppressionLevel;
        this.processor = null;
        this.sampleSize = 2; // PCM16 = 2 bytes per sample
    }

    getFrameSize() {
        return Math.floor(this.sampleRate * 0.01); // 10ms frame size
    }

    initialize() {
        if (this.processor) {
            throw new Error('Krisp processor is already initialized');
        }

        this.processor = new addon.KrispAudioProcessorPcm16();
        this.processor.configure(this.modelPath, this.sampleRate, this.noiseSuppressionLevel);
    }

    processFrames(audioData) {
        if (!this.processor) {
            throw new Error('Krisp processor is not initialized');
        }

        const frameSizeInSamples = this.getFrameSize();
        const frameSizeInBytes = frameSizeInSamples * this.sampleSize;
        const numberOfFrames = Math.floor(audioData.length / frameSizeInBytes);
        const processedAudio = Buffer.alloc(numberOfFrames * frameSizeInBytes);
        
        for (let i = 0; i < numberOfFrames; i++) {
            const start = i * frameSizeInBytes;
            const end = start + frameSizeInBytes;
            const frame = audioData.subarray(start, end);
            const processedFrame = processedAudio.slice(start, end);
            this.processor.processFrames(frame, processedFrame);
        }
        
        return processedAudio;
    }
}

module.exports = KrispProcessor;
