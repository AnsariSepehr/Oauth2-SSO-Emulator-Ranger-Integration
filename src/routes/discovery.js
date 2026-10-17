const express = require('express');
const config = require('../config');

const router = express.Router();

// GET /.well-known/openid-configuration
router.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: `${config.apiBaseUrl}/`,
    authorization_endpoint: `${config.issuerBaseUrl}/Identity/Outh2/Login`,
    token_endpoint: `${config.apiBaseUrl}/Token/Token`,
    userinfo_endpoint: `${config.apiBaseUrl}/UserInfo/GetUserInfo`,
    jwks_uri: `${config.apiBaseUrl}/jwks.json`,
    end_session_endpoint: `${config.issuerBaseUrl}/Identity/Outh2/Logout`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    code_challenge_methods_supported: ['S256', 'plain'],
    scopes_supported: ['openid', 'profile', 'email', 'EmployeeCode'],
  });
});

module.exports = router;
