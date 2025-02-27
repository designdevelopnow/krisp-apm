#!/bin/bash

set -e

INPUT_FILE=${1:-test/input/input-slin16.wav}
OUTPUT_FILE=${2:-$PWD/test/output/output-slin16.wav}

check_npm_package() {
    if node -e "require.resolve('$1')" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if wavefile is installed, if not install it
if ! check_npm_package "wavefile"; then
    echo "wavefile package not found. Installing..."
    npm install wavefile --no-save
fi

./bin/apm-krisp-nc 3344 "$PWD/krisp/models/inb.bvc.hs.c6.w.s.23cdb3.kef" &
SERVER_PID=$!

cleanup() {
    echo "Stopping server..."
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
}

trap cleanup EXIT

sleep 2

node test/test-client.js $INPUT_FILE $OUTPUT_FILE 3344 localhost
