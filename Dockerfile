FROM node:22-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    libc6 \
    libsndfile1 \
    build-essential \
    cmake \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@latest && npm cache clean --force

RUN npm install -g node-addon-api@latest node-gyp && npm cache clean --force

WORKDIR /usr/src/app
COPY package*.json ./

RUN npm install --production && npm cache clean --force

COPY . .

ENV NODE_INC=/usr/local/include/node

RUN make

EXPOSE 3344

RUN npm install -g pm2 && npm cache clean --force

CMD ["pm2-runtime", "ecosystem.config.js"]
