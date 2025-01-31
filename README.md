# Krisp APM Server

A Node.js server for audio processing using Krisp SDK.

## Prerequisites

- Node.js 20.x or higher
- npm
- cmake
- build-essential
- libsndfile1-dev

## Installation

1. Clone the repository:
```bash
git clone git@github.com:designdevelopnow/krisp-apm.git
cd krisp-apm
```

2. Install dependencies:
```bash
npm install
```

3. Build the native module:
```bash
make
```

## Running the Server

### Using Node.js Directly

1. Start the server:
```bash
node src/server/server.js
```

2. Run the test client:
```bash
node src/client/test-client.js <path-to-wav-file>
```

### Using PM2

1. Start the server with PM2:
```bash
pm2 start ecosystem.config.js
```

2. View logs:
```bash
pm2 logs
```

3. Monitor the application:
```bash
pm2 monit
```

4. Stop the server:
```bash
pm2 stop ecosystem.config.js
```

### Using Docker

1. Build and start using Docker Compose:
```bash
docker-compose up --build
```

2. Stop the container:
```bash
docker-compose down
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
NODE_ENV=production
PORT=3000
KRISP_MODEL_PATH=./krisp/models/c7.n.s.9f4389.kef
MAX_CONNECTIONS=10
```

## Metrics

Server metrics are available at:
```
http://localhost:3001
```

This endpoint returns:
- Active connections
- Total connections
- Peak connections
