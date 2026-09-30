# HTTP Signature Authentication for Visa Acceptance REST APIs

Reference for agents making authenticated API calls (e.g., DMS activation codes).

**Note:** HTTP Signature is deprecated by September 2026. Use JWT when possible.
This reference exists because some merchants still use shared secret keys.

## CRITICAL: Two Different MID Values

The DMS API uses **two separate merchant IDs** that are often different:

| Variable | Header/Location | Purpose | Example |
|----------|----------------|---------|---------|
| `ORG_ID` | `v-c-merchant-id` header | EBC organization identity for API auth | `cp_merchant1_1` |
| `TRANSACTING_MID` | URL path `/dms/v2/merchants/{HERE}/...` | The MID the terminal transacts under | `pwk_terminal_mid_1` |

**Using the same value for both causes:**
- 412 `organization.not.boarded.partner` — ORG_ID used in URL (wrong: it's not the terminal's transacting MID)
- 401 `Authentication Failed` — TRANSACTING_MID used in v-c-merchant-id header (wrong: not the API auth identity)

**Where to find each:**
- `ORG_ID`: Business Center → top-right corner or Organization Settings
- `TRANSACTING_MID`: Business Center → Acceptance Devices → Terminal Management → Merchant ID column

## Required Headers

| Header | Value | Notes |
|--------|-------|-------|
| `Host` | `apitest.visaacceptance.com` (test) or `api.visaacceptance.com` (prod) | |
| `Date` | RFC1123 format: `Thu, 16 Jul 2026 11:18:59 GMT` | |
| `Content-Type` | `application/json` | |
| `v-c-merchant-id` | **`ORG_ID`** (EBC org ID, NOT the transacting MID) | |
| `Digest` | `SHA-256=<base64(sha256(body))>` | POST only. Omit for GET |
| `Signature` | See format below | |

## Signature Header Format

```
keyid="<KEY_ID>", algorithm="HmacSHA256", headers="host date (request-target) digest v-c-merchant-id", signature="<SIGNATURE>"
```

For GET requests, omit `digest` from the headers list.

## Signing String Construction

Each line is a header name (lowercase) followed by `: ` and its value.
Lines are separated by `\n`. **No trailing newline** on the last line.

**POST example (DMS activation code):**

```
host: apitest.visaacceptance.com
date: Thu, 16 Jul 2026 11:18:59 GMT
(request-target): post /dms/v2/merchants/pwk_terminal_mid_1/activation-codes?size=1
digest: SHA-256=RBNvo1WzZ4oRRq0W9+hknpT7T8If536DEMBg9hyq/4o=
v-c-merchant-id: cp_merchant1_1
```

