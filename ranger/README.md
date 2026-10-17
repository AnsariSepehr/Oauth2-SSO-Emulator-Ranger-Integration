# Ranger side of the integration

| File | Purpose |
|---|---|
| [`apply-sso-config.py`](apply-sso-config.py) | Enables SSO in `ranger-admin-site.xml`: backs the file up, validates the certificate, edits only the `ranger.sso.*` properties, refuses to write invalid XML. Idempotent. |
| [`ranger-admin-site.sso-snippet.xml`](ranger-admin-site.sso-snippet.xml) | Annotated copy of the resulting `ranger.sso.*` block (certificate masked). |
| [`../test/fixtures/ranger-admin-site.before.xml`](../test/fixtures/ranger-admin-site.before.xml) / [`.after.xml`](../test/fixtures/ranger-admin-site.after.xml) | A real (masked) Ranger 2.6.0 config before/after enabling SSO. `diff` them to see exactly what changes. |

```bash
# on the SSO server: print the certificate Ranger needs
npm run --silent ranger-cert | tail -1

# on the Ranger server: preview, then apply, then restart
python3 apply-sso-config.py --file /etc/ranger/admin/conf/ranger-admin-site.xml \
  --provider-url http://sso.example.com/Identity/KnoxSso/Login \
  --certificate "<paste certificate>" --dry-run
# ... re-run without --dry-run ...
sudo systemctl restart ranger-admin
```

Full walkthrough, verification and rollback: [`docs/04-ranger-integration.md`](../docs/04-ranger-integration.md).
