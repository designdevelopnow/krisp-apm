.PHONY: build run clean test

KRISP_SDK_PATH := $(shell pwd)/krisp/sdk/krisp-audio-sdk-9.0.0-lin_x64-nc

build:
	mkdir -p build
	cmake -B build -S cmake \
		-D KRISP_SDK_PATH=${KRISP_SDK_PATH} \
		-D LIBSNDFILE_INC=${LIBSNDFILE_INC} \
		-D LIBSNDFILE_LIB=${LIBSNDFILE_LIB} \
		-D NODE_INC=${NODE_INC}
	${MAKE} -C build VERBOSE=1

run:
	./bin/start-prod.sh

test:
	./bin/test-parallel.sh

clean:
	if [ -d "./build" ]; then \
		rm -rf build; \
	fi
	if [ -d "./test/output" ]; then \
		rm -rf test/output; \
	fi
