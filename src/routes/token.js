const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { findClientById } = require('../lib/clients');
const { findUserById } = require('../lib/users');
const { verifyClientSecret, recordAccessToken } = require('../lib/clientAuth');
const { findAuthorizationCode, markCodeUsed } = require('../lib/authCodeStore');
const { verifyPkce } = require('../lib/pkce');
const { signJwt } = require('../lib/signToken');
const config = require('../config');

const router = express.Router();

// Shape mirrors ThirdPartyGuide.pdf's *actual* (non-standard) Token Response:
// access_token, id_token, token_type, code, error, errorUri, errorDescription
// Deliberately no expires_in / refresh_token — the modelled SSO doesn't return them either.
function tokenErrorResponse(res, status, error, errorDescription, code = null) {
  return res.status(status).json({
    access_token: null,
    id_token: null,
    token_type: 'Bearer',
    code,
    error,
    errorUri: null,
    errorDescription,
  });
}

function parseBasicAuth(req) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx === -1) return null;
    return { clientId: decoded.slice(0, idx), clientSecret: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

// POST /Token/Token
router.post('/Token/Token', asyncHandler(async (req, res) => {
  const grantType = req.body.grant_type;

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(req, res);
  }

  if (grantType === 'client_credentials') {
    return handleClientCredentialsGrant(req, res);
  }

  return tokenErrorResponse(res, 400, 'unsupported_grant_type', 'grant_type must be authorization_code or client_credentials');
}));

async function handleAuthorizationCodeGrant(req, res) {
  const { client_id, client_secret, code, redirect_uri, code_verifier } = req.body;

  if (!client_id || !client_secret || !code || !redirect_uri) {
    return tokenErrorResponse(res, 400, 'invalid_request', 'client_id, client_secret, code and redirect_uri are required');
  }

  const client = await findClientById(client_id);
  if (!client || !client.is_active) {
    return tokenErrorResponse(res, 401, 'invalid_client', 'Unknown or inactive client');
  }

  const secretOk = await verifyClientSecret(client, client_secret);
  if (!secretOk) {
    return tokenErrorResponse(res, 401, 'invalid_client', 'Invalid client credentials');
  }

  if (!client.grant_types.includes('authorization_code')) {
    return tokenErrorResponse(res, 400, 'unauthorized_client', 'Client is not authorized for authorization_code grant');
  }

  const authCode = await findAuthorizationCode(code);
  const now = new Date();

  if (
    !authCode ||
    authCode.used ||
    authCode.client_id !== client_id ||
    authCode.redirect_uri !== redirect_uri ||
    new Date(authCode.expires_at) < now
  ) {
    return tokenErrorResponse(res, 400, 'invalid_grant', 'invalid client request', code);
  }

  const pkceOk = verifyPkce(code_verifier, authCode.code_challenge, authCode.code_challenge_method);
  if (!pkceOk) {
    return tokenErrorResponse(res, 400, 'invalid_grant', 'code_verifier does not match code_challenge', code);
  }

  // Code is single-use: burn it now, before issuing tokens.
  await markCodeUsed(code);

  const user = await findUserById(authCode.user_id);
  if (!user || !user.is_active) {
    return tokenErrorResponse(res, 400, 'invalid_grant', 'User associated with this code is no longer valid', code);
  }

  const expiresAt = new Date(Date.now() + config.accessTokenTtl * 1000);

  const accessTokenPayload = {
    sub: user.sub,
    client_id: client.client_id,
    scope: authCode.scope,
  };
  const accessToken = await signJwt(accessTokenPayload, { expiresInSeconds: config.accessTokenTtl });

  const idTokenPayload = {
    sub: user.sub,
    aud: client.client_id,
    nonce: authCode.nonce || undefined,
  };
  const idToken = await signJwt(idTokenPayload, { expiresInSeconds: config.accessTokenTtl });

  await recordAccessToken({
    clientId: client.client_id,
    userId: authCode.user_id,
    scope: authCode.scope,
    grantType: 'authorization_code',
    expiresAt,
  });

  return res.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: 'Bearer',
    code,
    error: '',
    errorUri: null,
    errorDescription: '',
  });
}

async function handleClientCredentialsGrant(req, res) {
  const basicAuth = parseBasicAuth(req);

  if (!basicAuth) {
    // Matches documented quirk: missing/invalid Basic header -> plain "Not Authorized"
    return res.status(401).send('Not Authorized');
  }

  const client = await findClientById(basicAuth.clientId);
  if (!client || !client.is_active) {
    return tokenErrorResponse(res, 401, 'invalid_client', 'Unknown or inactive client');
  }

  const secretOk = await verifyClientSecret(client, basicAuth.clientSecret);
  if (!secretOk) {
    return tokenErrorResponse(res, 401, 'invalid_client', 'Invalid client credentials');
  }

  if (!client.grant_types.includes('client_credentials')) {
    return tokenErrorResponse(res, 400, 'unauthorized_client', 'Client is not authorized for client_credentials grant');
  }

  // Docs note: scope is sent as repeated form fields, so req.body.scope may be
  // a string (single value) or an array (multiple -d "scope=x" -d "scope=y").
  let requestedScopes = req.body.scope;
  if (!requestedScopes) requestedScopes = [];
  else if (!Array.isArray(requestedScopes)) requestedScopes = [requestedScopes];

  const invalidScopes = requestedScopes.filter((s) => !client.scopes.includes(s));
  if (requestedScopes.length === 0 || invalidScopes.length > 0) {
    return tokenErrorResponse(res, 400, 'invalid_scope', 'No valid scopes in request');
  }

  const expiresAt = new Date(Date.now() + config.accessTokenTtl * 1000);
  const scopeStr = requestedScopes.join(' ');

  const accessToken = await signJwt(
    { client_id: client.client_id, scope: scopeStr, grant_type: 'client_credentials' },
    { expiresInSeconds: config.accessTokenTtl }
  );

  await recordAccessToken({
    clientId: client.client_id,
    userId: null,
    scope: scopeStr,
    grantType: 'client_credentials',
    expiresAt,
  });

  return res.json({
    access_token: accessToken,
    id_token: null,
    token_type: 'Bearer',
    code: null,
    error: '',
    errorUri: null,
    errorDescription: '',
  });
}

module.exports = router;
