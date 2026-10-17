# 5. Bug & fix log

Every real problem hit while building and integrating, as **symptom → root cause → fix**. Ordered roughly as encountered. Entries marked *(code)* were fixed in this repo; *(ops)* are environment/configuration fixes you must apply yourself.

## Build phase

### 1. `pemToJwk is not a function` *(code)*
- **Symptom:** `/jwks.json` crashed at startup of key export.
- **Cause:** the `pem-jwk` package's API did not match how it was imported.
- **Fix:** removed the dependency; use Node's native `crypto.createPublicKey(pem).export({ format: 'jwk' })`.

### 2. `unsupported_grant_type` when testing `/Token/Token` *(usage)*
- **Symptom:** a multi-line `curl` pasted into the terminal returned `unsupported_grant_type`.
- **Cause:** line breaks/backslashes were mangled by the terminal, so `-d grant_type=...` never reached the server.
- **Fix:** send the command on **one line**.

### 3. `invalid_grant` right after a successful login *(usage)*
- **Symptom:** exchanging the code failed.
- **Cause:** the whole callback query (`code=...&state=...`) was pasted as the code; also codes are **single-use and short-lived** (`AUTH_CODE_TTL`, default 120 s).
- **Fix:** extract only the `code` value, exchange it once, quickly. A deliberately wrong PKCE verifier correctly returns `invalid_grant` - that is expected behaviour, not a bug.

### 4. JWT `sub` was the internal user id *(code)*
- **Cause:** early token code used the DB primary key.
- **Fix:** OAuth2 tokens use the stable `user.sub`; the Knox (Ranger) JWT uses `user.username` because Ranger maps `sub` to a Ranger login name.

## Ranger integration phase

### 5. `NullPointerException` in `RSASSAVerifier` - "Signature of JWT token could not be verified" *(code)*
- **Symptom:** after SSO redirect back to Ranger, login failed; Ranger log shows an NPE in the JWT verifier.
- **Cause:** `ranger.sso.publicKey` was a raw RSA public key (SubjectPublicKeyInfo). Ranger wraps the value in `BEGIN/END CERTIFICATE` and parses it as **X.509**, so it yields no key.
- **Fix:** generate a **self-signed X.509 certificate** (`npm run ranger-cert`) and put its base64 body in `ranger.sso.publicKey`. The raw-key helper was deleted from the repo. `apply-sso-config.py` now refuses raw keys and garbage (it decodes the DER and runs `openssl x509`; a mere `MII` prefix check is *not* enough because SPKI also begins with `MII`).

### 6. Login loop: Ranger ↔ SSO redirect forever *(ops)*
- **Cause:** the `hadoop-jwt` cookie never reached Ranger. Cookies do not cross IP addresses, and the cookie `Domain` must be a parent of **both** hostnames.
- **Fix:** use hostnames (DNS or `/etc/hosts` on every client machine) such as `sso.example.com` and `ranger.example.com`, and set `COOKIE_DOMAIN=.example.com`.

### 7. Ranger UI returned 404 on `/` and `/index.html` after a successful login *(ops)*
- **Symptom:** SSO and cookie worked (Ranger logged "SSO login user"), but every UI page was a 404.
- **Cause:** **MySQL was running with `--read-only`.** Ranger's `ServiceDBStore.initStore()` failed with MySQL error 1290 during startup, so the web application never finished initialising.
- **Fix:** `SET GLOBAL read_only = 0;` and **persist it** (`read_only = 0` under `[mysqld]` in `my.cnf`), otherwise the next MySQL restart reintroduces the bug. Lesson: when Ranger shows 404s, read `ranger-admin-*.log` before suspecting the SSO. Several earlier theories (stale saved request, welcome-file mapping) were wrong; the log was the answer.

### 8. "Error getting user for loginId=<name>" and read-only access *(ops)*
- **Cause:** the user existed only in the SSO database. Ranger requires the user to exist in **its own** user store; otherwise it authenticates the cookie but cannot load a role.
- **Fix:** create the user in Ranger first (Settings → Users/Groups, or the REST API), with the **same username** the SSO puts in `sub`. See [04](04-ranger-integration.md#user-mapping).

### 9. `admin` cannot log in through SSO *(by design)*
- **Cause:** `admin` is not in the SSO user table, so the SSO cannot issue a cookie for it.
- **Fix:** either create an `admin` user in the SSO, or keep using the internal login for `admin` via a non-browser path/another origin. Keep a break-glass local admin.

### 10. "Expiration time validation of JWT token failed" warnings *(config)*
- **Cause:** the Knox JWT lives `RANGER_JWT_TTL` seconds (default 300). After that, Ranger rejects the cookie and redirects to the SSO again.
- **Fix:** none needed; this is the normal refresh cycle while the SSO session is valid. Raise `RANGER_JWT_TTL` only if the noise matters. See [07](07-limitations-and-security.md).

### 11. Logout does not log out; cannot switch user *(limitation)*
- **Symptom:** clicking Ranger's *Log Out* returns the user straight back in; the previous user stays signed in.
- **Cause:** Ranger's logout only destroys its own session (`RANGERADMINSESSIONID`). The SSO cookie `hadoop-jwt` is still valid, so the next request authenticates again.
- **Mitigations:** (a) `GET /Identity/KnoxSso/Logout?originalUrl=...` clears the cookie from the SSO side; (b) an **experimental, unverified** nginx config expires the cookie when Ranger's logout passes through; (c) use a private window to switch users. Details in [07](07-limitations-and-security.md).

## Found during the repository hardening pass

### 12. Open redirect in Knox login/logout *(code)*
`originalUrl` was redirected to without validation. Now only origins listed in `RANGER_ALLOWED_ORIGINS` are accepted; an empty list **refuses everything** (fail-closed) and the server warns at startup.

### 13. Open redirect in OAuth2 logout *(code)*
The logout endpoint redirected to any origin passed in. It now checks the origin against `clients.allowed_origins` and returns 400 otherwise (the vendor's "origin only" quirk is kept).

### 14. Unhandled async errors hung requests *(code)*
Express 4 does not catch rejected promises in async handlers. All async routes are wrapped in `src/lib/asyncHandler.js`; a central error handler returns a JSON 500.

### 15. A database outage killed the whole server *(code)*
The pg pool called `process.exit(1)` on an idle-client error. Now it only logs; with `connectionTimeoutMillis: 5000` requests fail fast with 500 and the server recovers when PostgreSQL returns (verified by stopping/starting the database).

## Harmless things we saw

| Observation | Meaning |
|---|---|
| `could not change directory to "/root"` from `sudo -u postgres` | Harmless: postgres user cannot `cd` into your home. Run from `/tmp` or ignore. |
| `@` in the DB password breaks `DATABASE_URL` | URL-encode it: `@` → `%40`. |
| Green highlight on the login page in Firefox | Firefox's translate feature, not this project's CSS. |
| Ranger log location | `/usr/lib/ranger-admin/ews/logs/ranger-admin-*-<host>.log` on this install; yours may differ. |
