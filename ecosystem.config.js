module.exports = {
  apps: [
    {
      name: "intranet-ctglobal",
      script: "./backend/src/server.js",
      cwd: "/var/www/intranet_ctglobal",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      error_file: "/var/log/pm2/intranet-ctglobal-error.log",
      out_file: "/var/log/pm2/intranet-ctglobal-out.log",
    },
  ],
};
