const path = require('path');

module.exports = {
  apps: [{
    name: 'krisp-apm',
    script: 'src/server/server.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '1G',

    // Environment variables
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      KRISP_MODEL_PATH: './krisp/models/c7.n.s.9f4389.kef',
      MAX_CONNECTIONS: 10
    },
    
    // Load environment variables from .env
    env_file: path.resolve(__dirname, '.env'),

    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
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
