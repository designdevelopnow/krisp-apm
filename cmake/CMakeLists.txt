cmake_minimum_required(VERSION 3.5)


project("Caretalk APM using Krisp")

# Set 'Release' or 'Debug'
set(CMAKE_BUILD_TYPE Release)

get_filename_component(ROOT_DIR ${PROJECT_SOURCE_DIR} DIRECTORY)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${ROOT_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${ROOT_DIR}/build/Release)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_compile_options(-Wall -pedantic)

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

include(krisp.cmake)
set(APPNAME_NC "apm-krisp-nc")

add_executable(
    ${APPNAME_NC}
    ${ROOT_DIR}/src/main.cpp
)

target_include_directories(
    ${APPNAME_NC}
    PRIVATE
    ${KRISP_INC_DIR}
)

target_link_libraries(
    ${APPNAME_NC}
    ${KRISP_LIBS}
)


