const crypto = require('crypto');
const { getAllKeys } = require('./keys');

async function buildJwks() {
  const keys = await getAllKeys();

  const jwks = keys.map(({ kid, public_pem }) => {
    const keyObject = crypto.createPublicKey(public_pem);
    const jwk = keyObject.export({ format: 'jwk' }); // { kty, n, e }
    return {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      use: 'sig',
      alg: 'RS256',
      kid,
    };
  });

  return { keys: jwks };
}

module.exports = { buildJwks };
