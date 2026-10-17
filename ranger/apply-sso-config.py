#!/usr/bin/env python3
"""Enable Knox SSO in Apache Ranger's ranger-admin-site.xml.

Sets (or adds) the ranger.sso.* properties, keeps every other line untouched,
and writes a timestamped backup next to the file first. Python 3 stdlib only.

  python3 ranger/apply-sso-config.py \
      --file /etc/ranger/admin/conf/ranger-admin-site.xml \
      --provider-url http://sso.example.com/Identity/KnoxSso/Login \
      --certificate "$(npm run --silent ranger-cert | tail -1)"

Use --dry-run first to see the diff. Afterwards: systemctl restart ranger-admin
"""
import argparse
import base64
import difflib
import re
import shutil
import subprocess
import sys
import time
from xml.dom import minidom


def check_certificate(b64: str) -> None:
    """Refuse anything that is not an X.509 CERTIFICATE.

    Ranger wraps ranger.sso.publicKey in BEGIN/END CERTIFICATE and parses it with
    CertificateFactory("X.509"). A raw RSA public key (SubjectPublicKeyInfo) also
    starts with "MII..." in base64, so a prefix check is NOT enough - that mistake
    made Ranger fail with a NullPointerException in RSASSAVerifier (docs/05).
    """
    fail = ("ERROR: --certificate must be the BASE64 BODY of an X.509 CERTIFICATE "
            "(use `npm run ranger-cert`), not a raw public key. See docs/05-troubleshooting-bugs-log.md")
    try:
        der = base64.b64decode(b64, validate=True)
    except Exception:
        sys.exit("ERROR: --certificate is not valid base64 (no BEGIN/END lines, no spaces).\n" + fail)
    # SubjectPublicKeyInfo: SEQUENCE { SEQUENCE { OID rsaEncryption ... } BIT STRING }
    if b"\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" in der[:24]:
        sys.exit("ERROR: this is a raw RSA public key, not a certificate.\n" + fail)
    if shutil.which("openssl"):
        r = subprocess.run(["openssl", "x509", "-inform", "DER", "-noout"], input=der, capture_output=True)
        if r.returncode != 0:
            sys.exit("ERROR: openssl cannot parse the value as an X.509 certificate.\n" + fail)


def set_property(xml: str, name: str, value: str) -> str:
    """Replace the <value> of <name>, or append a new <property> before </configuration>."""
    value = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # <name>X</name> ... <value>old</value>   OR   <value />   (but not past the next </property>)
    pattern = re.compile(
        r"(<name>\s*" + re.escape(name) + r"\s*</name>\s*)<value\s*/>|"
        r"(<name>\s*" + re.escape(name) + r"\s*</name>\s*<value>)[^<]*(</value>)",
        re.S,
    )
    if pattern.search(xml):
        return pattern.sub(
            lambda m: (m.group(1) + f"<value>{value}</value>")
            if m.group(1)
            else (m.group(2) + value + m.group(3)),
            xml,
            count=1,
        )
    block = f"\t<property>\n\t\t<name>{name}</name>\n\t\t<value>{value}</value>\n\t</property>\n"
    return xml.replace("</configuration>", block + "</configuration>", 1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True, help="path to ranger-admin-site.xml")
    ap.add_argument("--provider-url", required=True, help="e.g. http://sso.example.com/Identity/KnoxSso/Login")
    ap.add_argument("--certificate", required=True, help="base64 body of the X.509 cert (npm run ranger-cert)")
    ap.add_argument("--cookie-name", default="hadoop-jwt")
    ap.add_argument("--query-param", default="originalUrl")
    ap.add_argument("--useragents", default="Mozilla,chrome")
    ap.add_argument("--dry-run", action="store_true", help="show the diff, change nothing")
    a = ap.parse_args()

    cert = re.sub(r"\s+", "", a.certificate)
    check_certificate(cert)

    original = open(a.file, encoding="utf-8").read()
    updated = original
    for name, value in [
        ("ranger.sso.enabled", "true"),
        ("ranger.sso.providerurl", a.provider_url),
        ("ranger.sso.publicKey", cert),
        ("ranger.sso.cookiename", a.cookie_name),
        ("ranger.sso.query.param.originalurl", a.query_param),
        ("ranger.sso.browser.useragent", a.useragents),
    ]:
        updated = set_property(updated, name, value)

    minidom.parseString(updated.encode("utf-8"))  # refuse to write broken XML

    diff = "".join(difflib.unified_diff(
        original.splitlines(True), updated.splitlines(True), "before", "after", n=0))
    # never print the whole certificate
    print(re.sub(r"(MII[A-Za-z0-9+/=]{20})[A-Za-z0-9+/=]+", r"\1...", diff) or "No changes needed.")

    if a.dry_run or original == updated:
        return 0
    backup = f"{a.file}.bak.{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(a.file, backup)
    open(a.file, "w", encoding="utf-8").write(updated)
    print(f"\nBackup: {backup}\nUpdated: {a.file}\nNow run: systemctl restart ranger-admin")
    return 0


if __name__ == "__main__":
    sys.exit(main())
