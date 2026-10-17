# 8. API reference

Base URL examples use `http://sso.example.com`. Replace with yours.

## Discovery
`GET /.well-known/openid-configuration` → JSON with `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `end_session_endpoint`, supported grants/scopes.

## JWKS
`GET /jwks.json` → `{"keys":[{"kty":"RSA","kid":"...","use":"sig","alg":"RS256","n":"...","e":"AQAB"}]}`

## Authorization / Login
`GET /Identity/Outh2/Login?response_type=code&client_id=<id>&redirect_uri=<uri>&scope=openid%20profile&state=<s>&code_challenge=<c>&code_challenge_method=S256`
Renders the login form. `POST` to the same path submits credentials; success → `302 <redirect_uri>?code=<code>&state=<s>`. Errors: invalid client/redirect_uri/scope are rendered as an error page, never redirected.

## Token
```bash
# authorization_code
curl -X POST http://sso.example.com/Token/Token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=authorization_code' -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET" \
  -d "code=$CODE" -d "redirect_uri=$REDIRECT_URI" -d "code_verifier=$VERIFIER"

# client_credentials (HTTP Basic)
curl -X POST http://sso.example.com/Token/Token -u "$CLIENT_ID:$CLIENT_SECRET" -d 'grant_type=client_credentials'
```
Success: `{"access_token":"...","token_type":"Bearer","expires_in":3600,...}`. Errors: `{"error":"invalid_grant"|"invalid_client"|"unsupported_grant_type"|...}`.
Put the command on **one line** when pasting.

## UserInfo
`GET /UserInfo/GetUserInfo` with `Authorization: Bearer <access_token>` → user claims (`sub`, name, email, ...). The vendor-compatible query-string token is also accepted (not recommended).

## Logout
`GET /Identity/Outh2/Logout?...` (aliases `/Identity/Logout`) → redirects to the **origin** of the supplied URL if it is in the client's `allowed_origins`, else `400`.

## Knox SSO (Ranger)
- `GET|POST /Identity/KnoxSso/Login?originalUrl=<url>` - form, then sets `hadoop-jwt` and `302 originalUrl`. `originalUrl` origin must be in `RANGER_ALLOWED_ORIGINS`.
- `GET /Identity/KnoxSso/Logout?originalUrl=<url>` - clears the cookie and redirects (same allowlist).

## Health
Check `/.well-known/openid-configuration` returns 200; no dedicated health route.
