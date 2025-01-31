///
/// Copyright Krisp, Inc
///
#pragma once

#include <memory>
#include <type_traits>
#include <vector>

#include "krisp-audio-api-definitions.hpp"

namespace Krisp::AudioSdk
{
template <typename FrameDataType>
class NcSession;

/// @brief Ringtone configuration used with inbound NC models to keep ringtones.
struct RingtoneCfg
{
    /// @brief Ringtone model configuration.
    ModelInfo modelInfo;
};

/// @brief NC session configuration.
struct NcSessionConfig
{
    /// @brief Sampling frequency of the input data.
    SamplingRate inputSampleRate;

    /// @brief Input audio frame duration.
    FrameDuration inputFrameDuration;

    /// @brief Sampling frequency of the output data.
    SamplingRate outputSampleRate;

    /// @brief NC model configuration.
    ModelInfo* modelInfo;

    /// @brief Set true to enable collection of NC session statistics
    bool enableSessionStats;

    /// @brief Optional: ringtone configuration, may be provided with inbound NC models to keep ringtones.
    RingtoneCfg* ringtoneCfg = nullptr;
};

/// @brief Background Voice cancelation configuration
struct BvcConfig
{
    /// @brief BVC allowed device name list
    std::vector<std::string> allowList;

    /// @brief BVC not allowed device name list
    std::vector<std::string> blockList;

    /// @brief Name of the device
    std::string deviceName;

    /// @brief Allow BVC for unknown devices that are not in the allow and block lists.
    ///        By default unknown devices are not enabled.
    bool forceBvcForUnknownDevice;
};

/// @brief NC/BVC autoselect session configuration.
struct NcSessionConfigWithAutoModelSelect
{
    /// @brief Sampling frequency of the input data.
    SamplingRate inputSampleRate;

    /// @brief Input audio frame duration.
    FrameDuration inputFrameDuration;

    /// @brief Sampling frequency of the output data.
    SamplingRate outputSampleRate;

    /// @brief List of NC model configurations.
    std::vector<ModelInfo> modelInfoList;

    /// @brief Set true to enable collection of NC session statistics
    bool enableSessionStats;

    /// @brief Optional: Configuration to enable the BVC option in the autoselect logic.
    ///                  By default disabled. Provide a valid pointer to enable BVC.
    BvcConfig* bvcConfig = nullptr;
};

/// @brief Audio frame energy information struct describing noise/voice energy values
struct EnergyInfo
{
    /// @brief Voice energy level, range [0,100]
    uint8_t voiceEnergy;

    /// @brief Noise energy level, range [0,100]
    uint8_t noiseEnergy;
};

/// @brief Cleaned secondary speech status enum
enum class CleanedSecondarySpeechStatus
{
    /// @brief Cleaned secondary speech algorithm is not available (if non BVC model provided)
    Undefined = 0,

    /// @brief Cleaned secondary speech detected in the processed frame
    Detected = 1,

    /// @brief Cleaned secondary speech is not detected in the processed frame
    NotDetected = 2
};

/// @brief Per-frame information returned after NC processing of the given frame
struct PerFrameStats
{
    /// @brief Voice and noise energy info.
    EnergyInfo energy;

    /// @brief BVC specific feature.
    /// Returns the state of the removed secondary speech.
    /// If secondary speech is detected and removed, it returns Detected otherwise, it returns NotDetected.
    //  Undefined will be returned in case of running the NC.
    CleanedSecondarySpeechStatus cleanedSecondarySpeechStatus;
};

/// @brief Voice stats
struct VoiceStats
{
    /// @brief Voice duration in ms
    uint32_t talkTimeMs;
};

/// @brief Noise stats based on the noise intensity levels
struct NoiseStats
{
    /// @brief No noise duration in ms
    uint32_t noNoiseMs;

    /// @brief Low intensity noise duration in ms
    uint32_t lowNoiseMs;

    /// @brief Medium intensity noise duration in ms
    uint32_t mediumNoiseMs;

    /// @brief High intensity noise duration in ms
    uint32_t highNoiseMs;

