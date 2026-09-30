# Activity SI-6: Implement Tipping

Implement on-reader tipping (customer selects tip at terminal before card tap) and on-receipt tipping (customer writes tip on receipt, POS captures later). These are extensions of the sale and pre-auth flows.

**Official docs (fetch for API details):**
- [SI Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md) — Tipping request formats
- [SI Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) — WebSocket tipping messages

**Troubleshooting:** `troubleshooting.md#si-transactions`

## Critical Rules (NEVER violate these)

1. **NEVER use `askForTip: "ON_RECEIPT"` without `capture: false`** — on-receipt tipping requires a pre-auth first (the tip is added later via TipAdjust). If you capture immediately, there's nothing to adjust.
2. **NEVER forget the TipAdjust follow-up for on-receipt tipping** — the transaction remains uncaptured until you send a TipAdjustRequest. Failing to do so within 24 hours causes the auth to expire.
3. **NEVER assume `askForTip: "ON_DEVICE"` returns only the base amount** — the response `amount` includes the tip. Check `includedTipAmount` to see the tip breakdown.
4. **NEVER send both `askForTip` and `capture: false` for on-reader tipping** — on-reader tipping captures immediately (the full amount including tip is known at tap time).
5. **NEVER hardcode tip percentages** — tip options shown on the terminal are configured via Business Center (Acceptance Devices → Customizations), not in the POS request.
6. **CRITICAL — TipAdjustRequest.amount is the TIP AMOUNT, not the total** — `amountDetails.amount` in a TipAdjustRequest is the TIP AMOUNT ITSELF (e.g., `2.00` for a $2 tip on a $12.99 auth), NOT the tip-inclusive total. The backend adds the tip to the original authorization internally. The backend caps the tip at 20% of the original authorization and returns HTTP 500 errorCode 6000 if exceeded.
7. **NEVER combine `askForTip: "ON_DEVICE"` with `capture: false`** — the backend rejects this combination explicitly. `ON_DEVICE` (on-reader) tipping always captures immediately in a single step. Only `ON_RECEIPT` uses `capture: false`.

## Prerequisites

Before starting this activity, verify:

1. **Gate SI-3 complete** — Sale transaction working (on-reader tipping extends it)
2. **Gate SI-5 complete** — Pre-auth/capture working (on-receipt tipping uses the same TipAdjust flow)

## Workflow

---

### Step 1: Determine Tipping Mode

Ask the developer:
- **On-Reader** — customer picks tip on terminal screen before tapping card. Single request, fully captured.
- **On-Receipt** — traditional restaurant model. Pre-auth first, capture with tip later. Two-step.
- **Both**

---

### Step 2: Implement On-Reader Tipping

