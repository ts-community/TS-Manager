module.exports = {
  apps: [
    {
      name: 'TSManager',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 100,
      min_uptime: '20s',
      restart_delay: 4000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}