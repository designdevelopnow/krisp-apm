#pragma once

#include <cstdint>
#include <string>
#include <utility>

#if defined _WIN32 || defined __CYGWIN__
#ifdef KRISP_AUDIO_STATIC
#define KRISP_AUDIO_API
#else
#ifdef KRISP_AUDIO_EXPORTS
#ifdef __GNUC__
#define KRISP_AUDIO_API __attribute__((dllexport))
#else
#define KRISP_AUDIO_API __declspec(dllexport) // Note: actually gcc seems to also support this syntax.
#endif
#else
#ifdef __GNUC__
#define KRISP_AUDIO_API __attribute__((dllimport))
#else
#define KRISP_AUDIO_API __declspec(dllimport) // Note: actually gcc seems to also support this syntax.
#endif
#endif
#endif
#else
#if __GNUC__ >= 4
#define KRISP_AUDIO_API __attribute__((visibility("default")))
#else
#define KRISP_AUDIO_API
#endif
#endif

namespace Krisp::AudioSdk
{

/// @brief Sampling frequency of the audio frame
enum class SamplingRate
{
    Sr8000Hz = 8000,
    Sr16000Hz = 16000,
    Sr24000Hz = 24000,
    Sr32000Hz = 32000,
    Sr44100Hz = 44100,
    Sr48000Hz = 48000,
    Sr88200Hz = 88200,
    Sr96000Hz = 96000
};

/// @brief Input audio frame duration in ms
enum class FrameDuration
{
    Fd10ms = 10
};

/// @brief Version information
struct VersionInfo
{
    uint16_t major;
    uint16_t minor;
    uint16_t patch;
    uint32_t build;
};

/// @brief Model Info containing path to the model or it's content blob.
struct ModelInfo
{
    /// @brief Path to the model file
    std::wstring path;

    /// @brief Model file content as a blob
    std::pair<const uint8_t*, size_t> blob;
};

} // namespace Krisp::AudioSdk
