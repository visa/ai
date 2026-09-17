# Activity SI-7: Implement Transaction Management (Lookup and Cancel)

Implement transaction lookup (check status of a transaction) and cancel (abort an in-progress transaction). These are utility operations for handling lost responses, timeouts, and user-initiated cancellations.

**Official docs (fetch for API details):**
- [SI Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md) — Lookup and Cancel request formats
- [SI Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) — WebSocket lookup/cancel messages

**Troubleshooting:** `troubleshooting.md#si-transactions`

## Critical Rules (NEVER violate these)

1. **NEVER assume a timed-out transaction failed** — if the POS connection drops or times out, the transaction may still have been approved. ALWAYS use TransactionLookup to check before retrying.
2. **NEVER retry a transaction without first doing a lookup** — retrying without checking creates duplicate charges.
3. **NEVER send CancelRequest after receiving a final response** — Cancel only works on in-progress transactions. If you already have a PaymentResponse, use refund instead.
4. **NEVER discard `merchantReferenceCode`** — this is your recovery key for looking up transactions when the transaction ID is unknown (e.g., connection dropped before response arrived).

## Prerequisites

Before starting this activity, verify:

1. **Gate SI-3 complete** — Sale transaction working (lookup uses same response structure)
2. `merchantReferenceCode` is being generated and stored per transaction (from Gate SI-3)

## Workflow

---

### Step 1: Implement Transaction Lookup

#### Lookup by Transaction ID

**Cloud Mode:**
```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "TransactionLookupRequest",
    "idType": "TRANSACTION_ID",
    "id": "<transaction_id>"
  }
}
```

**Local Mode:**
```json
{
  "type": "TransactionLookupRequest",
  "idType": "TRANSACTION_ID",
  "id": "<transaction_id>"
}
```

#### Lookup by Merchant Reference Code

Use when transaction ID is unknown (response was lost):

**Cloud Mode:**
```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "TransactionLookupRequest",
    "idType": "MERCHANT_REFERENCE_CODE",
    "id": "<merchant_reference_code>"
  }
}
```

**Local Mode:**
```json
{
  "type": "TransactionLookupRequest",
  "idType": "MERCHANT_REFERENCE_CODE",
  "id": "<merchant_reference_code>"
}
```

#### Lookup Response

Returns full transaction details (same structure as PaymentResponse):

```json
{
  "type": "TransactionLookupResponse",
  "message": "Transaction found",
  "transactionDetails": {
    "id": "TXN_ID_12345",
    "merchantReferenceCode": "order-abc-123",
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
    "card": { "maskedPan": "XXXXXX0119", "type": "VISA" }
  }
}
```

If not found:
```json
{
  "type": "ErrorResponse",
  "message": "Transaction not found",
  "developerDescription": "No transaction matches the provided identifier"
}
```

---

### Step 2: Implement Timeout Recovery Pattern

When a transaction times out, the POS must determine if it succeeded before allowing a retry:

1. **Before sending:** Store `merchantReferenceCode` (this is the recovery key)
2. **On timeout/connection error:** Wait briefly (~5s), then lookup by `merchantReferenceCode`
3. **If lookup finds APPROVED:** Transaction went through — do NOT retry. Show success to user.
4. **If lookup returns "not found":** Transaction did not process — safe to retry with new reference.

This pattern prevents duplicate charges — the most common production payment bug.

---

### Step 3: Implement Cancel Transaction

Cancel aborts an in-progress transaction (while terminal shows "Present card" or is processing).

#### Cloud Mode

```json
{
  "serialNumber": "<SI_TERMINAL_SERIAL>",
  "request": {
    "type": "CancelRequest"
  }
}
```

#### Local Mode

```json
{
  "type": "CancelRequest"
}
```

**No additional fields required** — cancels the currently active transaction on the terminal.

#### Cancel Result

The original transaction response arrives with `status: "ABORTED"`:

```json
{
  "type": "PaymentResponse",
  "message": "Transaction cancelled",
  "transactionDetails": {
    "id": "TXN_ID_12345",
    "captured": false
  },
  "processingDetails": {
    "status": "ABORTED"
  }
}
```

If cancellation fails (transaction already completed):
```json
{
  "type": "ErrorResponse",
  "message": "Cannot cancel transaction",
  "developerDescription": "Transaction has already been completed"
}
```

