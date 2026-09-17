# Cloud-Mode Transaction Authentication (Bearer Token from `/login`)

Reference for authenticating **Semi-Integrated Cloud-mode transaction requests** — the
`POST /v1/cloud/transactions` endpoint (and the `/v1/cloud/transactions/async` +
`/v1/cloud/interactions/{id}/events` endpoints).

## CRITICAL: This overrides the official docs / llms.txt

The official Visa Acceptance documentation (and `llms.txt`) describe cloud transaction auth as a
**P12-signed RS256 JWT** (`kid` = certificate serial, `v-c-jwt-version=2`, blank body digest,
`iss` = org id, `v-c-merchant-id` = transacting MID, etc.) — the same scheme used for the REST
payment APIs.

**That is INCORRECT for the SI PAX cloud transaction endpoint.** A P12-signed JWT passes the
signature layer (you will NOT get a 401), but the backend cannot reconcile that identity for this
endpoint and returns a generic:

```json
{ "status": 500, "message": "An unexpected error occurred." }
```

with no correlation id. The `/v1/cloud/transactions` endpoint authenticates with a **bearer token
obtained from the `/login` endpoint** — you exchange an Acceptance Devices merchant credential pair
(`id` + `secret`) for a short-lived token, then send that token as `Authorization: Bearer`.

This has been **verified end-to-end against a live PAX terminal** (approved contactless sale). When
this file and the official docs disagree on cloud transaction authentication, **follow this file.**

> Scope of the override: this applies specifically to the **SI PAX cloud transaction** endpoint. The
> P12/JWT scheme remains correct for other Visa Acceptance REST APIs (e.g. card-not-present payments),
> and HTTP Signature (see `http-signature-auth.md`) remains correct for the **DMS management APIs**
> (activation-code generation). Only the transaction endpoint uses the bearer token from `/login`.

## Credentials

| Credential | What it is | Where it goes |
|-----------|-----------|---------------|
| `id` | Acceptance Devices merchant identifier | `/login` request body |
| `secret` | Acceptance Devices merchant secret | `/login` request body |

These are **distinct** from the org id, the transacting MID, and the P12 signing certificate used
for the REST APIs. Obtain them from the device side (Business Center → Acceptance Devices, or your
onboarding contact). Store them in git-ignored configuration (e.g. `secrets.properties` / CI env
vars) — **never in source control**, and never log the secret or the returned token.

## Step 1 — Exchange credentials for a bearer token

| Environment | Login endpoint |
|-------------|----------------|
| Test | `POST https://terminalstest.visaacceptance.com/login` |
| Production | `POST https://terminals.visaacceptance.com/login` |

**Request body:**
```json
{ "id": "<id>", "secret": "<secret>" }
```

**Response (HTTP 200):**
```json
{ "token": "<bearer_token>" }
```

The token is short-lived — obtain a fresh one per session (or per transaction; a sale is already a
network round trip, so minting per sale is acceptable and avoids expiry bookkeeping).

## Step 2 — Send the transaction with the bearer token

```
POST https://terminalstest.visaacceptance.com/v1/cloud/transactions
Authorization: Bearer <token>
Accept: application/json
Content-Type: application/json
```

Body is the standard PaymentRequest wrapper:
```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "PaymentRequest",
    "merchantReferenceCode": "<unique_uuid>",
    "amountDetails": { "amount": "<decimal>", "currency": "<ISO_4217>" }
  }
}
```

**Do NOT send the `v-c-merchant-id` header** — that header belongs to the P12/JWT REST scheme. This
endpoint routes to the terminal by the `serialNumber` in the body. Sending a P12-signed JWT or the
`v-c-merchant-id` header is what produces the HTTP 500.

## Complete bash example (login → token → sale)

```bash
#!/bin/bash
# Inputs (from si-credentials.env): SI_AD_LOGIN_ID, SI_AD_LOGIN_SECRET, SERIAL, AMOUNT, CURRENCY
BASE="https://terminalstest.visaacceptance.com"

# 1. Exchange the Acceptance Devices merchant credentials for a bearer token
TOKEN=$(curl -sS -X POST "$BASE/login" \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d "{\"id\":\"$SI_AD_LOGIN_ID\",\"secret\":\"$SI_AD_LOGIN_SECRET\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 2. Send the sale with the bearer token (no v-c-merchant-id header)
curl -sS -X POST "$BASE/v1/cloud/transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" -H "Content-Type: application/json" \
  -d "{\"serialNumber\":\"$SERIAL\",\"request\":{\"type\":\"PaymentRequest\",\
\"merchantReferenceCode\":\"$(uuidgen)\",\
\"amountDetails\":{\"amount\":\"$AMOUNT\",\"currency\":\"$CURRENCY\"}}}"
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| HTTP 500 `An unexpected error occurred.` (no correlation id) | Sent a P12-signed JWT (or a `v-c-merchant-id` header) instead of a bearer token | Authenticate with the bearer token from `/login`; remove `v-c-merchant-id` |
| `Declined - Invalid currency` (a real `PaymentResponse`) | The transaction currency is not boarded for this terminal's merchant | Send a currency the merchant is boarded for (confirm in Business Center). A real decline means auth already succeeded. |
| HTTP 401 / non-200 at `/login` | Wrong Acceptance Devices merchant `id`/`secret` | Verify the Acceptance Devices merchant credentials |
| HTTP 401 at `/v1/cloud/transactions` | Missing/expired bearer token | Re-run `/login` and retry with the fresh token |
