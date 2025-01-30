.PHONY: build run clean


build:
	mkdir -p build
	cmake -B build -S cmake \
		-D KRISP_SDK_PATH=${KRISP_SDK_PATH} \
		-D LIBSNDFILE_INC=${LIBSNDFILE_INC} \
		-D LIBSNDFILE_LIB=${LIBSNDFILE_LIB} \
		-D NODE_INC=${NODE_INC}
	${MAKE} -C build VERBOSE=1

clean:
	if [ -d "./build" ]; then \
		rm -rf build; \
	fi
	if [ -d "./bin" ]; then \
		rm -rf bin; \
	fi
