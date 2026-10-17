# 7. Limitations & security

This project is a **lab emulator for integration testing**, not a hardened identity provider.

## Behavioural limitations

### Logout and switching users
Ranger's *Log Out* ends only Ranger's session (`RANGERADMINSESSIONID`). The `hadoop-jwt` cookie remains valid until it expires (`RANGER_JWT_TTL`, default 300 s), so the next request logs the user in again, and you cannot switch user until both expire.

| Option | Status |
|---|---|
| `GET /Identity/KnoxSso/Logout?originalUrl=<ranger url>` clears the cookie (origin must be allowlisted) | Implemented and tested |
| Shorter `RANGER_JWT_TTL` | Works but means more redirects |
| nginx in front of Ranger that expires the cookie on `/logout` (`deploy/nginx/ranger-logout-proxy.conf`) | **Experimental, unverified.** The logout path must be confirmed in DevTools; users must reach Ranger through nginx |
| Private/incognito window to switch users | Reliable manual workaround |

### Two clocks
The JWT lasts 300 s, but Ranger keeps its own session after verifying it (Tomcat default is typically 30 min of inactivity - **not verified on this install**). Expect warnings like "Expiration time validation of JWT token failed" when the cookie expires; they trigger a silent re-authentication.

### Ghost users
Authenticating in the SSO does not create the user in Ranger. Without a matching Ranger user you get "Error getting user for loginId" and read-only access.

### `admin`
Not in the SSO user table, so cannot sign in via SSO. Keep a local break-glass admin.

### Own user store
Passwords live in the SSO's `users` table. Authenticating against LDAP/FreeIPA is **not implemented**.

## Security gaps (do not expose as a real IdP)

| Gap | Impact | Suggested fix |
|---|---|---|
| No rate limiting / lockout | Password brute force | `express-rate-limit`, lockout, fail2ban on proxy logs |
| Signing private key stored unencrypted in PostgreSQL | DB read = ability to forge tokens | KMS/HSM, or file with 0400 perms, or encrypt at rest |
| No `jti`, no revocation | Stolen token valid until expiry | Token store + revocation list; short TTLs |
| UserInfo accepts the token in the query string | Tokens leak into logs | Accept only the `Authorization` header (vendor quirk kept for compatibility) |
| HTTP by default | Credentials and cookies in clear text | Terminate TLS in nginx, set `COOKIE_SECURE=true` |
| Cookie not host-bound beyond Domain | Any sibling subdomain can read it | Keep the parent domain narrow |
| No audit log of logins | No forensic trail | Log auth events to a table/syslog |
| No CSRF token on the login form | Login CSRF | Add a token if you extend the UI |

## What *is* protected

- Open redirects: Knox login/logout and OAuth2 logout validate against allowlists (fail-closed).
- PKCE (S256/plain), single-use short-lived codes, client authentication with hashed secrets.
- Async errors and DB outages cannot crash the process.
- Secrets are never committed (`.gitignore`) and the cert guard prevents the classic raw-key mistake.

## Rotate if exposed
If any password, client secret or key was ever pasted into chat, tickets or logs, treat it as compromised and rotate it.
