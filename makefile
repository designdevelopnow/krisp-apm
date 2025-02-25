.PHONY: build run clean

KRISP_SDK_PATH := $(shell pwd)/krisp/sdk/krisp-audio-sdk-9.0.0-lin_x64-nc

build:
	mkdir -p build
	cmake -B build -S cmake \
		-D KRISP_SDK_PATH=${KRISP_SDK_PATH}

	${MAKE} -C build VERBOSE=1
run:
	cd test && ./nc-sample-test-driver.sh

clean:
	if [ -d "./build" ]; then \
		rm -rf build; \
	fi
	if [ -d "./bin" ]; then \
		rm -rf bin; \
	fi