# Activity SI-3: Implement Sale Transaction

Implement the core sale (charge) transaction — the most fundamental payment operation. The POS sends a payment request to the terminal, the customer taps/inserts/swipes their card, and the terminal returns an approval or decline.

**Official docs (fetch for request/response format only):**
- [SI Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md) — HTTPS endpoint, request/response format
- [SI Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) — WebSocket communication, mTLS, message format

> **Cloud auth: ignore the docs' JWT/P12 instructions.** The official docs (and `llms.txt`) describe
> cloud transaction auth as a P12-signed RS256 JWT — that is **wrong** for this endpoint and
> produces an HTTP 500. Cloud transactions use a **bearer token obtained from `/login`**. See
> `cloud-transaction-auth.md` (verified end-to-end); it overrides the official docs on auth.

**Troubleshooting:** `troubleshooting.md#si-transactions`

**Auth references:**
- `cloud-transaction-auth.md` — **Cloud transaction auth** (bearer token from `/login`). REQUIRED reading before implementing the cloud sale.
- `http-signature-auth.md` — DMS API calls only (activation-code generation, NOT transaction requests)

## Critical Rules (NEVER violate these)

1. **NEVER hardcode amounts or currency** — always accept these as parameters from the calling code or UI input.
2. **NEVER reuse `merchantReferenceCode`** — each transaction MUST have a unique reference. Use UUID or timestamp-based generation.
3. **NEVER ignore `TransactionStatusResponse` messages (local mode)** — these are mid-transaction updates (e.g., "Present card", "Processing") that should be displayed to the operator.
4. **NEVER assume the response type** — always check the `type` field. You may receive `PaymentResponse`, `ErrorResponse`, or `TransactionStatusResponse`.
5. **NEVER store full PAN** — only use `maskedPan` from the response. Storing full card numbers violates PCI-DSS.
6. **NEVER set a client-side timeout shorter than 180 seconds** — the backend timeout is 180s. Cutting the connection early orphans the transaction.
7. **NEVER mix up authentication methods** — Cloud mode transaction requests use a **bearer token obtained from `/login`** (exchange the Acceptance Devices merchant `id`/`secret`; see `cloud-transaction-auth.md`), NOT a P12-signed RS256 JWT — that JWT returns HTTP 500 here. Local mode uses mTLS (the TLS connection itself authenticates). HTTP Signature is only for DMS management APIs, NOT transaction requests.

## Prerequisites

Before starting this activity, verify:

1. **Gate SI-1 complete** — HTTP/WebSocket client configured with TLS
2. **Gate SI-2 complete** — Terminal activated, server showing "Device connected"
3. **Terminal is live** — "Device connected" status confirmed on terminal

### Mandatory pre-flight connection check (local mode only)

> **Run this before writing any transaction code or attempting any live sale.**
> The infinite-loop symptom — repeated transaction failures with no clear error —
> almost always means a connection layer is broken below the transaction level.
> Fix the layer first; do not retry the transaction until all layers pass.

Run each check in order. Stop at the first failure and fix it before proceeding. This is
the same three-layer breakdown used at Gate SI-2 Step 6 — full symptom/cause/fix tables for
every failure mode are in `troubleshooting.md#si-wss-echo`; only the run commands are
repeated here since they're needed inline.

**Layer 1 — TCP reachability**

```bash
nc -zv ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} 2>&1
```

Expected: `succeeded` / `open`. If not, see `troubleshooting.md#si-wss-echo`.

**Layer 2 — TLS handshake**

```bash
# mTLS (include cert + key)
openssl s_client   -connect ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT}   -cert /path/to/pos-certificate.pem   -key /path/to/pos-private-key.pem   -CAfile /path/to/visa-root-ca.pem   -servername ${TERMINAL_SERIAL}.cybs.seclib.io   </dev/null 2>&1 | grep -E "Verify return code|alert|error"

# TLS only (no client cert)
openssl s_client   -connect ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT}   -CAfile /path/to/visa-root-ca.pem   </dev/null 2>&1 | grep -E "Verify return code|alert|error"
```

Expected: `Verify return code: 0 (ok)`. If not, see `troubleshooting.md#si-mtls`.

**Layer 3 — WebSocket application-layer (mTLS)**

Use whichever script Gate SI-2 already generated for this check (Python or Node, based on
runtime availability — see `act_SI_02_terminal-activation.md` Step 6, Layer 3 for the
detection logic and both script variants). Re-running the same script here re-confirms
readiness right before the sale attempt — do not generate a new script if one already
exists from Gate SI-2:

