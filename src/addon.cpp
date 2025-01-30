#include <iostream>
#include <locale>
#include <codecvt>

#define NAPI_DISABLE_CPP_EXCEPTIONS 1
#include <napi.h>

#include <krisp-audio-sdk.hpp>
#include <krisp-audio-sdk-nc.hpp>

using Krisp::AudioSdk::NcSessionConfig;
using Krisp::AudioSdk::Nc;
using Krisp::AudioSdk::ModelInfo;
using Krisp::AudioSdk::FrameDuration;
using Krisp::AudioSdk::SamplingRate;
using Krisp::AudioSdk::globalInit;
using Krisp::AudioSdk::globalDestroy;

template <class SampleType>
class KrispAudioProcessor : public Napi::ObjectWrap<KrispAudioProcessor<SampleType>> {
public:
    ~KrispAudioProcessor() override {
        if (m_ncSession) {
            try {
                m_ncSession.reset();
            } catch (const std::exception& e) {
                std::cerr << "Error during NC session cleanup: " << e.what() << std::endl;
            }
        }
    }

    static Napi::Object Init(Napi::Env env, Napi::Object exports, const char* nodeClassName) {
        Napi::Function func = Napi::ObjectWrap<KrispAudioProcessor<SampleType>>::DefineClass(env, nodeClassName, {
            Napi::ObjectWrap<KrispAudioProcessor<SampleType>>::InstanceMethod("configure", &KrispAudioProcessor<SampleType>::configure),
            Napi::ObjectWrap<KrispAudioProcessor<SampleType>>::InstanceMethod("processFrames", &KrispAudioProcessor<SampleType>::processFrames),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        exports.Set(nodeClassName, func);
        env.SetInstanceData(constructor);

        return exports;
    }

    KrispAudioProcessor(const Napi::CallbackInfo& info) : Napi::ObjectWrap<KrispAudioProcessor>(info) {
        Napi::Env env = info.Env();
        Napi::HandleScope scope(env);
    }

    Napi::Value configure(const Napi::CallbackInfo& info);
    Napi::Value processFrames(const Napi::CallbackInfo& info);

private:
    SamplingRate m_krispSampleRate = static_cast<SamplingRate>(0);
    unsigned int m_frameSize = 0;
    std::shared_ptr<Nc<SampleType>> m_ncSession;
    float m_noiseSuppressionLevel = 100.0;
    size_t m_frameSizeInBytes = 0;
};

static std::pair<SamplingRate, bool> getKrispSamplingRate(uint32_t rate) {
    std::pair<SamplingRate, bool> result;
    result.second = true;

    switch (rate) {
        case 8000:
            result.first = SamplingRate::Sr8000Hz;
            break;
        case 16000:
            result.first = SamplingRate::Sr16000Hz;
            break;
        default:
            result.second = false;
            break;
    }
    return result;
}

template <class SampleType>
Napi::Value KrispAudioProcessor<SampleType>::configure(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    try {
        if (info.Length() != 3) {
            throw std::runtime_error("Expected 3 arguments: modelPath, sampleRate, and noiseSuppressionLevel");
        }

        if (!info[0].IsString()) {
            throw std::runtime_error("Wrong argument type for modelPath. Expected: String");
        }

        if (!info[1].IsNumber()) {
            throw std::runtime_error("Wrong argument type for sampleRate. Expected: Number");
        }

        if (!info[2].IsNumber()) {
            throw std::runtime_error("Wrong argument type for noiseSuppressionLevel. Expected: Number");
        }

        std::string modelPath = info[0].As<Napi::String>().Utf8Value();
        if (modelPath.empty()) {
            throw std::runtime_error("Model path cannot be empty");
        }

        uint32_t sampleRate = info[1].As<Napi::Number>().Uint32Value();
        m_noiseSuppressionLevel = info[2].As<Napi::Number>().FloatValue();

        if (m_noiseSuppressionLevel < 0.0f || m_noiseSuppressionLevel > 100.0f) {
            throw std::runtime_error("Noise suppression level must be between 0 and 100");
        }

        auto samplingRateResult = getKrispSamplingRate(sampleRate);
        if (!samplingRateResult.second) {
            throw std::runtime_error("Unsupported sample rate. Only 8000Hz and 16000Hz are supported.");
        }

        m_krispSampleRate = samplingRateResult.first;
        constexpr FrameDuration frameDuration = FrameDuration::Fd10ms;
        m_frameSize = static_cast<unsigned int>(m_krispSampleRate) * static_cast<unsigned int>(frameDuration) / 1000;
        m_frameSizeInBytes = m_frameSize * sizeof(SampleType);

        std::wstring_convert<std::codecvt_utf8<wchar_t>> wstringConverter;
        ModelInfo ncModelInfo;
        ncModelInfo.path = wstringConverter.from_bytes(modelPath);

        bool withStats = false;
        NcSessionConfig ncCfg = {m_krispSampleRate, frameDuration, m_krispSampleRate, &ncModelInfo, withStats, nullptr};

        m_ncSession = Nc<SampleType>::create(ncCfg);
        if (!m_ncSession) {
            throw std::runtime_error("Failed to create Krisp NC session");
        }
    }
    catch (const std::exception& ex) {
        Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
    catch (...) {
        Napi::Error::New(env, "Unknown error during configuration").ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Undefined();
}

template <class SampleType>
Napi::Value KrispAudioProcessor<SampleType>::processFrames(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    try {
        if (!m_ncSession) {
            throw std::runtime_error("Krisp NC session not configured. Call configure first.");
        }

        if (info.Length() != 2) {
            throw std::runtime_error("Expected 2 arguments: inputBuffer and outputBuffer");
        }

        if (!info[0].IsBuffer() || !info[1].IsBuffer()) {
            throw std::runtime_error("Both arguments must be Buffer objects");
        }

        Napi::Buffer<char> inputBuffer = info[0].As<Napi::Buffer<char>>();
        Napi::Buffer<char> outputBuffer = info[1].As<Napi::Buffer<char>>();

        if (inputBuffer.Length() != outputBuffer.Length()) {
            throw std::runtime_error("Input and output buffers must have the same length");
        }

        if (inputBuffer.Length() % sizeof(SampleType) != 0) {
            throw std::runtime_error("Buffer length must be a multiple of sample size");
        }

        if (inputBuffer.Length() < m_frameSizeInBytes) {
            throw std::runtime_error("Input buffer too small for one frame");
        }

        size_t numSamples = inputBuffer.Length() / sizeof(SampleType);

        for (unsigned int i = 0; i < numSamples; i += m_frameSize) {
            m_ncSession->process(
                reinterpret_cast<SampleType*>(inputBuffer.Data() + i * sizeof(SampleType)),
                m_frameSize,
                reinterpret_cast<SampleType*>(outputBuffer.Data() + i * sizeof(SampleType)),
                m_frameSize,
                m_noiseSuppressionLevel,
                nullptr
            );
        }
    }
    catch (const std::exception& ex) {
        Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
    catch (...) {
        Napi::Error::New(env, "Unknown error during processing").ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Undefined();
}

void CleanupKrisp(void*) {
    // We don't need to call globalDestroy() as it might affect other processes
    // The OS will clean up resources when the process exits
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    try {
        globalInit(L"");
    }
    catch (const std::exception& ex) {
        Napi::Error::New(env, ex.what()).ThrowAsJavaScriptException();
        return Napi::Object::New(env);
    }
    catch (...) {
        Napi::Error::New(env, "Unknown error during initialization").ThrowAsJavaScriptException();
        return Napi::Object::New(env);
    }

    KrispAudioProcessor<float>::Init(env, exports, "KrispAudioProcessorPcmFloat");
    KrispAudioProcessor<int16_t>::Init(env, exports, "KrispAudioProcessorPcm16");
    napi_add_env_cleanup_hook(env, CleanupKrisp, nullptr);

    return exports;
}

NODE_API_MODULE(addon, Init)
