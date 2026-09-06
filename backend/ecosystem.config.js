// PM2 process config for MILAN.
//
// IMPORTANT: fork mode (single instance) — NOT cluster.
// MILAN stores data in JSON files + an embedded LevelDB (classic-level / dwn-sdk-js),
// both of which lock to ONE process. Running `pm2 -i max` (cluster) would make
// multiple workers fight over the same files/DB and CORRUPT data.
// To scale horizontally you must first move shared state to Redis/Postgres.
//
// Run:  cd backend && NODE_ENV=production pm2 start ecosystem.config.js
//       pm2 save && pm2 startup
module.exports = {
  apps: [{
    name: 'milan',
    script: 'server.js',
    cwd: __dirname,
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    kill_timeout: 8000,
    env: { NODE_ENV: 'production' },
    out_file: './logs/milan-out.log',
    error_file: './logs/milan-error.log',
    merge_logs: true,
    time: true
  }]
};
