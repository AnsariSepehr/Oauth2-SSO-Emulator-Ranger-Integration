const crypto = require('crypto');

function verifyPkce(codeVerifier, codeChallenge, codeChallengeMethod) {
  if (!codeChallenge) return true; // PKCE wasn't required for this request
  if (!codeVerifier) return false;

  if (codeChallengeMethod === 'plain') {
    return codeVerifier === codeChallenge;
  }

  // default / S256
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}

module.exports = { verifyPkce };
