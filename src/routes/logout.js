const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const pool = require('../db/pool');

const router = express.Router();

// Is this origin registered as an allowed origin of any active client?
// (Open-redirect protection - an unregistered origin is never redirected to.)
async function isRegisteredOrigin(origin) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM clients WHERE is_active = true AND $1 = ANY(allowed_origins) LIMIT 1',
    [origin]
  );
  return rowCount > 0;
}

const handleLogout = asyncHandler(async (req, res) => {
  const { post_logout_redirect_uri, state } = req.query;

  if (!post_logout_redirect_uri) {
    return res.send('You have been logged out.');
  }

  let origin;
  try {
    // Documented quirk of the modelled SSO: only scheme://authority is used,
    // the path/query of post_logout_redirect_uri is dropped.
    origin = new URL(post_logout_redirect_uri).origin;
  } catch {
    return res.status(400).send('Invalid post_logout_redirect_uri');
  }

  if (!(await isRegisteredOrigin(origin))) {
    return res.status(400).send('post_logout_redirect_uri origin is not registered for any client');
  }

  const url = new URL(origin);
  if (state) url.searchParams.set('state', state);
  return res.redirect(url.toString());
});

// Two equivalent paths, as in the modelled SSO.
router.get('/Identity/Outh2/Logout', handleLogout);
router.get('/Identity/Logout', handleLogout);

module.exports = router;
