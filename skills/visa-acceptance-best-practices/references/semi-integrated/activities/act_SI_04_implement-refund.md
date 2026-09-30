# Activity SI-4: Implement Refund Transaction

Implement refund capabilities: linked refund (referencing an original sale), standalone credit (no original transaction), and token-based refund (credit to a tokenized card).

**Official docs (fetch for API details):**
- [SI Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md) — Refund request types and formats
- [SI Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) — WebSocket refund messages

**Troubleshooting:** `troubleshooting.md#si-transactions`

## Critical Rules (NEVER violate these)

1. **NEVER process a linked refund without a valid `transactionId`** — the transaction ID comes from the original sale's `transactionDetails.id`. Without it, use standalone credit instead.
2. **NEVER refund more than `refundableAmount`** — check the original transaction's `amountDetails.refundableAmount` before issuing. Partial refunds reduce this value.
3. **NEVER use standalone credit when a linked refund is possible** — linked refunds provide better tracking and fraud protection. Only use standalone when the original transaction ID is unavailable.
4. **NEVER hardcode transaction IDs** — always retrieve from stored transaction history or user input.
5. **NEVER skip amount validation** — refund amount must be > 0 and <= refundable amount.
6. **NEVER reuse `merchantReferenceCode`** — each refund must have a unique reference.

## Prerequisites

Before starting this activity, verify:

1. **Gate SI-1 complete** — HTTP/WebSocket client configured
2. **Gate SI-2 complete** — Terminal activated and connected
3. **Gate SI-3 complete** — Sale transaction working (provides transaction IDs for linked refunds)

## Workflow

---

### Step 1: Determine Refund Entry Points

Ask the developer:
- "Where in your app should refunds be triggered? (e.g., order history, admin panel, transaction detail screen)"
- "Do you need all refund types or just linked refunds?"
- "Do you store transaction IDs from successful sales? How?" (needed for linked refunds)

---

### Step 2: Implement Linked Refund

