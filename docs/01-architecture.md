# 1. Architecture

## Components

| Component | Tech | Role |
|---|---|---|
| SSO server | Node.js 20, Express 4 | Authorization server + Knox cookie provider |
| Database | PostgreSQL | clients, users, codes, tokens, signing keys |
| Reverse proxy (optional) | nginx | Port 80/443 → `127.0.0.1:5205`, TLS later |
| Ranger | Apache Ranger Admin 2.6.0 | Consumer of the Knox flow |

## Request flows

### OAuth2 Authorization Code (+PKCE)
```mermaid
sequenceDiagram
    participant U as User browser
    participant A as Client app
    participant S as SSO
    A->>U: redirect to /Identity/Outh2/Login?response_type=code&client_id&redirect_uri&scope&state&code_challenge
    U->>S: GET login form
    U->>S: POST username/password
    S->>S: validate client, redirect_uri, scope; check user
    S-->>U: 302 redirect_uri?code=...&state=...
    U->>A: callback
    A->>S: POST /Token/Token (grant_type=authorization_code, code, client auth, code_verifier)
    S-->>A: access_token (+ id token as configured)
    A->>S: GET /UserInfo/GetUserInfo (Bearer)
    S-->>A: user claims
```
`client_credentials` is a single `POST /Token/Token` with client authentication (HTTP Basic or body). Codes are single-use and expire after `AUTH_CODE_TTL` (120 s).

### Knox cookie (Ranger)
See the sequence diagram in [04](04-ranger-integration.md).

## Data model (`migrations/001_init.sql`)

| Table | Purpose |
|---|---|
| `clients` | client id, hashed secret, redirect URIs, allowed scopes, grant types, `use_pkce`, `is_active`, `allowed_origins` (logout) |
| `users` | username, bcrypt hash, email, display name, `sub` |
| `authorization_codes` | one-time codes bound to client, redirect URI, PKCE challenge, expiry |
| `access_tokens` | issued tokens (for lookup/audit) |
| `signing_keys` | RS256 key pair, `kid`, active flag |

## Token anatomy
- **OAuth2 access token:** RS256 JWT with the standard claims (`iss`, `sub`, `aud`, `exp`, `iat`, plus scope/client info), lifetime `ACCESS_TOKEN_TTL` (3600 s).
- **Knox cookie JWT (`hadoop-jwt`):** RS256, claims `sub` = Ranger username and `exp` = now + `RANGER_JWT_TTL` (300 s). Verified by Ranger with the X.509 certificate you configured, **not** via JWKS.

## Key management
- `npm run genkeys` creates the RS256 pair and stores it in `signing_keys`; the public half is published at `/jwks.json` (native `crypto` JWK export) and referenced from the Discovery document.
- `npm run ranger-cert` wraps the **same** key in a self-signed X.509 certificate (CN from `CERT_CN`, 10-year validity) for Ranger.
- Rotation: add a new key, update `ranger.sso.publicKey` on Ranger, restart Ranger. The private key is stored unencrypted - see [07](07-limitations-and-security.md).

## Code map
`src/routes/*` HTTP handlers, `src/lib/*` signing/PKCE/client auth/cert generation, `src/db/*` pool, migrations, seed, `src/config/index.js` all env settings.
