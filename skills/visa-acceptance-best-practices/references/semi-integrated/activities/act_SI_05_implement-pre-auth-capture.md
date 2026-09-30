# Activity SI-5: Implement Pre-Authorization and Capture

Implement pre-authorization (hold funds without capturing) and the subsequent capture/tip-adjust to finalize the transaction. Used for hotels, car rentals, restaurants, and any scenario where the final amount is determined after the initial authorization.

**Official docs (fetch for API details):**
- [SI Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md) — Pre-auth and TipAdjust request formats
- [SI Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) — WebSocket pre-auth messages

**Troubleshooting:** `troubleshooting.md#si-transactions`

## Critical Rules (NEVER violate these)

1. **NEVER omit `"capture": false`** — without this flag, the transaction becomes a standard sale (immediately captured). This is the ONLY difference between a sale and a pre-auth in the request.
2. **NEVER discard the `transactionDetails.id` from the pre-auth response** — this ID is required for the subsequent TipAdjust (capture). Without it, the pre-auth cannot be finalized.
3. **NEVER capture more than the authorized amount** — the capture amount must be <= the authorized amount. Some issuers allow a small tolerance (e.g., 20% for restaurants), but exceeding it causes declines.
4. **NEVER wait more than 24 hours to capture** — tip adjustments must happen within 24 hours or the authorization expires (issuer-dependent, but 24h is the safe window).
5. **NEVER send a TipAdjust without the original `transactionId`** — it's a linked operation.
6. **NEVER assume pre-auth responses have `captured: true`** — pre-auths always return `captured: false` until the TipAdjust/capture is processed.
7. **The `amount` in TipAdjustRequest is the TOTAL final amount** — NOT the tip portion or the delta. If base was $25 and tip is $5, send `"amount": "30.00"`.

## Prerequisites

Before starting this activity, verify:

1. **Gate SI-1 complete** — HTTP/WebSocket client configured
2. **Gate SI-2 complete** — Terminal activated and connected
3. **Gate SI-3 complete** — Sale transaction working (pre-auth uses same infrastructure)

## Workflow

---

### Step 1: Identify Pre-Auth Use Cases

Ask the developer:
- "What scenario requires pre-authorization? (hotel check-in, car rental, restaurant tab, bar tab)"
- "How will the final amount be determined? (customer signs receipt, checkout, tab close)"
- "Where should the capture/finalization happen in your app?"

---

### Step 2: Implement Pre-Authorization Request

