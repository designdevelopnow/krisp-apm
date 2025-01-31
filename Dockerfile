# Use Ubuntu 22.04 as base image
FROM ubuntu:24.04

# Prevent tzdata questions during install
ENV DEBIAN_FRONTEND=noninteractive

# Install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    cmake \
    python3 \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Verify Node.js version
RUN node -v && npm -v

# Install npm separately (to ensure latest version)
RUN npm install -g npm@latest

# Install node-addon-api globally (for N-API support)
RUN npm install -g node-addon-api@latest node-gyp

# Set working directory
WORKDIR /usr/src/app

# Copy package files first (for efficient Docker caching)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variable for Node.js include path
ENV NODE_INC=/usr/local/include/node

# Build the native module
RUN make

# Expose port (change if needed)
EXPOSE 3000

# Install PM2 globally for process management
RUN npm install -g pm2

# Start the application using PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
