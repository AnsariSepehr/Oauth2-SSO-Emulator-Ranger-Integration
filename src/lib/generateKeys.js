// Generates an RSA keypair for signing JWTs (RS256) and stores it in Postgres.
// Run with: npm run genkeys
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');

async function generateKeys() {
  const kid = uuidv4();

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Deactivate any previous active key (simple rotation policy: one active key at a time)
  await pool.query('UPDATE signing_keys SET is_active = false WHERE is_active = true');

  await pool.query(
    `INSERT INTO signing_keys (kid, public_pem, private_pem, is_active) VALUES ($1, $2, $3, true)`,
    [kid, publicKey, privateKey]
  );

  console.log(`Generated new signing key with kid=${kid}`);
  await pool.end();
}

generateKeys().catch((err) => {
  console.error('Key generation failed:', err);
  process.exit(1);
});
