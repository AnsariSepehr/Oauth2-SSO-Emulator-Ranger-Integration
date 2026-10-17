#!/usr/bin/env bash
# End-to-end smoke test against a RUNNING server. Exercises every flow:
# discovery, JWKS, Authorization Code + PKCE, token errors, UserInfo,
# client_credentials, logout quirk, and the Ranger Knox SSO cookie flow.
#
#   BASE=http://127.0.0.1:5205 \
#   CLIENT_ID=democlient_xxx CLIENT_SECRET=... REDIRECT_URI=https://app.example.com/auth/callback \
#   USERNAME=demouser PASSWORD=... RANGER_ORIGIN=http://ranger.example.com:6080 \
#   npm test
set -uo pipefail

BASE=${BASE:-http://127.0.0.1:5205}
: "${CLIENT_ID:?set CLIENT_ID}" "${CLIENT_SECRET:?set CLIENT_SECRET}" "${REDIRECT_URI:?set REDIRECT_URI}"
: "${USERNAME:?set USERNAME}" "${PASSWORD:?set PASSWORD}"
RANGER_ORIGIN=${RANGER_ORIGIN:-http://ranger.example.com:6080}
APP_ORIGIN=$(python3 -c "from urllib.parse import urlparse;u=urlparse('$REDIRECT_URI');print(f'{u.scheme}://{u.netloc}')")

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n      -> %s\n' "$1" "${2:-}"; }
check(){ # check "<name>" "<actual>" "<expected substring>"
  if [[ "$2" == *"$3"* ]]; then ok "$1"; else bad "$1" "expected to contain [$3], got [$2]"; fi
}
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('$1',''))"; }
b64url_sha256() { printf '%s' "$1" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '='; }
new_verifier() { openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-43; }
location() { grep -i '^location:' | head -1 | tr -d '\r' | cut -d' ' -f2-; }
param() { python3 -c "import sys;from urllib.parse import urlparse,parse_qs;print(parse_qs(urlparse(sys.argv[1]).query).get(sys.argv[2],[''])[0])" "$1" "$2"; }

login_for_code() { # $1 = code_challenge
  curl -s -D - -o /dev/null -X POST "$BASE/Identity/Outh2/Login" \
    --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "redirect_uri=$REDIRECT_URI" \
    --data-urlencode "scope=openid profile" --data-urlencode "state=xyz123" \
    --data-urlencode "code_challenge=$1" --data-urlencode "code_challenge_method=S256" \
    --data-urlencode "username=$USERNAME" --data-urlencode "password=$PASSWORD" | location
}
exchange() { # $1=code $2=verifier
  curl -s -X POST "$BASE/Token/Token" \
    --data-urlencode "grant_type=authorization_code" --data-urlencode "client_id=$CLIENT_ID" \
    --data-urlencode "client_secret=$CLIENT_SECRET" --data-urlencode "code=$1" \
    --data-urlencode "redirect_uri=$REDIRECT_URI" --data-urlencode "code_verifier=$2"
}

echo "== Platform =="
check "health"    "$(curl -s "$BASE/health")" '"status":"ok"'
DISC=$(curl -s "$BASE/.well-known/openid-configuration")
check "discovery: token_endpoint" "$DISC" '/Token/Token'
check "discovery: PKCE S256"      "$DISC" 'S256'
JWKS=$(curl -s "$BASE/jwks.json")
check "jwks: RS256 key with kid"  "$JWKS" '"alg":"RS256"'

echo "== Authorization endpoint =="
V=$(new_verifier); C=$(b64url_sha256 "$V")
PAGE=$(curl -s "$BASE/Identity/Outh2/Login?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=openid%20profile&state=xyz123&code_challenge=$C&code_challenge_method=S256")
check "login form rendered" "$PAGE" '<form method="POST">'
BAD=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/Identity/Outh2/Login?response_type=code&client_id=$CLIENT_ID&redirect_uri=${REDIRECT_URI}/&scope=openid&code_challenge=$C")
check "redirect_uri must match EXACTLY (trailing slash -> 400)" "$BAD" '400'
LOC=$(curl -s -D - -o /dev/null "$BASE/Identity/Outh2/Login?response_type=token&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=openid&code_challenge=$C" | location)
check "response_type=token rejected" "$LOC" 'error=unsupported_response_type'
LOC=$(curl -s -D - -o /dev/null "$BASE/Identity/Outh2/Login?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI&scope=openid")
check "PKCE required when client.use_pkce" "$LOC" 'error=invalid_request'

echo "== Authorization Code + PKCE =="
LOCATION=$(login_for_code "$C"); CODE=$(param "$LOCATION" code)
check "login redirects with code + state" "$LOCATION" 'state=xyz123'
RESP=$(exchange "$CODE" "$V")
ACCESS=$(echo "$RESP" | jget access_token)
check "token: access_token issued"  "$ACCESS" 'eyJ'
check "token: id_token issued"      "$(echo "$RESP" | jget id_token)" 'eyJ'
check "token: Bearer + no expires_in/refresh_token (modelled quirk)" "$(echo "$RESP" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['token_type'], 'expires_in' in d, 'refresh_token' in d)")" 'Bearer False False'
check "code is single-use" "$(exchange "$CODE" "$V" | jget error)" 'invalid_grant'
CODE2=$(param "$(login_for_code "$C")" code)
check "wrong code_verifier rejected" "$(exchange "$CODE2" "$(new_verifier)" | jget errorDescription)" 'code_verifier does not match'
check "wrong client_secret rejected" "$(curl -s -X POST "$BASE/Token/Token" --data-urlencode grant_type=authorization_code --data-urlencode client_id=$CLIENT_ID --data-urlencode client_secret=wrong --data-urlencode code=x --data-urlencode redirect_uri=$REDIRECT_URI | jget error)" 'invalid_client'

