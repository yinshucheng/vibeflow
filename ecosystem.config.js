/**
 * PM2 Ecosystem Configuration for VibeFlow
 * 
 * This file configures PM2 to manage the VibeFlow backend server.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js           # Start in development
 *   pm2 start ecosystem.config.js --env production  # Start in production
 *   pm2 stop vibeflow-backend               # Stop the server
 *   pm2 restart vibeflow-backend            # Restart the server
 *   pm2 logs vibeflow-backend               # View logs
 *   pm2 monit                               # Monitor all processes
 * 
 * Requirements:
 *   - PM2 installed globally: npm install -g pm2
 *   - Database migrated: npm run db:migrate
 *   - Build completed (for production): npm run build
 */

module.exports = {
  apps: [
    {
      // Application name (used in PM2 commands)
      name: 'vibeflow-backend',
      
      // Script to run
      script: 'npm',
      args: 'run start',
      
      // Working directory
      cwd: __dirname,
      
      // Interpreter (use node for npm)
      interpreter: 'none',
      
      // Auto-restart configuration
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      // Exponential backoff restart delay
      exp_backoff_restart_delay: 100,
      
      // Instance configuration
      instances: 1,
      exec_mode: 'fork',
      
      // Memory limit (restart if exceeded)
      max_memory_restart: '500M',
      
      // Log configuration
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/vibeflow-error.log',
      out_file: 'logs/vibeflow-out.log',
      merge_logs: true,
      
      // Environment variables for all environments
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      
      // Production environment overrides
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      // Staging environment overrides
      env_staging: {
        NODE_ENV: 'production',
        PORT: 3000,
        VIBEFLOW_MODE: 'staging',
      },
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // Health check (PM2 Plus feature, optional)
      // Uncomment if using PM2 Plus
      // health_check: {
      //   url: 'http://localhost:3000/api/health',
      //   interval: 30000,
      //   timeout: 5000,
      // },
    },
    
    // Socket server (if running separately)
    {
      name: 'vibeflow-socket',
      script: 'npm',
      args: 'run start:socket',
      cwd: __dirname,
      interpreter: 'none',
      
      // Disabled by default - enable if running socket server separately
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      
      instances: 1,
      exec_mode: 'fork',
      
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/vibeflow-socket-error.log',
      out_file: 'logs/vibeflow-socket-out.log',
      merge_logs: true,
      
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      
      // Start disabled - enable manually if needed
      // pm2 start ecosystem.config.js --only vibeflow-socket
      // Or remove this line to start by default
      // instances: 0,
    },
  ],
  
  // Deployment configuration (optional)
  // Uncomment and configure for remote deployment
  // deploy: {
  //   production: {
  //     user: 'deploy',
  //     host: 'your-server.com',
  //     ref: 'origin/main',
  //     repo: 'git@github.com:your-org/vibeflow.git',
  //     path: '/var/www/vibeflow',
  //     'pre-deploy-local': '',
  //     'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
  //     'pre-setup': '',
  //   },
  // },
};
