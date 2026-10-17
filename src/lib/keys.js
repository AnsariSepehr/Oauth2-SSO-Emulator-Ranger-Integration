const pool = require('../db/pool');

let cachedKey = null; // { kid, publicPem, privatePem }
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // re-check DB every 60s in case of rotation

async function getActiveKey() {
  const now = Date.now();
  if (cachedKey && now - cachedAt < CACHE_TTL_MS) {
    return cachedKey;
  }

  const result = await pool.query(
    'SELECT kid, public_pem, private_pem FROM signing_keys WHERE is_active = true ORDER BY created_at DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    throw new Error('No active signing key found. Run `npm run genkeys` first.');
  }

  const row = result.rows[0];
  cachedKey = { kid: row.kid, publicPem: row.public_pem, privatePem: row.private_pem };
  cachedAt = now;
  return cachedKey;
}

// Returns ALL keys (active + inactive) so JWKS can still validate tokens
// signed with a key that was rotated out but hasn't expired yet.
async function getAllKeys() {
  const result = await pool.query(
    'SELECT kid, public_pem FROM signing_keys ORDER BY created_at DESC'
  );
  return result.rows;
}

module.exports = { getActiveKey, getAllKeys };
