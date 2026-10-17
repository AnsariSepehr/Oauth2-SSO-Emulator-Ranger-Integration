const express = require('express');
const { buildJwks } = require('../lib/jwks');

const router = express.Router();

// GET /jwks.json
router.get('/jwks.json', async (req, res) => {
  try {
    const jwks = await buildJwks();
    res.json(jwks);
  } catch (err) {
    console.error('Failed to build JWKS:', err);
    res.status(500).json({ error: 'server_error', errorDescription: 'Could not load signing keys' });
  }
});

module.exports = router;
