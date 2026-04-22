module.exports = {
  apps: [
    {
      name: "unified-mc",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3333",
      cwd: "/root/openclaw-mission-control",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3333,
        OPENCLAW_HOME: "/root/.openclaw",
      },
      error_file: "/root/.pm2/logs/unified-mc-error.log",
      out_file: "/root/.pm2/logs/unified-mc-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};