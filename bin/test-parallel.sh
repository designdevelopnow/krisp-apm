#!/bin/bash

# Run test clients in parallel
for i in {1..10}; do
    echo "Starting client $i..."
    node src/client/test-client.js data/audio/dog-bark.wav test/output/clean-audio-$i.wav &
done

# Wait for all clients to finish
wait
echo "All clients finished"

# If we started the server, stop it
if [ ! -z "$SERVER_PID" ]; then
    echo "Stopping server..."
    kill $SERVER_PID
fi

echo "Done! Output files are test/output/clean-audio-[1-10].wav"
