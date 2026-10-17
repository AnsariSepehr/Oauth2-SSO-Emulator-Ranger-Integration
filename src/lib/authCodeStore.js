const pool = require('../db/pool');

async function findAuthorizationCode(code) {
  const result = await pool.query('SELECT * FROM authorization_codes WHERE code = $1', [code]);
  return result.rows[0] || null;
}

async function markCodeUsed(code) {
  await pool.query('UPDATE authorization_codes SET used = true WHERE code = $1', [code]);
}

module.exports = { findAuthorizationCode, markCodeUsed };
