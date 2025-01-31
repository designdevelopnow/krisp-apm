module.exports = {
  apps: [{
    name: 'krisp-apm',
    script: 'src/server.js',
    instances: 1, // Single instance as Krisp needs exclusive access
    exec_mode: 'fork',
    max_memory_restart: '1G',

    // Load .env file
    env_file: '.env',

    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Graceful shutdown
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Restart on memory usage
    max_memory_restart: '1G',
    
    // Auto restart
    autorestart: true,
    watch: false,
    
    // Metrics
    metrics: {
      http: {
        port: 3001,
        host: 'localhost'
      }
    }
  }]
};