A standard sale with `askForTip: "ON_DEVICE"` added. The terminal shows tip selection before card tap. Transaction is fully captured in one step.

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "PaymentRequest",
    "merchantReferenceCode": "<unique_reference>",
    "askForTip": "ON_DEVICE",
    "amountDetails": {
      "amount": "<base_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

#### Local Mode

```json
{
  "type": "PaymentRequest",
  "merchantReferenceCode": "<unique_reference>",
  "askForTip": "ON_DEVICE",
  "amountDetails": {
    "amount": "<base_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

#### Response (fully captured, tip included)

```json
{
  "type": "PaymentResponse",
  "transactionDetails": {
    "id": "TXN_ID_12345",
    "captured": true,
    "amountDetails": {
      "currency": "USD",
      "amount": "28.50",
      "capturedAmount": "28.50",
      "includedTipAmount": "3.50"
    }
  },
  "processingDetails": { "status": "APPROVED" }
}
```

**Key:** `includedTipAmount` shows the customer-selected tip. `amount` is total (base + tip). No follow-up needed.

---

### Step 3: Implement On-Receipt Tipping

> **On-receipt tipping is a 2-STEP flow — NOT a single transaction:**
> - **Step 1:** Authorize with `askForTip: "ON_RECEIPT"` AND `capture: false` → returns `captured: false`, `tipAdjustStatus: ADJUSTABLE`
> - **Step 2:** Send a separate TipAdjustRequest with the tip amount only (see Critical Rule 6) → backend captures base + tip
>
> **CRITICAL CONSTRAINTS:**
> 1. `askForTip: "ON_DEVICE"` must NEVER be combined with `capture: false` — the backend rejects this combination.
> 2. On-receipt authorization must use `capture: false` — if already captured, no tip adjust is possible.
>
> **Scaffold must compute `capture` and `askForTip` from the selected tip type:**
> - ON_DEVICE tipping: `capture: true`, `askForTip: "ON_DEVICE"` (single step, tip on terminal)
> - ON_RECEIPT tipping: `capture: false`, `askForTip: "ON_RECEIPT"` → then tip-adjust (two steps)
> - No tipping: `capture: true`, omit `askForTip`
>
> Validated end-to-end: auth (`capture: false`, `ON_RECEIPT`) → `ADJUSTABLE` → tip-adjust → captured $14.99.

Pre-auth with `askForTip: "ON_RECEIPT"` and `capture: false`. Card is tapped, funds held. Customer writes tip on receipt. POS sends TipAdjust with the tip amount.

#### Cloud Mode — Pre-Authorize

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "PaymentRequest",
    "capture": false,
    "askForTip": "ON_RECEIPT",
    "merchantReferenceCode": "<unique_reference>",
    "amountDetails": {
      "amount": "<base_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

#### Local Mode — Pre-Authorize

```json
{
  "type": "PaymentRequest",
  "capture": false,
  "askForTip": "ON_RECEIPT",
  "merchantReferenceCode": "<unique_reference>",
  "amountDetails": {
    "amount": "<base_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

#### Pre-Auth Response

```json
{
  "type": "PaymentResponse",
  "transactionDetails": {
    "id": "PREAUTH_TXN_ID_67890",
    "captured": false,
    "amountDetails": { "amount": "25.00", "capturedAmount": "0.00" }
  },
  "tipAdjustStatus": "ADJUSTABLE"
}
```

Store `transactionDetails.id` for capture.

#### Capture with Tip (TipAdjust)

After the customer writes the tip on the receipt, send the **TIP AMOUNT ONLY** (not the total):

> **CRITICAL (IMP-12):** `amountDetails.amount` here is the TIP ITSELF — e.g., `5.00` for a $5 tip on a $25.00 auth. Do NOT send the tip-inclusive total. The backend adds the tip to the original authorization. Cap: 20% of original auth; exceeding it returns HTTP 500 errorCode 6000.
>
> **Dedicated tip input required:** The scaffolded POS must render a dedicated tip amount input field — do NOT reuse the cart total. The input must:
> - Accept a positive dollar amount for the tip only
> - Show the button label as `Tip Adjust +$X` reflecting the tip value
> - Validate the tip is positive before dispatching
> - Send the tip value as `amountDetails.amount`

**Cloud Mode:**
```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "TipAdjustRequest",
    "transactionId": "PREAUTH_TXN_ID_67890",
    "amountDetails": {
      "amount": "5.00",
      "currency": "USD"
    }
  }
}
```

**Local Mode:**
```json
{
  "type": "TipAdjustRequest",
  "transactionId": "PREAUTH_TXN_ID_67890",
  "amountDetails": {
    "amount": "5.00",
    "currency": "USD"
  }
}
```

**Amount is the TIP ONLY** (e.g., `5.00` for a $5 tip on a $25.00 auth — backend captures $30.00 total). Validated: tip $2.00 on $12.99 auth → captured $14.99, `tipAdjustStatus: ADJUSTED`.

---

### Step 4: Terminal Tip Configuration (Informational)

Tip percentages shown on terminal for on-reader mode are configured in **Business Center** (Acceptance Devices → Customizations), not in the POS request. The POS only sends `askForTip: "ON_DEVICE"`. Default options: 15%, 18%, 20%, Custom Amount, No Tip.

---

### Step 5: Build and Verify

Verify:
- On-reader: `askForTip: "ON_DEVICE"` present, NO `capture: false`
- On-receipt: BOTH `askForTip: "ON_RECEIPT"` AND `capture: false` present
- On-receipt: TipAdjust follow-up implemented with TIP AMOUNT ONLY (not the total; backend adds tip to base auth)
- `includedTipAmount` extracted from response for display
- Project builds without errors

---

## Troubleshooting

- **Terminal doesn't show tip screen:** Tipping must be enabled in Business Center (Acceptance Devices → Customizations).
- **TipAdjust returns "NOT_ADJUSTABLE":** Transaction already captured or expired.
- **On-receipt auth expired:** Capture must happen within 24 hours.

See `troubleshooting.md#si-transactions` for full error reference.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. On-reader tipping: request includes `askForTip: "ON_DEVICE"` (if implemented)
2. On-reader tipping: NO `capture: false` present (captures immediately)
3. On-reader tipping: `includedTipAmount` extracted from response
4. On-receipt tipping: BOTH `capture: false` AND `askForTip: "ON_RECEIPT"` present (if implemented)
5. On-receipt tipping: transaction ID stored from pre-auth response
6. On-receipt tipping: TipAdjust sent with TIP AMOUNT ONLY (not the tip-inclusive total; backend caps tip at 20% of original auth)
7. On-receipt tipping: `tipAdjustStatus` checked before capture
8. Tip display: UI shows breakdown (base + tip = total)
9. Project builds without compilation errors

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-6 of the Semi-Integrated PAX integration: Tipping.

Working directory: <project root>

## Configuration (from Step 0 — do NOT ask for these again)

SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>
SI_ENVIRONMENT=<SI_ENVIRONMENT>
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
TIPPING_MODE=<TIPPING_MODE>

## Reference docs — fetch these for API details

- Cloud Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md
- Local Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md

Read these files before writing any code:
1. `project-plan.md` (in the project root)
2. `references/semi-integrated/activities/act_SI_06_implement-tipping.md` — this activity

## Your task

Implement tipping for SI_MODE=<SI_MODE>.
Tipping mode: <TIPPING_MODE> (on_reader | on_receipt | both)

1. Integrate tipping into existing sale/pre-auth flow
2. For on-reader: add askForTip: "ON_DEVICE" to sale, parse includedTipAmount
3. For on-receipt: add askForTip: "ON_RECEIPT" + capture: false, implement TipAdjust
4. Add tip display (breakdown: base + tip = total)
5. Build and verify

Key details:
- On-reader: single request, fully captured, tip in response.includedTipAmount
- On-receipt: 2-STEP flow — auth (capture:false, askForTip:ON_RECEIPT) → tipAdjustStatus:ADJUSTABLE → TipAdjustRequest (tip amount only)
- TipAdjust amountDetails.amount is the TIP ONLY (not tip-inclusive total; backend adds tip to base auth; cap 20% of auth, HTTP 500 errorCode 6000 if exceeded)
- askForTip values: "ON_DEVICE" or "ON_RECEIPT" (exact strings)
- Terminal tip options configured in Business Center, not POS request
- NEVER combine askForTip:"ON_DEVICE" with capture:false (backend rejects this combination)
- Scaffold must compute capture and askForTip from selected tip type:
  - ON_DEVICE: capture=true, askForTip="ON_DEVICE" (single step)
  - ON_RECEIPT: capture=false, askForTip="ON_RECEIPT" (two steps, then TipAdjust)
  - No tipping: capture=true, omit askForTip
- Dedicated tip input for TipAdjust: accept tip dollar amount only, show label 'Tip Adjust +$X', validate positive, send as amountDetails.amount

## Mandatory verification

1. On-reader: askForTip present, no capture:false
2. On-receipt: BOTH askForTip AND capture:false present
3. On-receipt: TipAdjust amountDetails.amount is the TIP ONLY (not total; backend adds tip to original auth; cap 20%)
4. Build project — must succeed

## Required report

GATE SI-6 REPORT
Status: PASS | FAIL
Mode: LOCAL | CLOUD
Build: SUCCESS | FAILED
On-reader tipping: YES | NO | N/A
On-receipt tipping: YES | NO | N/A
TipAdjust follow-up: YES | NO | N/A
Issues encountered: <list or none>
Acceptance criteria met: <list>
```
