const jwt = require('jsonwebtoken');
const { getActiveKey } = require('./keys');
const config = require('../config');

async function signJwt(payload, { expiresInSeconds } = {}) {
  const { kid, privatePem } = await getActiveKey();

  const options = {
    algorithm: 'RS256',
    issuer: config.apiBaseUrl + '/',
    keyid: kid,
  };
  if (expiresInSeconds) options.expiresIn = expiresInSeconds;

  return jwt.sign(payload, privatePem, options);
}

module.exports = { signJwt };
