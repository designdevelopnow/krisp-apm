cmake_minimum_required(VERSION 3.5)


project("Caretalk APM using Krisp")

# Set 'Release' or 'Debug'
set(CMAKE_BUILD_TYPE Release)

get_filename_component(ROOT_DIR ${PROJECT_SOURCE_DIR} DIRECTORY)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${ROOT_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${ROOT_DIR}/build/Release)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_compile_options(-Wall -pedantic -Wno-undefined-func-template)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU")
	add_compile_options(-Wextra -Wconversion -Wsign-conversion)
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
	add_compile_options(
		-Weverything
		-Wno-c++98-compat-pedantic
		-Wno-documentation-pedantic
		-Wdeprecated-declarations
		-Wno-deprecated-declarations
		-Wno-padded
	)
endif()

if (NOT DEFINED KRISP_SDK_PATH)
	message(FATAL_ERROR "KRISP_SDK_PATH must be specified")
endif()

set(KRISP_INC_DIR ${KRISP_SDK_PATH}/include)

# Krisp SDK libraries are applied to all targets
include(krisp.cmake)

# Build node apps

if (NOT NODE_INC OR NODE_INC STREQUAL "")
	message(FATAL_ERROR "the NODE_INC is not set.")
endif()
set(APP_DIR ${ROOT_DIR}/src)
execute_process(
	COMMAND npm install
	WORKING_DIRECTORY ${APP_DIR}
	RESULT_VARIABLE NPM_INSTALL_RESULT
	ERROR_VARIABLE NPM_INSTALL_ERROR
)
if (NOT NPM_INSTALL_RESULT EQUAL 0)
	message(FATAL_ERROR "npm install failed with error: ${NPM_INSTALL_ERROR}")
endif()
execute_process(
	COMMAND node -p "require('node-addon-api').include"
	WORKING_DIRECTORY ${APP_DIR}
	OUTPUT_VARIABLE NODE_ADDON_API_DIR
	RESULT_VARIABLE NODE_ADDON_API_RESULT
	ERROR_VARIABLE NODE_ADDON_API_ERROR
	OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(STRIP "${NODE_ADDON_API_DIR}" NODE_ADDON_API_DIR)
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
if (NOT NODE_ADDON_API_RESULT EQUAL 0 OR NODE_ADDON_API_DIR STREQUAL "")
	message(FATAL_ERROR "Failed to retrieve node-addon-api include directory: ${NODE_ADDON_API_ERROR}")
endif()
add_definitions(-DNAPI_VERSION=9)
set(NODEMODNAME_NC caretalk-apm-krisp)
add_library(${NODEMODNAME_NC} SHARED ${ROOT_DIR}/src/addon.cpp)
if (APPLE)
	set_target_properties(
		${NODEMODNAME_NC} PROPERTIES
		LINK_FLAGS "-undefined dynamic_lookup"
	)
endif()
target_link_libraries(${NODEMODNAME_NC} PRIVATE ${KRISP_LIBS})
target_include_directories(
	${NODEMODNAME_NC}
	PRIVATE
	${NODE_INC}
	${NODE_ADDON_API_DIR}
	${KRISP_INC_DIR}
)
set_target_properties(
	${NODEMODNAME_NC} PROPERTIES
	PREFIX ""
	SUFFIX ".node"
	RUNTIME_OUTPUT_DIRECTORY ${ROOT_DIR}/build/Release
	LIBRARY_OUTPUT_DIRECTORY_DEBUG "${ROOT_DIR}/build/Release"
	LIBRARY_OUTPUT_DIRECTORY_RELEASE "${ROOT_DIR}/build/Release"
)
