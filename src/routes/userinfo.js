const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { verifyAccessToken } = require('../lib/verifyToken');
const { findUserBySub } = require('../lib/users');

const router = express.Router();

function extractToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  // Documented fallback: access_token as a form field
  if (req.body && req.body.access_token) {
    return req.body.access_token;
  }
  if (req.query && req.query.access_token) {
    return req.query.access_token;
  }
  return null;
}

// GET /UserInfo/GetUserInfo
router.get('/UserInfo/GetUserInfo', asyncHandler(async (req, res) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      succeeded: false,
      error: 'invalid_token',
      errorDescription: 'No access token provided',
    });
  }

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json({
      succeeded: false,
      error: 'invalid_token',
      errorDescription: err.message,
    });
  }

  const user = await findUserBySub(claims.sub);
  if (!user || !user.is_active) {
    return res.status(401).json({
      succeeded: false,
      error: 'invalid_token',
      errorDescription: 'User not found or inactive',
    });
  }

  return res.json({
    succeeded: true,
    error: '',
    errorDescription: '',
    sub: user.sub,
    name: user.full_name || user.email,
    email: user.email,
    email_verified: user.email_verified,
  });
}));

module.exports = router;
