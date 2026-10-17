const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, // fail fast (-> HTTP 500) instead of hanging when the DB is down
});

// An idle client can error when Postgres restarts. pg discards the broken
// client by itself, so just log - do NOT exit, or a DB restart takes the SSO
// down with it.
pool.on('error', (err) => {
  console.error('Postgres idle-client error (pool will reconnect):', err.message);
});

module.exports = pool;