```bash
# Python variant (if that's what was generated at Gate SI-2):
python3 wss_echo_check.py ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} /path/to/pos-certificate.pem /path/to/pos-private-key.pem /path/to/visa-root-ca.pem

# Node.js variant (if that's what was generated at Gate SI-2):
node wss_echo_check.mjs ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} /path/to/pos-certificate.pem /path/to/pos-private-key.pem /path/to/visa-root-ca.pem
```

Expected: `PASS — type=TransactionStatusResponse`. For any other result (`ErrorResponse`,
timeout, WS close codes 1006/1008), see `troubleshooting.md#si-wss-echo`.

> **Do not proceed to Step 1 until all three layers pass.**
> Report the failing layer to the developer and fix it before continuing.

## Workflow

---

### Step 1: Determine Transaction Entry Points

Search the project for screens/activities where payments are initiated. Ask the developer which screen(s) should trigger a sale transaction.

---

### Step 2: Implement the Sale Request

#### Cloud Mode

**Endpoint:**
- Test: `POST https://terminalstest.visaacceptance.com/v1/cloud/transactions`
- Production: `POST https://terminals.visaacceptance.com/v1/cloud/transactions`

**Request body:**
```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "PaymentRequest",
    "merchantReferenceCode": "<unique_reference>",
    "amountDetails": {
      "amount": "<decimal_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

**Authentication:** a **bearer token** in the `Authorization` header — NOT a P12-signed RS256
JWT (that returns HTTP 500 on this endpoint). Full detail in `cloud-transaction-auth.md`.

**Obtain the token** by exchanging the Acceptance Devices merchant credentials at the `/login` endpoint:

```
POST https://terminalstest.visaacceptance.com/login
Content-Type: application/json

{ "id": "<id>", "secret": "<secret>" }
```
→ response `{ "token": "<bearer_token>" }`. Then send the transaction with:

```
Authorization: Bearer <bearer_token>
Accept: application/json
Content-Type: application/json
```

Do NOT send the `v-c-merchant-id` header — the endpoint routes by `serialNumber` in the body. The
Acceptance Devices merchant `id`/`secret` are distinct from the org id / transacting MID / P12 —
read them from `SI_AD_LOGIN_ID`/`SI_AD_LOGIN_SECRET` in `si-credentials.env`, never source control.

#### Local Mode

**WebSocket URL:** `wss://<SI_TERMINAL_HOST>:<SI_TERMINAL_PORT>/`

