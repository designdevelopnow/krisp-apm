///
/// Copyright Krisp, Inc
///
#pragma once

#include <memory>
#include <type_traits>

#include "krisp-audio-api-definitions.hpp"

namespace Krisp::AudioSdk
{
template <typename FrameDataType>
class VadSession;

/// @brief VAD session configuration.
struct VadSessionConfig
{
    /// @brief Sampling frequency of the input data.
    SamplingRate inputSampleRate;

    /// @brief Input audio frame duration.
    FrameDuration inputFrameDuration;

    /// @brief VAD model configuration.
    ModelInfo* modelInfo;
};

/// @brief AI technology detetcts voice activity in real-time audio streams
/// @tparam FrameDataType supports int16 and float types.
template <typename FrameDataType>
class KRISP_AUDIO_API Vad
{
    static_assert(std::is_same<FrameDataType, float>::value || std::is_same<FrameDataType, int16_t>::value,
                  "FrameDataType must be either float or int16_t");
public:
    virtual ~Vad();

    /// @brief Creates a new instance of Vad session.
    /// @param[in] config Configuration for the Vad Session.
    /// @retval std::shared_ptr<VadSession> on success
    /// @exception Throws std exception in case of error.
    static std::shared_ptr<Vad<FrameDataType>> create(const VadSessionConfig& config);

    /// @brief Processes an input frame of audio data.
    /// @param[in] inputSamples Pointer to the input buffer containing audio samples.
    ///                         The buffer should hold enough samples to fill a frame of audio data,
    ///                         calculated as frameDuration * inputSampleRate / 1000 of FrameDataType samples.
    /// @param[in] numInputSamples The number of samples in the input buffer.
    ///                            Must be sufficient to match the expected input frame size.
    /// @exception Throws std exception in case of error.
    void process(
        const FrameDataType* inputSamples,
        size_t numInputSamples,
        float* vadOutput);

private:
    std::shared_ptr<VadSession<FrameDataType>> _session;
};

} // namespace Krisp::AudioSdk
