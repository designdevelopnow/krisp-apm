#!/bin/bash

# Set ulimit for max open files (important for many connections)
ulimit -n 65535

# Ensure logs directory exists
mkdir -p logs

# Start with PM2
pm2 start config/ecosystem.config.js --env production