**Key details:**
- `(request-target)` includes the HTTP method (lowercase) + space + full path with query string
- `(request-target)` URL uses `TRANSACTING_MID` (the terminal's transacting MID)
- `v-c-merchant-id` uses `ORG_ID` (EBC org ID) — these are DIFFERENT values
- `date` value must match the `Date:` header exactly
- `digest` value must match the `Digest:` header exactly

## HMAC-SHA256 Computation (bash/macOS)

The shared secret key is base64-encoded. It must be decoded to raw bytes before use.

**CRITICAL:** `openssl dgst -hmac` takes a **string** argument, not binary. To pass
binary key material, decode to hex and use `-macopt hexkey:`:

```bash
# 1. Decode secret from base64 to hex
SECRET_HEX=$(echo -n "$SECRET_KEY" | base64 -D | xxd -p | tr -d '\n')

# 2. Compute HMAC-SHA256 with hex key
SIGNATURE=$(printf '%s' "$SIGNING_STRING" | openssl dgst -sha256 -mac hmac -macopt hexkey:${SECRET_HEX} -binary | base64)
```

**Common mistake (WRONG):**
```bash
# WRONG - passes base64 string as HMAC key, not decoded bytes
SIGNATURE=$(printf '%s' "$SIGNING_STRING" | openssl dgst -sha256 -hmac "$SECRET_KEY" -binary | base64)

# WRONG - base64 -d on macOS doesn't work (use -D or --decode)
SECRET_HEX=$(echo -n "$SECRET_KEY" | base64 -d | xxd -p | tr -d '\n')
```

## Complete bash Example: Generate Activation Code

```bash
#!/bin/bash
# Generate DMS activation code for PAX terminal
# Inputs: ORG_ID, TRANSACTING_MID, KEY_ID, SECRET_KEY
#
# ORG_ID          = EBC organization ID (for v-c-merchant-id header / API auth)
# TRANSACTING_MID = the terminal's transacting MID (for URL path / terminal identity)
# KEY_ID          = REST shared secret key ID from EBC Key Management
# SECRET_KEY      = The base64-encoded shared secret value

HOST="apitest.visaacceptance.com"
REQUEST_TARGET="post /dms/v2/merchants/${TRANSACTING_MID}/activation-codes?size=1"
BODY='{}'

# Date in RFC1123
DATE=$(date -u +"%a, %d %b %Y %H:%M:%S GMT")

# Digest of body
DIGEST="SHA-256=$(echo -n "$BODY" | openssl dgst -sha256 -binary | base64)"

# Signing string — NOTE: v-c-merchant-id uses ORG_ID (not TRANSACTING_MID)
SIGNING_STRING="host: ${HOST}
date: ${DATE}
(request-target): ${REQUEST_TARGET}
digest: ${DIGEST}
v-c-merchant-id: ${ORG_ID}"

# Decode secret to hex, compute HMAC
SECRET_HEX=$(echo -n "$SECRET_KEY" | base64 -D | xxd -p | tr -d '\n')
SIGNATURE=$(printf '%s' "$SIGNING_STRING" | openssl dgst -sha256 -mac hmac -macopt hexkey:${SECRET_HEX} -binary | base64)

# Assemble Signature header
SIG_HEADER="keyid=\"${KEY_ID}\", algorithm=\"HmacSHA256\", headers=\"host date (request-target) digest v-c-merchant-id\", signature=\"${SIGNATURE}\""

# Make the call — v-c-merchant-id = ORG_ID, URL path = TRANSACTING_MID
curl -sS -X POST "https://${HOST}/dms/v2/merchants/${TRANSACTING_MID}/activation-codes?size=1" \
  -H "Host: ${HOST}" \
  -H "Content-Type: application/json" \
  -H "Date: ${DATE}" \
  -H "v-c-merchant-id: ${ORG_ID}" \
  -H "Digest: ${DIGEST}" \
  -H "Signature: ${SIG_HEADER}" \
  -d "$BODY"
```

**Expected success response (HTTP 201):**
```json
{
  "activationCodes": [
    { "token": "ABC12345", "ttl": 86400000 }
  ]
}
```

The `token` is the 8-character activation code to enter on the terminal.
`ttl` is time-to-live in milliseconds (24 hours).

## Troubleshooting

| HTTP Code | Response | Cause | Fix |
|-----------|----------|-------|-----|
| 401 | `Authentication Failed` | Signature mismatch | Check signing string format, key decoding, headers list |
| 406 | WAF "contact support" page | Malformed request before auth check | Check Content-Type, ensure body is valid JSON, check key is decoded from base64 to hex |
| 412 | `organization.not.boarded.partner` | Wrong MID in URL path — used ORG_ID instead of TRANSACTING_MID | Use TRANSACTING_MID (the terminal's transacting MID) in URL path, ORG_ID in v-c-merchant-id header |
| 412 | `organization.not.boarded.partner` | TRANSACTING_MID not boarded for DMS | Verify in Business Center: Acceptance Devices → Terminal Management shows this MID |
| 400 | `Invalid or missing fields` | Wrong body format | Use `?size=1` query param with `{}` body |

## Linux Compatibility

On Linux, replace `base64 -D` with `base64 -d`:

```bash
SECRET_HEX=$(echo -n "$SECRET_KEY" | base64 -d | xxd -p | tr -d '\n')
```

Or use a portable approach:

```bash
SECRET_HEX=$(echo -n "$SECRET_KEY" | python3 -c "import sys,base64; sys.stdout.buffer.write(base64.b64decode(sys.stdin.read()))" | xxd -p | tr -d '\n')
```
