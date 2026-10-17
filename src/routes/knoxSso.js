// Knox SSO-style cookie handshake for Apache Ranger.
//
// This is NOT OAuth2. Ranger's RangerSSOAuthenticationFilter implements the
// Apache Knox SSO protocol, which is a much simpler redirect + signed-JWT-cookie
// flow:
//
//   1. Ranger redirects the browser here:  GET /Identity/KnoxSso/Login?originalUrl=<ranger page>
//   2. We show a login form.
//   3. On success we sign a JWT whose `sub` is the username and set it as a
//      cookie (name must match ranger.sso.cookiename, default "hadoop-jwt").
//   4. We redirect back to originalUrl. Ranger reads the cookie, verifies the
//      signature with ranger.sso.publicKey and logs the user in.
const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { findUserByUsername, verifyPassword } = require('../lib/users');
const { renderLoginForm } = require('../lib/renderLoginForm');
const { signJwt } = require('../lib/signToken');
const config = require('../config');

const router = express.Router();

const QUERY_PARAM = 'originalUrl'; // must match ranger.sso.query.param.originalurl

const cookieOptions = () => ({
  domain: config.cookieDomain,
  path: '/',
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
});

// Open-redirect protection: only redirect to origins explicitly allowed in
// RANGER_ALLOWED_ORIGINS. Fails closed when the list is empty.
function isAllowedRedirect(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return config.rangerAllowedOrigins.includes(u.origin);
  } catch {
    return false;
  }
}

function rejectRedirect(res) {
  return res
    .status(400)
    .send(
      `Invalid ${QUERY_PARAM}: its origin is not listed in RANGER_ALLOWED_ORIGINS on the SSO server.`
    );
}

router.get('/Identity/KnoxSso/Login', (req, res) => {
  const originalUrl = req.query[QUERY_PARAM];
  if (!originalUrl) {
    return res.status(400).send(`Missing ${QUERY_PARAM} query parameter`);
  }
  if (!isAllowedRedirect(originalUrl)) return rejectRedirect(res);

  res.send(renderLoginForm({ systemName: 'Apache Ranger', hidden: { originalUrl } }));
});

router.post(
  '/Identity/KnoxSso/Login',
  asyncHandler(async (req, res) => {
    const { originalUrl, username, password } = req.body;

    if (!originalUrl) {
      return res.status(400).send(`Missing ${QUERY_PARAM}`);
    }
    if (!isAllowedRedirect(originalUrl)) return rejectRedirect(res);

    const user = await findUserByUsername(username);
    const passwordOk = await verifyPassword(user, password);

    if (!passwordOk) {
      return res.status(401).send(
        renderLoginForm({
          systemName: 'Apache Ranger',
          errorMessage: 'نام کاربری یا رمز عبور اشتباه است.',
          hidden: { originalUrl },
        })
      );
    }

    // IMPORTANT: Ranger maps the JWT "sub" claim straight to a Ranger username.
    // It must be the real username of a user that ALREADY EXISTS in Ranger
    // (e.g. synced from LDAP/FreeIPA) - not this server's opaque OAuth2 `sub`.
    const token = await signJwt({ sub: user.username }, { expiresInSeconds: config.rangerJwtTtl });

    res.cookie(config.rangerCookieName, token, cookieOptions());
    return res.redirect(originalUrl);
  })
);

// Clears the SSO cookie. Ranger's own "Log Out" button only destroys Ranger's
// session and knows nothing about this cookie, so without clearing it the user
// is silently logged back in. See docs/07-limitations-and-security.md.
router.get('/Identity/KnoxSso/Logout', (req, res) => {
  const { cookieDomain, rangerCookieName } = config;
  res.clearCookie(rangerCookieName, { domain: cookieDomain, path: '/' });

  const target = req.query[QUERY_PARAM];
  if (target && isAllowedRedirect(target)) return res.redirect(target);
  return res.send('You have been logged out of the SSO.');
});

module.exports = router;
