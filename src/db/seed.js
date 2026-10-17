// Seeds ONE demo OAuth2 client and ONE demo user so you can try the flows.
// DEMO DATA ONLY - never run this against a production database, and change
// every value below (or override via SEED_* env vars) if the box is reachable.
//
//   npm run seed
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('./pool');

const env = (k, d) => process.env[k] || d;
const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

async function seed() {
  const appOrigin = env('SEED_APP_ORIGIN', 'https://app.example.com');
  const redirectUri = env('SEED_REDIRECT_URI', `${appOrigin}/auth/callback`);

  // ---- Demo client ----
  const clientId = 'democlient_' + randomToken(4);
  const clientSecretPlain = randomToken(24);
  const clientSecretHash = await bcrypt.hash(clientSecretPlain, 10);

  await pool.query(
    `INSERT INTO clients
      (client_id, client_secret_hash, company_name, system_name, system_name_latin,
       client_uri, allowed_origins, redirect_uris, display_urls, scopes, grant_types, use_pkce, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      clientId,
      clientSecretHash,
      'Demo Company',
      'نمونه سامانه تست',
      'Demo App',
      appOrigin,
      [appOrigin],
      [redirectUri],
      [appOrigin],
      ['openid', 'profile', 'email', 'EmployeeCode'],
      ['authorization_code', 'client_credentials'],
      true,
      true,
    ]
  );

  // ---- Demo user ----
  const username = env('SEED_USERNAME', 'demouser');
  const passwordPlain = env('SEED_PASSWORD', randomToken(12));
  const passwordHash = await bcrypt.hash(passwordPlain, 10);
  const sub = randomToken(6);

  await pool.query(
    `INSERT INTO users (sub, username, password_hash, email, email_verified, full_name, employee_code, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sub, username, passwordHash, `${username}@example.com`, true, 'Demo User', 'EMP-0001', true]
  );

  console.log('--- Seed complete (save these now, the secret/password are not shown again) ---');
  console.log('Client:');
  console.log('  client_id:     ', clientId);
  console.log('  client_secret: ', clientSecretPlain);
  console.log('  redirect_uri:  ', redirectUri);
  console.log('User:');
  console.log('  username: ', username);
  console.log('  password: ', passwordPlain);
  console.log('  sub:      ', sub);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
