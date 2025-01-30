#!/bin/bash


# Run test clients in parallel
for i in {1..50}; do
    echo "Starting client $i..."
    node src/test-client.js dog-bark.wav clean-audio/output-$i.wav &
done

# Wait for all clients to finish
wait

# If we started the server, stop it
if [ ! -z "$SERVER_PID" ]; then
    echo "Stopping server..."
    kill $SERVER_PID
fi

echo "Done! Output files are output-[1-10].wav"
