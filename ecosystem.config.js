const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

module.exports = {
  apps: [{
    name: 'krisp-apm',
    script: 'src/server/server.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '2G',

    // Environment variables
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: process.env.PORT || 3344,
      METRICS_PORT: process.env.METRICS_PORT || 3345,
      KRISP_MODEL_PATH: process.env.KRISP_MODEL_PATH || './krisp/models/c7.n.s.9f4389.kef',
      MAX_CONNECTIONS: process.env.MAX_CONNECTIONS || 10
    },
    
    error_file: 'logs/err.log',
    out_file: 'logs/app.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Graceful shutdown
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Auto restart
    autorestart: true,
    watch: false
  }]
};
