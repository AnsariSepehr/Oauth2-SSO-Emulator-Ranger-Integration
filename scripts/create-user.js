#!/usr/bin/env node
// Create (or update the password of) an SSO user.
//
//   NEW_USER_PASSWORD='S3cret!' npm run create-user -- <username> [email] ["Full Name"]
//
// The password is read from the NEW_USER_PASSWORD env var so it does not end up
// in `ps` output. (Prefix the command with a space or run `set +o history` to
// keep it out of your shell history too.)
//
// IMPORTANT for the Ranger integration: <username> must exactly match a user
// that already exists in Ranger (e.g. synced from LDAP/FreeIPA), because the
// Knox JWT `sub` is used as the Ranger username. See docs/04-ranger-integration.md.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');

async function main() {
  const [username, email, fullName] = process.argv.slice(2);
  const password = process.env.NEW_USER_PASSWORD;

  if (!username || !password) {
    console.error('Usage: NEW_USER_PASSWORD=... npm run create-user -- <username> [email] ["Full Name"]');
    process.exit(2);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const sub = crypto.randomBytes(6).toString('base64url');

  const { rows } = await pool.query(
    `INSERT INTO users (sub, username, password_hash, email, email_verified, full_name, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true
     RETURNING username, sub`,
    [sub, username, passwordHash, email || `${username}@example.com`, !!email, fullName || username]
  );

  console.log(`OK: user "${rows[0].username}" (sub=${rows[0].sub}) created/updated.`);
  await pool.end();
}

main().catch((err) => {
  console.error('create-user failed:', err.message);
  process.exit(1);
});
