# 3. Installation on Rocky Linux

Tested layout: Rocky Linux, Node.js 20, PostgreSQL, nginx, optionally on the same host as FreeIPA. Hostnames are placeholders (`sso.example.com`).

## 1. Packages
```bash
sudo dnf module enable -y nodejs:20 && sudo dnf install -y nodejs npm git openssl nginx
sudo dnf install -y postgresql-server && sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

## 2. Database
```bash
cd /tmp   # avoids the harmless "could not change directory" warning
sudo -u postgres psql <<'SQL'
CREATE USER sso WITH PASSWORD '<strong-password>';
CREATE DATABASE sso OWNER sso;
SQL
```
Password authentication for local TCP: in `pg_hba.conf` use `scram-sha-256` (or `md5`) for `127.0.0.1/32` and `::1/128`, then `sudo systemctl reload postgresql`.

## 3. Application
```bash
sudo useradd -r -m -d /opt/sso -s /sbin/nologin sso
sudo git clone https://github.com/<your-org>/sso-emulator-ranger-integration.git /opt/sso
cd /opt/sso && sudo -u sso npm ci --omit=dev
sudo -u sso cp .env.example .env && sudo chmod 600 /opt/sso/.env   # edit it
sudo -u sso npm run migrate && sudo -u sso npm run genkeys && sudo -u sso npm run seed
```
`DATABASE_URL=postgres://sso:<password>@127.0.0.1:5432/sso` - URL-encode special characters (`@` → `%40`).

## 4. systemd
```bash
sudo cp deploy/systemd/sso.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now sso
journalctl -u sso -f
```

## 5. nginx, firewall, SELinux
```bash
sudo cp deploy/nginx/sso.conf /etc/nginx/conf.d/ && sudo nginx -t
sudo setsebool -P httpd_can_network_connect 1      # nginx -> Node on 127.0.0.1:5205
sudo firewall-cmd --permanent --add-service=http && sudo firewall-cmd --reload
sudo systemctl enable --now nginx
```
Without the SELinux boolean nginx returns 502 even though Node is healthy (check `ausearch -m avc -ts recent`).

## 6. DNS
Create records (or `/etc/hosts` on every client machine, including the one running the browser):
```
192.0.2.10  sso.example.com ranger.example.com
```

## 7. Co-hosting with FreeIPA
It works if ports and names do not clash: FreeIPA uses 80/443 (httpd), 389/636, 88, 53. Either give the SSO its **own port** (e.g. serve it directly on `:5205` or via nginx on another port) or own hostname behind the existing httpd as a reverse-proxy vhost. Do not start nginx on 80/443 while FreeIPA's httpd holds them. A separate VM is cleaner if you can.

## 8. HTTPS later
Uncomment the HTTPS block in `deploy/nginx/sso.conf`, install your certificate, set `COOKIE_SECURE=true`, change `ISSUER_BASE_URL`/`API_BASE_URL`/Ranger `providerurl` to `https://`, regenerate nothing (the signing key is unchanged).

## Verify
```bash
curl -s http://sso.example.com/.well-known/openid-configuration | head
curl -s http://sso.example.com/jwks.json
```
