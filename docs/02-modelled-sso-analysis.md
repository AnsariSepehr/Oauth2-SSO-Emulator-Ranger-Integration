# 2. The modelled SSO ("Smart SSO") - contract and quirks

The emulator reproduces the *developer-facing contract* of a bank SSO, as described in its public third-party integration guide (not reproduced here; the vendor PDFs are intentionally excluded from the repo). All hostnames below are placeholders.

## Concepts
- Built on **OAuth 2.0**; main user flow is `authorization_code` (PKCE recommended), `client_credentials` for service-to-service.
- Roles: Authorization Server, Login UI, Client (third-party app), resource access via `access_token`.

## Client registration (what the vendor gives you)

| Field | Meaning |
|---|---|
| ClientId / ClientSecret | identity and secret of your app |
| Redirect URIs | exact allowed callback URLs |
| Scopes | e.g. `openid`, `profile`, `EmployeeCode` |
| Grant types | `authorization_code` or `client_credentials` |
| UsePkce | if true, `code_challenge` and `code_verifier` are mandatory |
| IsActive | inactive clients are rejected |

## Endpoints

| Endpoint | Method | Path |
|---|---|---|
| Discovery | GET | `/.well-known/openid-configuration` |
| Authorization / Login | GET | `/Identity/Outh2/Login` |
| Token | POST | `/Token/Token` |
| UserInfo | GET | `/UserInfo/GetUserInfo` |
| JWKS | GET | `/jwks.json` |
| Logout | GET | `/Identity/Outh2/Logout` |

Login and logout live on the "SSO" host, token/userinfo/JWKS/discovery on the "API" host; the emulator serves them all from one server (configurable base URLs).

## Authorization request
`response_type=code` (only), `client_id`, `redirect_uri` (must match), `scope` (space separated, registered only), `state` (strongly recommended, validate on callback), `code_challenge` + `code_challenge_method` (`S256` recommended, or `plain`) when PKCE is on.

## Token request
`POST` `application/x-www-form-urlencoded` with `grant_type`, client credentials, `code`, `redirect_uri`, `code_verifier`.

## Quirks deliberately replicated
1. **"Outh2" spelling** in paths (vendor typo, kept on purpose so client code matches).
2. **Discovery lists multiple `response_types_supported`, but only `code` works.**
3. **Logout redirect uses the origin only** (scheme+host+port), not the full URL.
4. Separate login vs API hosts.
5. Development base URLs use localhost ports (issuer 5205).

## Not covered / unknown
Exact token claim names beyond the standard ones, error body formats for every failure, and session lifetimes are not fully specified in the guide; the emulator uses sensible OAuth2 defaults. Verify against the real provider before relying on any detail.