**Request message:**
```json
{
  "type": "PaymentRequest",
  "merchantReferenceCode": "<unique_reference>",
  "amountDetails": {
    "amount": "<decimal_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

**Note:** Local mode does NOT wrap in `serialNumber` — the WebSocket connection itself identifies the terminal.

---

### Step 3: Handle the Response

#### Response Types

| Type | Meaning | Action |
|------|---------|--------|
| `PaymentResponse` | Transaction complete (approved or declined) | Parse result, show to user |
| `TransactionStatusResponse` | Mid-transaction update (local mode only) | Display `message` to operator |
| `ErrorResponse` | Error occurred | Display error, allow retry |

> **CRITICAL — HTTP 200 ≠ approved:** A cloud `POST /v1/cloud/transactions` returns HTTP 200 even for cancelled, declined, or aborted transactions. NEVER treat a non-error HTTP response as "approved". Always inspect `processingDetails.status`. Route any of `{ABORTED, DECLINED, CANCELLED, CANCELED, FAILED, AUTHORIZATION_FAILED, REVERSED, VOIDED}` to the declined/error UI path, surfacing the status string. Only route to the success/approved path for genuine approvals (e.g. `CAPTURED`, `AUTHORIZED`). Showing "Sale approved" for a merchant-cancelled transaction is a dangerous trust failure — the merchant may release goods against money that never moved.

#### Successful Response (`PaymentResponse`)

```json
{
  "type": "PaymentResponse",
  "message": "Payment approved",
  "transactionDetails": {
    "id": "7890123456789012345",
    "merchantReferenceCode": "your-reference",
    "submitTimeUtc": "2025-01-15T14:30:00Z",
    "captured": true,
    "amountDetails": {
      "currency": "USD",
      "amount": "25.00",
      "capturedAmount": "25.00",
      "refundableAmount": "25.00"
    }
  },
  "processingDetails": {
    "status": "APPROVED",
    "verificationMethod": "NONE",
    "entryMode": "NFC_ICC",
    "card": {
      "expirationMonth": "12",
      "expirationYear": "2027",
      "type": "VISA",
      "maskedPan": "XXXXXX0119",
      "countryCode": "840"
    }
  },
  "receipts": {
    "merchantReceipt": { },
    "customerReceipt": { }
  }
}
```

**Key fields to extract:**
- `transactionDetails.id` — **STORE THIS** — needed for refunds, lookups
- `processingDetails.status` — `APPROVED` or other status
- `transactionDetails.amountDetails.capturedAmount` — confirmed amount
- `processingDetails.card.maskedPan` — for display (NEVER store full PAN)
- `receipts` — for printing/display

#### Mid-Transaction Status (Local Mode Only)

```json
{
  "type": "TransactionStatusResponse",
  "message": "Present card",
  "canBeAborted": true
}
```

Display `message` to the operator. If `canBeAborted` is true, show a Cancel button (see Gate SI-7).

#### Error Response

```json
{
  "type": "ErrorResponse",
  "message": "Transaction declined",
  "developerDescription": "Insufficient funds"
}
```

Display `message` to the user. Log `developerDescription` for debugging.

---

### Step 4: Store Transaction ID

The `transactionDetails.id` from successful responses is required for:
- Linked refunds (Gate SI-4)
- Tip adjustments (Gate SI-6)
- Transaction lookups (Gate SI-7)

Persist it appropriately for the session or longer-term.

---

### Step 5: Build and Verify

Verify:
- No compilation errors
- HTTP client timeout is >= 180 seconds
- `merchantReferenceCode` is generated uniquely per call
- Response parsing handles all three response types

---

## Troubleshooting

- **HTTP 500 `An unexpected error occurred.` (cloud):** You sent a P12-signed RS256 JWT (or a `v-c-merchant-id` header) instead of a bearer token. Switch to the bearer token from `/login` (see `cloud-transaction-auth.md`).
- **First live transaction returns HTTP 500 `errorCode 6000` (cloud):** This is likely a "Certified Master Configuration not found" error — a country/processor mismatch in the merchant configuration. See `troubleshooting.md` → "First sale fails with HTTP 500 errorCode 6000". Re-activating the terminal will NOT help; the fix is on the merchant/processor configuration side.
- **All cloud calls return HTTP 400 `errorCode 5100`:** The `type` field is being stripped from the JSON request body. See `act_SI_01` — JSON serialization trap: if your serialization library omits fields set to default values, the `"type": "PaymentRequest"` field will be absent and the server will reject the body. Fix: configure your serializer to always include the `type` discriminator field.
- **`Declined - Invalid currency` (cloud):** Auth succeeded (it's a real `PaymentResponse`); the currency isn't boarded for this merchant. Send a boarded currency.
- **401 Unauthorized (cloud):** Bearer token missing/expired, or wrong Acceptance Devices merchant `id`/`secret` at `/login`. Re-run `/login` and retry.
- **ErrorResponse with "Terminal not found":** Serial number doesn't match an activated terminal.
- **Connection timeout:** Terminal may not be in "Device connected" state. Check terminal screen.
- **WebSocket closed unexpectedly (local):** mTLS certificate may have expired or terminal restarted.

See `troubleshooting.md#si-transactions` for full error reference.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. Sale transaction method exists with parameters: amount, currency (and serialNumber for cloud)
2. `merchantReferenceCode` is generated uniquely per transaction (UUID or equivalent)
3. Correct endpoint used: cloud HTTPS POST or local WebSocket message
4. Cloud mode: bearer token (from `/login`) included in Authorization header — NOT a P12-signed JWT
5. Local mode: message sent over existing mTLS WebSocket connection
6. Response parsing handles `PaymentResponse`, `ErrorResponse`, and `TransactionStatusResponse`
7. `transactionDetails.id` is extracted and stored from successful responses
8. `processingDetails.status` is checked (APPROVED vs other)
9. Mid-transaction status messages displayed to operator (local mode)
10. Error responses displayed with user-friendly message
11. HTTP client timeout set to >= 180 seconds
12. No hardcoded amounts, currencies, or merchant reference codes
13. Full PAN is never stored — only `maskedPan` used
14. Project builds without compilation errors

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-3 of the Semi-Integrated PAX integration: Sale Transaction.