    /// @brief Cleaned secondary speech detected duration in ms
    uint32_t cleanedSecondarySpeechMs;

    /// @brief Cleaned secondary speech not detected duration in ms
    uint32_t cleanedSecondarySpeechNotDetectedMs;

    /// @brief Cleaned secondary speech undefined duration in ms (non BVC use-case)
    uint32_t cleanedSecondarySpeechUndefinedMs;
};

/// @brief NC stats containing noise and voice information
struct SessionStats
{
    /// @brief Voice stats
    VoiceStats voiceStats;

    /// @brief Noise stats
    NoiseStats noiseStats;
};

/// @brief AI technology removes background noises, reverb, and background voices from the main speaker's voice
///        in real-time, while also providing noise and voice statistics for the audio stream and frame
/// @tparam FrameDataType supports int16 and float types.
template <typename FrameDataType>
class KRISP_AUDIO_API Nc
{
    static_assert(std::is_same<FrameDataType, float>::value || std::is_same<FrameDataType, int16_t>::value,
                  "FrameDataType must be either float or int16_t");
public:
    virtual ~Nc();

    /// @brief Creates a new instance of Nc session.
    /// @param[in] config Configuration for the Nc Session.
    /// @retval std::shared_ptr<NcSession> on success
    /// @exception Throws std exception in case of error.
    static std::shared_ptr<Nc<FrameDataType>> create(const NcSessionConfig& config);

    /// @brief Creates a new instance of Nc session by automatically selecting one of the NC outbound models provided.
    ///        Applicable for outbound streams only.
    /// @param[in] config Configuration for the Nc Session with auto model select option.
    /// @retval std::shared_ptr<NcSession> on success
    /// @exception Throws std exception in case of error.
    static std::shared_ptr<Nc<FrameDataType>> create(const NcSessionConfigWithAutoModelSelect& config);

    /// @brief Processes an input frame of audio data.
    /// @param[in] inputSamples Pointer to the input buffer containing audio samples.
    ///                         The buffer should hold enough samples to fill a frame of audio data,
    ///                         calculated as frameDuration * inputSampleRate / 1000 of FrameDataType samples.
    /// @param[in] numInputSamples The number of samples in the input buffer.
    ///                            Must be sufficient to match the expected input frame size.
    /// @param[out] outputSamples Pointer to the buffer for the processed audio samples.
    ///                           The caller must allocate a buffer of sufficient size to handle
    ///                           a frame of output samples, calculated as frameDuration * outputSampleRate / 1000 of
    ///                           FrameDataType samples.
    /// @param[in] numOutputSamples The number of samples the output buffer can handle.
    ///                             Must be sufficient to match the expected output frame size.
    /// @param[in] noiseSuppressionLevel Optional: Noise suppression level in the range [0, 100]%
    ///                                  Used to adjust the intensity of the applied noise suppression.
    ///                                  By default full 100% NC will be applied.
    ///                                  - 0% indicates no noise suppression.
    ///                                  - 100% indicates full noise suppression.
    /// @param[out] frameStats Optional: Frame statistics calculated during NC processing.
    ///                        Disabled by default; will be calculated if a valid pointer is provided.
    /// @exception Throws std exception in case of error.
    void process(
        const FrameDataType* inputSamples,
        size_t numInputSamples,
        FrameDataType* outputSamples,
        size_t numOutputSamples,
        float noiseSuppressionLevel = 100,
        PerFrameStats* frameStats = nullptr);

    /// @brief Retrieves noise and voice statistics calculated from the start of NC processing.
    ///        To enable statistics collection, ensure that NcSessionConfig::enableStats is set when creating the NC object.
    ///        The recommended frequency for retrieving stats is 200ms or more.
    ///        If it's required only at the end of the NC session, call this function once
    ///        before the NC class object is destroyed.
    /// @param stats Session statistics
    /// @exception Throws std exception in case of error.
    void getSessionStats(SessionStats* stats);

private:
    std::shared_ptr<NcSession<FrameDataType>> _session;
};

} // namespace Krisp::AudioSdk
