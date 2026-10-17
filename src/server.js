const express = require('express');
const config = require('./config');

const discoveryRoutes = require('./routes/discovery');
const jwksRoutes = require('./routes/jwks');
const authorizeRoutes = require('./routes/authorize');
const tokenRoutes = require('./routes/token');
const userinfoRoutes = require('./routes/userinfo');
const logoutRoutes = require('./routes/logout');
const knoxSsoRoutes = require('./routes/knoxSso');

const app = express();

// Behind nginx / a load balancer.
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (not part of OAuth2; for monitoring / load balancers).
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(discoveryRoutes);
app.use(jwksRoutes);
app.use(authorizeRoutes);
app.use(tokenRoutes);
app.use(userinfoRoutes);
app.use(logoutRoutes);
app.use(knoxSsoRoutes);

// Central error handler (reached via asyncHandler on rejected promises).
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'server_error', errorDescription: 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`SSO server listening on port ${config.port} (env: ${config.nodeEnv})`);
  console.log(`Issuer base URL: ${config.issuerBaseUrl}`);
  console.log(`API base URL:    ${config.apiBaseUrl}`);
  if (config.rangerAllowedOrigins.length === 0) {
    console.warn('WARN: RANGER_ALLOWED_ORIGINS is empty - /Identity/KnoxSso/* will refuse every request.');
  }
});
