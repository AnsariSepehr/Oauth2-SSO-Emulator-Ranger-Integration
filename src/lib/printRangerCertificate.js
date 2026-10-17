// Ranger's RangerSSOAuthenticationFilter does NOT accept a raw RSA public key
// for ranger.sso.publicKey. It wraps the configured value with
// "-----BEGIN CERTIFICATE-----" / "-----END CERTIFICATE-----" and parses it
// via CertificateFactory.getInstance("X.509"). So we must give it the base64
// body of a self-signed X.509 CERTIFICATE, not a raw SubjectPublicKeyInfo.
//
// This generates a self-signed cert wrapping our EXISTING active key (so the
// embedded public key still matches what we use to sign JWTs), using the
// `openssl` CLI, which is preinstalled on Rocky Linux.
//
// Run with: node src/lib/printRangerCertificate.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getActiveKey } = require('./keys');

async function main() {
  const { privatePem, kid } = await getActiveKey();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sso-cert-'));
  const keyPath = path.join(tmpDir, 'key.pem');
  const certPath = path.join(tmpDir, 'cert.pem');

  try {
    fs.writeFileSync(keyPath, privatePem, { mode: 0o600 });

    execFileSync('openssl', [
      'req', '-new', '-x509',
      '-key', keyPath,
      '-out', certPath,
      '-days', '3650',
      '-subj', '/CN=' + (process.env.CERT_CN || 'sso.example.com'),
      '-sha256',
    ]);

    const certPem = fs.readFileSync(certPath, 'utf8');
    const certBody = certPem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\r?\n/g, '')
      .trim();

    console.log(`Active key kid: ${kid}`);
    console.log('');
    console.log('Paste this as ranger.sso.publicKey in ranger-admin-site.xml (replacing the raw public key we gave you earlier):');
    console.log('');
    console.log(certBody);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
