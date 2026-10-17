const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function verifyClientSecret(client, plainSecret) {
  if (!client) return false;
  return bcrypt.compare(plainSecret, client.client_secret_hash);
}

async function recordAccessToken({ clientId, userId, scope, grantType, expiresAt }) {
  await pool.query(
    `INSERT INTO access_tokens (client_id, user_id, scope, grant_type, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [clientId, userId || null, scope, grantType, expiresAt]
  );
}

module.exports = { verifyClientSecret, recordAccessToken };
