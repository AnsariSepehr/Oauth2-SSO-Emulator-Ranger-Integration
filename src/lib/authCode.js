const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config');

function generateCode() {
  return crypto.randomBytes(32).toString('base64url');
}

async function createAuthorizationCode({
  clientId,
  userId,
  redirectUri,
  scope,
  state,
  nonce,
  codeChallenge,
  codeChallengeMethod,
}) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + config.authCodeTtl * 1000);

  await pool.query(
    `INSERT INTO authorization_codes
      (code, client_id, user_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [code, clientId, userId, redirectUri, scope, state || null, nonce || null, codeChallenge || null, codeChallengeMethod || null, expiresAt]
  );

  return code;
}

module.exports = { createAuthorizationCode };