A pre-auth is identical to a sale request except for `"capture": false`.

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "PaymentRequest",
    "capture": false,
    "merchantReferenceCode": "<unique_reference>",
    "amountDetails": {
      "amount": "<estimated_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

**Endpoint:** Same as sale — `POST https://terminalstest.visaacceptance.com/v1/cloud/transactions`

#### Local Mode

```json
{
  "type": "PaymentRequest",
  "capture": false,
  "merchantReferenceCode": "<unique_reference>",
  "amountDetails": {
    "amount": "<estimated_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

---

### Step 3: Handle Pre-Auth Response

```json
{
  "type": "PaymentResponse",
  "message": "Payment approved",
  "transactionDetails": {
    "id": "PRE_AUTH_TXN_ID_12345",
    "merchantReferenceCode": "your-reference",
    "captured": false,
    "amountDetails": {
      "currency": "USD",
      "amount": "100.00",
      "capturedAmount": "0.00"
    }
  },
  "processingDetails": {
    "status": "APPROVED"
  },
  "tipAdjustStatus": "ADJUSTABLE"
}
```

**Key fields:**
- `captured: false` — confirms this is a pre-auth (funds held, not captured)
- `tipAdjustStatus: "ADJUSTABLE"` — confirms the transaction can be captured
- `transactionDetails.id` — **MUST PERSIST** for the capture step

---

### Step 4: Implement Capture (TipAdjust)

The capture is called "TipAdjust" in the SI API — it finalizes the pre-auth with the actual amount.

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "TipAdjustRequest",
    "transactionId": "<pre_auth_transaction_id>",
    "amountDetails": {
      "amount": "<final_total_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

#### Local Mode

```json
{
  "type": "TipAdjustRequest",
  "transactionId": "<pre_auth_transaction_id>",
  "amountDetails": {
    "amount": "<final_total_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

**Critical:** The `amount` is the **total final amount** (original + tip or adjusted amount), NOT just the difference.

#### TipAdjust Response

```json
{
  "type": "TipAdjustResponse",
  "message": "Tip adjust approved",
  "transactionDetails": {
    "id": "PRE_AUTH_TXN_ID_12345",
    "captured": true,
    "amountDetails": {
      "amount": "100.00",
      "capturedAmount": "115.00",
      "includedTipAmount": "15.00"
    }
  },
  "tipAdjustStatus": "ADJUSTED"
}
```

**Key fields:**
- `captured: true` — transaction is now finalized
- `tipAdjustStatus: "ADJUSTED"` — confirms capture succeeded
- `includedTipAmount` — the tip portion (total - base)

---

### Step 5: Build and Verify

Verify:
- Pre-auth request includes `"capture": false`
- Transaction ID is persisted after successful pre-auth (survives app restart)
- TipAdjust uses stored transaction ID (not hardcoded)
- Amount in TipAdjust is the TOTAL (not just tip delta)
- `tipAdjustStatus` is checked before attempting capture
- Project builds without errors

---

## Troubleshooting

- **Pre-auth approved but TipAdjust fails:** Check if >24 hours have elapsed. Authorization may have expired.
- **`tipAdjustStatus: "NOT_ADJUSTABLE"`:** Transaction already captured or voided.
- **"Transaction not found" on capture:** Wrong transactionId or transaction expired.
- **Amount exceeds authorized:** Issuer declined the over-capture. Reduce amount.

See `troubleshooting.md#si-transactions` for full error reference.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. Pre-auth request includes `"capture": false` flag
2. Pre-auth response parsed — `captured: false` and `tipAdjustStatus: "ADJUSTABLE"` verified
3. `transactionDetails.id` stored persistently after successful pre-auth
4. Capture (TipAdjust) method exists with parameters: transactionId, finalAmount, currency
5. TipAdjust amount is the TOTAL final amount (not just the delta/tip)
6. `tipAdjustStatus` checked before attempting capture
7. Pending pre-auths tracked and removed after capture
8. Response parsing handles `TipAdjustResponse` and `ErrorResponse`
9. UI supports two-phase flow: authorize now, capture later
10. Project builds without compilation errors

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-5 of the Semi-Integrated PAX integration: Pre-Authorization and Capture.

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
1. `project-plan.md` (in the project root)
2. `references/semi-integrated/activities/act_SI_05_implement-pre-auth-capture.md` — this activity

## Your task

Implement pre-authorization and capture for SI_MODE=<SI_MODE>.

1. Identify pre-auth use case in the app (ask developer)
2. Implement pre-auth request (PaymentRequest with capture:false)
3. Persist transaction ID from pre-auth response
4. Implement capture (TipAdjustRequest with total final amount)
5. Add pending pre-auth tracking
6. Wire to UI: two-phase flow
7. Build and verify

Key details:
- Pre-auth = PaymentRequest + "capture": false (ONLY difference from sale)
- Capture = TipAdjustRequest (amount is TOTAL, not delta)
- transactionId from pre-auth response is REQUIRED for capture
- 24-hour window to capture before authorization expires
- tipAdjustStatus must be "ADJUSTABLE" before attempting capture

## Mandatory verification

1. Verify "capture": false is present in pre-auth request
2. Verify transactionId persistence
3. Verify TipAdjust amount is total (not delta)
4. Build project — must succeed

## Required report

GATE SI-5 REPORT
Status: PASS | FAIL
Mode: LOCAL | CLOUD
Build: SUCCESS | FAILED
Pre-auth implemented: YES | NO
Transaction ID persisted: YES | NO
Capture (TipAdjust) implemented: YES | NO
Amount is total (not delta): YES | NO
Issues encountered: <list or none>
Acceptance criteria met: <list>
```
