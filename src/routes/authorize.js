const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { findClientById } = require('../lib/clients');
const { findUserByUsername, verifyPassword } = require('../lib/users');
const { createAuthorizationCode } = require('../lib/authCode');
const { renderLoginForm } = require('../lib/renderLoginForm');

const router = express.Router();

// Shared validation: client + redirect_uri must be valid before we can safely
// redirect any error back to the client. Everything else (bad scope, bad
// response_type, missing PKCE) CAN be redirected back with ?error=...
async function validateClientAndRedirect(req, res) {
  const { client_id, redirect_uri } = req.query.client_id ? req.query : req.body;

  if (!client_id) {
    res.status(400).send('Missing client_id');
    return null;
  }

  const client = await findClientById(client_id);
  if (!client || !client.is_active) {
    res.status(400).send('Unknown or inactive client');
    return null;
  }

  if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
    res.status(400).send('redirect_uri is not matched with a registered URI for this client');
    return null;
  }

  return client;
}

function redirectWithError(res, redirectUri, state, error, errorDescription) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', errorDescription);
  if (state) url.searchParams.set('state', state);
  return res.redirect(url.toString());
}

// GET /Identity/Outh2/Login
router.get('/Identity/Outh2/Login', asyncHandler(async (req, res) => {
  const client = await validateClientAndRedirect(req, res);
  if (!client) return; // response already sent

  const {
    response_type,
    redirect_uri,
    scope = '',
    state,
    nonce,
    code_challenge,
    code_challenge_method,
  } = req.query;

  if (response_type !== 'code') {
    return redirectWithError(res, redirect_uri, state, 'unsupported_response_type', 'Only response_type=code is supported');
  }

  if (!client.grant_types.includes('authorization_code')) {
    return redirectWithError(res, redirect_uri, state, 'unauthorized_client', 'Client is not authorized for authorization_code grant');
  }

  const requestedScopes = scope.split(' ').filter(Boolean);
  const invalidScopes = requestedScopes.filter((s) => !client.scopes.includes(s));
  if (requestedScopes.length === 0 || invalidScopes.length > 0) {
    return redirectWithError(res, redirect_uri, state, 'invalid_scope', 'No valid scopes in request');
  }

  if (client.use_pkce && !code_challenge) {
    return redirectWithError(res, redirect_uri, state, 'invalid_request', 'code_challenge is required for this client');
  }

  res.send(
    renderLoginForm({
      systemName: client.system_name,
      hidden: {
        client_id: client.client_id,
        redirect_uri,
        scope,
        state,
        nonce,
        code_challenge,
        code_challenge_method,
      },
    })
  );
}));

// POST /Identity/Outh2/Login (form submit)
router.post('/Identity/Outh2/Login', asyncHandler(async (req, res) => {
  const client = await validateClientAndRedirect(req, res);
  if (!client) return;

  const {
    redirect_uri,
    scope = '',
    state,
    nonce,
    code_challenge,
    code_challenge_method,
    username,
    password,
  } = req.body;

  const user = await findUserByUsername(username);
  const passwordOk = await verifyPassword(user, password);

  if (!passwordOk) {
    return res
      .status(401)
      .send(
        renderLoginForm({
          systemName: client.system_name,
          errorMessage: 'نام کاربری یا رمز عبور اشتباه است.',
          hidden: { client_id: client.client_id, redirect_uri, scope, state, nonce, code_challenge, code_challenge_method },
        })
      );
  }

  const code = await createAuthorizationCode({
    clientId: client.client_id,
    userId: user.id,
    redirectUri: redirect_uri,
    scope,
    state,
    nonce,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method,
  });

  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return res.redirect(url.toString());
}));

module.exports = router;