A linked refund references the original transaction by ID. Supports full and partial refunds.

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "LinkedRefundRequest",
    "transactionId": "<original_transaction_id>",
    "amountDetails": {
      "amount": "<refund_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

**Endpoint:** Same as sale — `POST https://terminalstest.visaacceptance.com/v1/cloud/transactions`

**Full refund:** Omit `amountDetails` entirely — the system refunds the full `refundableAmount`.

**Partial refund:** Include `amountDetails` with the partial amount.

#### Local Mode

```json
{
  "type": "LinkedRefundRequest",
  "transactionId": "<original_transaction_id>",
  "amountDetails": {
    "amount": "<refund_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

#### Response (`LinkedRefundResponse`)

```json
{
  "type": "LinkedRefundResponse",
  "message": "Refund approved",
  "transactionDetails": {
    "id": "<refund_transaction_id>",
    "submitTimeUtc": "2025-01-15T15:00:00Z",
    "captured": true,
    "amountDetails": {
      "currency": "USD",
      "amount": "25.00",
      "capturedAmount": "25.00"
    }
  },
  "processingDetails": {
    "status": "APPROVED",
    "card": { "maskedPan": "XXXXXX0119", "type": "VISA" }
  }
}
```

---

### Step 3: Implement Standalone Credit (Optional)

Use when the original transaction ID is not available. **Requires card present** at the terminal.

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "StandaloneRefundRequest",
    "merchantReferenceCode": "<unique_reference>",
    "amountDetails": {
      "amount": "<credit_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

#### Local Mode

```json
{
  "type": "StandaloneRefundRequest",
  "merchantReferenceCode": "<unique_reference>",
  "amountDetails": {
    "amount": "<credit_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

#### Implementation Notes

- Add `STANDALONE_CREDIT` to your `TransactionType` enum (or equivalent constants file).
- **UI affordance:** Show a "Standalone Credit" button or menu item only when the original transaction is unavailable. Prompt for amount and currency; do NOT prompt for a transaction ID.
- **NetworkGateway handler:** Create a `processStandaloneCredit(amount, currency)` method that builds `StandaloneRefundRequest`, generates a unique `merchantReferenceCode` (e.g., UUID), and posts to the same transactions endpoint.

> **CAVEAT — Standalone credit declines:** A standalone credit can be DECLINED by the processor even when the request is correctly formed. Many merchant IDs (MIDs) have standalone credit disabled at the acquirer/processor level. If all standalone credit attempts decline with an authorization error:
> - This is a **provisioning gate**, not a code bug.
> - Verify with the acquirer or contact Visa Acceptance to enable standalone credits for the MID.
> - Do not retry automatically — a decline here is definitive until provisioning is resolved.

---

### Step 4: Implement Token Refund (Optional)

Use when you have a stored card token (`instrumentId`) from a previous transaction. **Does NOT require card present**.

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "TokenRefundRequest",
    "instrumentId": "<stored_token_id>",
    "merchantReferenceCode": "<unique_reference>",
    "amountDetails": {
      "amount": "<credit_amount>",
      "currency": "<ISO_4217_code>"
    }
  }
}
```

#### Local Mode

```json
{
  "type": "TokenRefundRequest",
  "instrumentId": "<stored_token_id>",
  "merchantReferenceCode": "<unique_reference>",
  "amountDetails": {
    "amount": "<credit_amount>",
    "currency": "<ISO_4217_code>"
  }
}
```

The `instrumentId` comes from `additionalInformation.instrumentId` in a previous transaction response.

#### Implementation Notes

- Add `TOKEN_REFUND` to your `TransactionType` enum (or equivalent constants file).
- **UI affordance:** Show a "Refund to Saved Card" option when an `instrumentId` is available (e.g., from a customer profile or a previous transaction response's `additionalInformation.instrumentId`). No terminal interaction is required — this is card-not-present.
- **NetworkGateway handler:** Create a `processTokenRefund(instrumentId, amount, currency)` method that builds `TokenRefundRequest` with the provided `instrumentId` and a unique `merchantReferenceCode`.

---

### Step 5: Build and Verify

Verify:
- Linked refund uses `transactionId` from stored sale (not hardcoded)
- Amount validation: > 0 and <= refundableAmount
- Full refund omits amountDetails
- Standalone credit requires unique merchantReferenceCode
- Project builds without errors

---

## Troubleshooting

- **"Transaction not found" (linked refund):** transactionId is invalid or transaction was already fully refunded.
- **"Amount exceeds refundable":** Partial refunds already issued. Check current `refundableAmount` via lookup.
- **Standalone credit declined:** Some MIDs restrict standalone credits. Contact payment processor.
- **Token refund "Invalid instrument":** Token expired or revoked.

See `troubleshooting.md#si-transactions` for full error reference.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. Linked refund method exists with parameters: transactionId, amount (optional for full), currency
2. Original transaction's `transactionId` is retrieved from storage (not hardcoded)
3. Refund amount validation: > 0 and <= refundableAmount
4. Full refund supported (omit amountDetails for full refundableAmount)
5. Partial refund supported (specify amount < refundableAmount)
6. Correct request type used: `LinkedRefundRequest`
7. Response parsing handles `LinkedRefundResponse` and `ErrorResponse`
8. If standalone credit implemented: uses `StandaloneRefundRequest` with unique merchantReferenceCode
9. If token refund implemented: uses `TokenRefundRequest` with valid instrumentId
10. UI shows refund confirmation before processing
11. Project builds without compilation errors

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-4 of the Semi-Integrated PAX integration: Refund Transaction.

Working directory: <project root>

## Configuration (from Step 0 — do NOT ask for these again)

SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>
SI_ENVIRONMENT=<SI_ENVIRONMENT>
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
REFUND_TYPES=<REFUND_TYPES>

## Reference docs — fetch these for API details

- Cloud Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md
- Local Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md

Read these files before writing any code:
1. `project-plan.md` (in the project root)
2. `references/semi-integrated/activities/act_SI_04_implement-refund.md` — this activity

## Your task

Implement refund transaction(s) for SI_MODE=<SI_MODE>.
Refund types to implement: <REFUND_TYPES> (linked | standalone | token | all)

1. Identify where refunds should be triggered (order history, transaction detail, admin)
2. Verify transaction ID storage from Gate SI-3 (needed for linked refunds)
3. Implement **linked refund** (always — primary refund type):
   - Add `LINKED_REFUND` to `TransactionType` enum
   - Add UI affordance: "Refund" button on transaction detail, pre-filled with transactionId; confirm dialog shows amount
   - Add `processLinkedRefund(transactionId, amount, currency)` NetworkGateway handler using `LinkedRefundRequest`
4. For **each** type listed in REFUND_TYPES, scaffold the following (do not skip any):
   - **standalone**: Add `STANDALONE_CREDIT` to `TransactionType` enum; add "Standalone Credit" UI affordance (prompts for amount only, no transactionId); add `processStandaloneCredit(amount, currency)` handler using `StandaloneRefundRequest` with a generated unique `merchantReferenceCode`
   - **token**: Add `TOKEN_REFUND` to `TransactionType` enum; add "Refund to Saved Card" UI affordance (requires `instrumentId` from stored token, no terminal); add `processTokenRefund(instrumentId, amount, currency)` handler using `TokenRefundRequest`
5. If REFUND_TYPES contains only `linked`: still inform the developer that standalone credit and token refund types are available. Ask: "Would you also like to implement standalone credit (card-present, no prior transaction) or token refund (card-not-present, uses stored instrumentId)?" Add them if the developer agrees.
6. Add amount validation (> 0, <= refundableAmount) for all refund paths
7. Wire each refund type to its UI with a confirmation dialog
8. Build and verify

Key details:
- LinkedRefundRequest: requires `transactionId` from original sale
- Full refund: omit amountDetails entirely
- Partial refund: include amountDetails with partial amount
- StandaloneRefundRequest: requires card present, no transactionId needed; unique merchantReferenceCode required
- TokenRefundRequest: requires instrumentId, no card present needed
- Same endpoint as sale for cloud mode
- Standalone credit may be declined at the processor level even with a valid request (MID provisioning restriction — not a code bug)

## Mandatory verification

1. Verify transactionId is not hardcoded
2. Verify amount validation exists
3. Build project — must succeed

## Required report

GATE SI-4 REPORT
Status: PASS | FAIL
Mode: LOCAL | CLOUD
Build: SUCCESS | FAILED
Linked refund implemented: YES | NO
Standalone credit implemented: YES | NO | N/A
Token refund implemented: YES | NO | N/A
Amount validation: YES | NO
Issues encountered: <list or none>
Acceptance criteria met: <list>
```