> **CRITICAL — Abort/Cancel must NOT use the gateway's main request channel:**
>
> `BaseGateway` uses a single rendezvous `Channel` (capacity 0) with one consumer coroutine. During an in-flight cloud transaction, that consumer is parked inside `handleRequest(StartTransaction)` waiting on the long-poll HTTP call and never returns to the channel loop until the charge completes. Routing `AbortTransaction` through the same channel — `gateway.sendRequest(AbortTransaction)` — will block forever while a transaction is in flight. The cancel button appears to work (code present, compiles) but is completely inert live.
>
> **FIX: Dispatch abort/cancel out-of-band, NOT through the main request channel:**
> 1. Expose a separate method: `scope.launch { handleAbort(request) }` as `sendAbortInBackground()`
> 2. The SI-7 abort path (`AbortTransactionRequest.handle`, `posType = SEMI_INTEGRATED`) must call `sendAbortInBackground()`, not `sendRequest(AbortTransaction)`
> 3. Wrap blocking cloud calls in `withContext(Dispatchers.IO)` so the long-poll never holds the gateway's dispatcher thread
>
> The skill scaffold must ship the abort path already wired out-of-band.
>
> **ACCEPTANCE CRITERION:** The "does it transact end-to-end?" check (from IMP-9 in `act_SI_01`) must include cancelling an in-flight transaction — a happy-path sale alone is not sufficient evidence that cancel works.

---

### Step 4: Wire Cancel to UI

Cancel should be available during transaction processing when `TransactionStatusResponse` has `canBeAborted: true`. Hide/disable the cancel button once a final response arrives.

---

### Step 5: Build and Verify

Verify:
- TransactionLookup supports both `TRANSACTION_ID` and `MERCHANT_REFERENCE_CODE` idTypes
- `merchantReferenceCode` stored BEFORE transaction request is sent
- Timeout recovery: lookup before retry (never blind retry)
- Cancel only sent during in-progress transactions
- Project builds without errors

---

## Troubleshooting

- **Lookup "not found" for known transaction:** Transaction may still be processing. Wait and retry.
- **Cancel has no effect:** Transaction completed between status update and cancel. Handle gracefully.
- **Duplicate charges:** Timeout recovery not implemented. Always lookup before retry.

See `troubleshooting.md#si-transactions` for full error reference.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. TransactionLookup supports both `TRANSACTION_ID` and `MERCHANT_REFERENCE_CODE` idTypes
2. `merchantReferenceCode` stored before each transaction request is sent
3. Timeout recovery: automatic lookup after connection timeout/error
4. Timeout recovery: does NOT retry if lookup finds APPROVED status
5. CancelRequest implemented
6. Cancel dispatched out-of-band (NOT through the gateway's main request channel — see Step 3 architectural note)
7. Cancel available only when `canBeAborted: true` (local mode)
8. Cancel response handled (ABORTED status)
9. ErrorResponse handled for both lookup and cancel
10. Project builds without compilation errors
11. End-to-end verification includes cancelling an in-flight transaction, not just a happy-path sale

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-7 of the Semi-Integrated PAX integration: Transaction Management.

Working directory: <project root>

## Configuration (from Step 0 — do NOT ask for these again)

SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>
SI_ENVIRONMENT=<SI_ENVIRONMENT>
PLATFORM=<PLATFORM>

## Reference docs — fetch these for API details

- Cloud Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md
- Local Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md

Read these files before writing any code:
1. `project-plan.md` (in the project root)
2. `references/semi-integrated/activities/act_SI_07_implement-transaction-management.md` — this activity

## Your task

Implement transaction lookup and cancel for SI_MODE=<SI_MODE>.

1. Implement TransactionLookup (both idType variants)
2. Ensure merchantReferenceCode is stored before each transaction
3. Implement timeout recovery: auto-lookup after timeout, prevent duplicate charges
4. Implement CancelRequest for aborting in-progress transactions — dispatch out-of-band via sendAbortInBackground(), NOT through gateway.sendRequest() (the main channel blocks while a charge is in flight)
5. Wire cancel to UI (visible when canBeAborted is true)
6. Build and verify — include a cancel-an-in-flight-transaction test, not just a happy-path sale

Key details:
- TransactionLookupRequest: idType is "TRANSACTION_ID" or "MERCHANT_REFERENCE_CODE"
- CancelRequest: no additional fields (cancels current transaction)
- Cancel only works BEFORE final response received
- Cancel MUST be dispatched out-of-band (see the CRITICAL note in Step 3 of the activity); routing it through the main channel causes it to silently block while a transaction is in flight
- ALWAYS lookup before retrying a timed-out transaction
- merchantReferenceCode is the recovery key when transactionId is unknown

## Mandatory verification

1. Verify merchantReferenceCode stored before request
2. Verify timeout handler does lookup (not immediate retry)
3. Verify cancel is dispatched out-of-band (sendAbortInBackground or equivalent), not routed through gateway.sendRequest()
4. Verify cancel only available during in-progress
5. Build project — must succeed
6. Exercise cancel against a live in-flight transaction — happy-path sale alone does not confirm cancel works

## Required report

GATE SI-7 REPORT
Status: PASS | FAIL
Mode: LOCAL | CLOUD
Build: SUCCESS | FAILED
Transaction lookup: YES | NO
Both idTypes: YES | NO
Timeout recovery: YES | NO
Cancel: YES | NO
Cancel dispatched out-of-band (not main channel): YES | NO
Cancel tested against in-flight transaction: YES | NO
Issues encountered: <list or none>
Acceptance criteria met: <list>
```
