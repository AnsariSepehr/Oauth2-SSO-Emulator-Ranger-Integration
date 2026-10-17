const jwt = require('jsonwebtoken');
const { getAllKeys } = require('./keys');
const config = require('../config');

// Verifies a token by trying each known public key (active + rotated-out but
// not yet expired) matched against the token's kid header.
async function verifyAccessToken(token) {
  const decodedHeader = jwt.decode(token, { complete: true });
  if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
    throw new Error('invalid_token: missing kid');
  }

  const kid = decodedHeader.header.kid;
  const keys = await getAllKeys();
  const keyRow = keys.find((k) => k.kid === kid);

  if (!keyRow) {
    throw new Error('invalid_token: unknown kid');
  }

  return jwt.verify(token, keyRow.public_pem, {
    algorithms: ['RS256'],
    issuer: config.apiBaseUrl + '/',
  });
}

module.exports = { verifyAccessToken };
