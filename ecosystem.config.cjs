// PM2 process config — shared by every box running this app directly on
// bare OS (the DO droplet, and now an EC2 instance for staging/sandbox).
//
// Deliberately no secrets here (DATABASE_URL, SESSION_SECRET,
// ENCRYPTION_KEY). Those must live in a git-ignored .env file on the
// server itself, never committed — node_args below loads it via Node's
// native --env-file flag. Hand-carrying secrets inside this file (as a
// pasted block, or in the env object) was flagged as a hygiene risk during
// the earlier audit — this file exists specifically to avoid repeating that.
module.exports = {
  apps: [
    {
      name: "occwaypoint",
      script: "dist/index.js",
      node_args: "--env-file=.env",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        DB_DRIVER: "pg",
        PORT: "5000",
      },
    },
  ],
};
