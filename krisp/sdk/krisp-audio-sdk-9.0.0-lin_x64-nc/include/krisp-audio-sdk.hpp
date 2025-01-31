///
/// Copyright Krisp, Inc
///
#pragma once

#include "krisp-audio-api-definitions.hpp"


namespace Krisp::AudioSdk
{

/// @brief Initializes the global data needed for the SDK
/// @param[in] workingPath The path to the working directory. Can be empty for using default execution directory.
/// @exception Throws std exception in case of error.
KRISP_AUDIO_API void globalInit(const std::wstring& workingPath);

/// @brief Frees all the global resources allocated by SDK.
/// @exception Throws std exception in case of error.
KRISP_AUDIO_API void globalDestroy();

/// @brief Populates the versionInfo structure with API version information upon successful completion.
/// @param[in,out] versionInfo The structure that gets populated upon successful completion of this call.
/// @exception Throws std exception in case of error.
KRISP_AUDIO_API void getVersion(VersionInfo& versionInfo);

} // namespace Krisp::AudioSdk
