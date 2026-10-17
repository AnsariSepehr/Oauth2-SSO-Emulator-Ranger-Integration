require('dotenv').config();

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
  port: parseInt(process.env.PORT || '5205', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Public base URLs. Mirrors the Issuer / API split of the modelled SSO.
  issuerBaseUrl: process.env.ISSUER_BASE_URL || 'https://sso.example.com',
  apiBaseUrl: process.env.API_BASE_URL || 'https://api.sso.example.com',

  sessionSecret: process.env.SESSION_SECRET,

  // OAuth2 lifetimes (seconds)
  accessTokenTtl: parseInt(process.env.ACCESS_TOKEN_TTL || '3600', 10),
  authCodeTtl: parseInt(process.env.AUTH_CODE_TTL || '120', 10),

  // --- Apache Ranger (Knox SSO) integration ---
  // Cookie Domain must be a parent domain shared by this SSO and Ranger.
  cookieDomain: process.env.COOKIE_DOMAIN || '.example.com',
  rangerCookieName: process.env.RANGER_COOKIE_NAME || 'hadoop-jwt',
  rangerJwtTtl: parseInt(process.env.RANGER_JWT_TTL || '300', 10),
  // Set true once everything is served over HTTPS.
  cookieSecure: String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true',
  // Origins we are allowed to redirect to after login/logout (open-redirect
  // protection), e.g. "http://ranger.example.com:6080,https://ranger.example.com".
  rangerAllowedOrigins: list(process.env.RANGER_ALLOWED_ORIGINS),
};