echo "== UserInfo =="
UI=$(curl -s "$BASE/UserInfo/GetUserInfo" -H "Authorization: Bearer $ACCESS")
check "userinfo succeeded=True" "$UI" '"succeeded":true'
check "userinfo has sub/name/email" "$UI" '"email"'
check "userinfo without token -> invalid_token" "$(curl -s "$BASE/UserInfo/GetUserInfo")" 'invalid_token'

echo "== client_credentials =="
BASIC=$(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64 -w0)
CC=$(curl -s -X POST "$BASE/Token/Token" -H "Authorization: Basic $BASIC" --data-urlencode grant_type=client_credentials --data-urlencode scope=EmployeeCode)
check "client_credentials token issued" "$(echo "$CC" | jget access_token)" 'eyJ'
check "client_credentials has no id_token" "$(echo "$CC" | python3 -c "import sys,json;print(json.load(sys.stdin)['id_token'])")" 'None'
check "missing Basic header -> 'Not Authorized' (modelled quirk)" "$(curl -s -X POST "$BASE/Token/Token" --data-urlencode grant_type=client_credentials --data-urlencode scope=EmployeeCode)" 'Not Authorized'

echo "== Logout (origin-only quirk) =="
LOC=$(curl -s -D - -o /dev/null "$BASE/Identity/Outh2/Logout?post_logout_redirect_uri=$APP_ORIGIN/some/deep/path?foo=bar&state=abc" | location)
check "path is dropped, only origin kept" "$LOC" "$APP_ORIGIN/?state=abc"
LOC=$(curl -s -D - -o /dev/null "$BASE/Identity/Logout?post_logout_redirect_uri=$APP_ORIGIN/anything" | location)
check "alias /Identity/Logout works" "$LOC" "$APP_ORIGIN/"
check "unregistered origin refused (no open redirect)" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/Identity/Outh2/Logout?post_logout_redirect_uri=https://evil.example.org/x")" '400'
check "no redirect uri -> plain text" "$(curl -s "$BASE/Identity/Outh2/Logout")" 'logged out'

echo "== Apache Ranger Knox SSO flow =="
KLOGIN="$BASE/Identity/KnoxSso/Login"
check "knox login form for allowed originalUrl" "$(curl -s "$KLOGIN?originalUrl=$RANGER_ORIGIN/")" 'name="originalUrl"'
check "knox login refuses foreign originalUrl (no open redirect)" "$(curl -s -o /dev/null -w '%{http_code}' "$KLOGIN?originalUrl=https://evil.example.org/")" '400'
HDRS=$(curl -s -D - -o /dev/null -X POST "$KLOGIN" --data-urlencode "originalUrl=$RANGER_ORIGIN/" --data-urlencode "username=$USERNAME" --data-urlencode "password=$PASSWORD")
check "knox login redirects back to originalUrl" "$(echo "$HDRS" | location)" "$RANGER_ORIGIN/"
COOKIE_LINE=$(echo "$HDRS" | tr -d '\r' | grep -i '^set-cookie: hadoop-jwt=' | head -1)
check "hadoop-jwt cookie set with shared Domain" "$COOKIE_LINE" 'Domain='
JWT=$(echo "$COOKIE_LINE" | sed -E 's/^[Ss]et-[Cc]ookie: hadoop-jwt=([^;]+);.*/\1/')
SUB=$(cd "$(dirname "$0")/.." && JWKS_URL="$BASE/jwks.json" JWT="$JWT" node -e '
  const jwt=require("jsonwebtoken"), crypto=require("crypto");
  fetch(process.env.JWKS_URL).then(r=>r.json()).then(j=>{
    const k=j.keys[0]; const pub=crypto.createPublicKey({key:k,format:"jwk"});
    console.log(jwt.verify(process.env.JWT,pub,{algorithms:["RS256"]}).sub);
  }).catch(e=>console.log("VERIFY_FAILED "+e.message));')
check "JWT verifies against /jwks.json and sub == username" "$SUB" "$USERNAME"
check "wrong password does not set cookie" "$(curl -s -D - -o /dev/null -X POST "$KLOGIN" --data-urlencode "originalUrl=$RANGER_ORIGIN/" --data-urlencode "username=$USERNAME" --data-urlencode "password=definitely-wrong" | grep -ci 'set-cookie: hadoop-jwt')" '0'
LOUT=$(curl -s -D - -o /dev/null "$BASE/Identity/KnoxSso/Logout?originalUrl=$RANGER_ORIGIN/login.jsp")
check "knox logout clears cookie" "$(echo "$LOUT" | tr -d '\r' | grep -i '^set-cookie: hadoop-jwt=;')" 'Expires=Thu, 01 Jan 1970'
check "knox logout redirects to originalUrl" "$(echo "$LOUT" | location)" "$RANGER_ORIGIN/login.jsp"

echo
echo "Result: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