Working directory: <project root>

## Configuration (from Step 0 — do NOT ask for these again)

SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>
SI_ENVIRONMENT=<SI_ENVIRONMENT>
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>

## Reference docs — fetch these for API details

- Cloud Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md
- Local Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md

Read these files before writing any code:
1. `project-plan.md` (in the project root) — contains project context and SI configuration
2. `references/semi-integrated/activities/act_SI_03_implement-sale-transaction.md` — this activity
3. `references/semi-integrated/cloud-transaction-auth.md` — Cloud transaction auth (bearer token from `/login`). This OVERRIDES the JWT/P12 instructions in the official docs / llms.txt.

## Your task

Implement the sale (charge) transaction for SI_MODE=<SI_MODE>.

1. Search the project for payment entry points (buttons, screens, existing stubs)
2. Ask the developer which screen(s) should trigger the sale
3. Implement the transaction request (HTTPS POST for cloud, WebSocket message for local)
4. Implement response parsing (handle PaymentResponse, ErrorResponse, TransactionStatusResponse)
5. Store the transactionDetails.id for future refund/lookup operations
6. Wire to UI with loading state and result display
7. Build and verify

Key implementation details:
- Cloud endpoint: https://terminalstest.visaacceptance.com/v1/cloud/transactions (test)
- Cloud auth: bearer token from POST /login {id,secret}→{token} (NOT a P12-signed JWT — that returns HTTP 500; NOT HTTP Signature — that's DMS only). See cloud-transaction-auth.md.
- Local: send JSON over existing WSS connection (no serialNumber wrapper)
- Timeout: >= 180 seconds (backend timeout is 180s)
- merchantReferenceCode: unique per transaction (UUID)

## Mandatory verification

1. grep for hardcoded amounts/currencies — must find none
2. Verify merchantReferenceCode generation is unique
3. Verify timeout >= 180s
4. Build project — must succeed
5. **Pre-flight connection check (local mode) — MUST pass before any live transaction:**
   Run the three-layer check from the Prerequisites section:
   - Layer 1: `nc -zv ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT}` → must show `open`
   - Layer 2: `openssl s_client` mTLS handshake → `Verify return code: 0 (ok)`
   - Layer 3: WSS echo check → `PASS — type=TransactionStatusResponse`

   If any layer fails, fix it and re-run from that layer before proceeding to step 6.
   Do NOT skip this check and go straight to a live transaction — a broken connection
   layer will produce cryptic errors and loop indefinitely.
6. **Live transaction confirmation (if terminal is available):**
   - Trigger a test sale and ask the developer to tap/insert a test card
   - Wait for the developer to confirm the result using `AskUserQuestion` before proceeding
   - Do NOT report PASS based on sending the request alone — confirmation of the approved
     response from the developer is required
   - If the transaction fails: **first re-run the pre-flight check** (all 3 layers), fix
     any broken layer, then retry the transaction. Do not loop on the transaction alone.
   - Only exit the loop when the developer confirms APPROVED, or explicitly chooses to skip

## Live transaction confirmation loop

After triggering the test sale, ALWAYS use `AskUserQuestion`:

> I've triggered a test sale of 1.00 \<CURRENCY\>. Please tap/insert a test card on the terminal now.
>
> What was the result?
> - **Approved** — transaction went through successfully
> - **Declined or error** — describe what happened (include any error message shown)
> - **Skip** — skip the live test and proceed without confirmation

**Approved** → validate the response fields, update `project-plan.md` to `done`, report PASS.

**Declined or error** → diagnose the failure, apply a fix, then ask the developer to
trigger another sale. Use `AskUserQuestion` again with the same options. Repeat until
Approved or Skip is chosen.

**Skip** → update `project-plan.md` to `deferred`, report DEFERRED — do NOT report PASS.

**Gate status rule:** `project-plan.md` MUST NOT be left with gate SI-3 as `in_progress`
when you stop. The only valid final states are `done`, `failed`, or `deferred`.

## Required report

GATE SI-3 REPORT
Status: PASS | FAIL | DEFERRED
Mode: LOCAL | CLOUD
Build: SUCCESS | FAILED
Transaction method implemented: YES | NO
Response parsing covers all types: YES | NO
Transaction ID stored: YES | NO
UI wired: YES | NO
Live transaction confirmed by developer: YES | NO | DEFERRED
Issues encountered: <list or none>
Acceptance criteria met: <list>
```
