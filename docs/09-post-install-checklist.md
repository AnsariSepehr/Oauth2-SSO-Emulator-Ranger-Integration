# 9. Post-install checklist

## SSO server
- [ ] `.env` created from `.env.example`; `chmod 600 .env`; not in git.
- [ ] `DATABASE_URL` password URL-encoded (`@` → `%40`).
- [ ] `SESSION_SECRET` is a long random value (`openssl rand -hex 32`).
- [ ] `ISSUER_BASE_URL`, `API_BASE_URL` match the public hostnames.
- [ ] `COOKIE_DOMAIN=.<your-domain>`; `COOKIE_SECURE=true` once on HTTPS.
- [ ] `RANGER_ALLOWED_ORIGINS` set (otherwise the Knox flow refuses to redirect).
- [ ] `npm run migrate && npm run genkeys && npm run seed`; store the printed demo credentials, then change/delete the demo user and client.
- [ ] systemd unit running as unprivileged `sso` user; `journalctl -u sso` clean.
- [ ] `npm test` passes (33/33).

## Host (Rocky Linux)
- [ ] firewalld opens only 80/443 (and 6080 for Ranger if needed); 5205 stays local.
- [ ] SELinux: `setsebool -P httpd_can_network_connect 1` for nginx → Node.
- [ ] DNS (or `/etc/hosts` on **every client**) resolves both `sso.` and `ranger.` hostnames.
- [ ] Time synchronised (chrony) - JWT validation depends on clocks.

## Ranger
- [ ] Ranger loads normally with internal login **before** enabling SSO.
- [ ] MySQL not read-only (`SELECT @@read_only;` → 0) and persisted in `my.cnf`.
- [ ] Certificate generated with `npm run ranger-cert` (X.509, not raw key).
- [ ] `apply-sso-config.py` run; backup file exists; Ranger restarted.
- [ ] Test users exist in Ranger **and** the SSO with identical usernames.
- [ ] Private-window login works; log shows `SSO login user : <name>`.
- [ ] Break-glass local `admin` login tested (API/non-browser path).

## Before calling it done
- [ ] Read [07](07-limitations-and-security.md) and decide which gaps matter for your environment.
- [ ] Rotate any secret that was ever shared in chat or tickets.
