# Activity: Implement Offline (Store-and-Forward) Transactions

This activity guides the implementation of offline transaction support using the CyberSource PAX All-in-One SDK's `offlineModule`. It covers offline sales, batch sync, pending transaction queries, offline refunds, and connectivity-aware UI indicators.

---

## Prerequisites

Before starting this activity, verify:

1. **SDK dependencies are configured** — the project builds with PAX SDK dependencies (Gate 1 complete).
2. **MposUi is initialised** — `PaymentApplication` creates `MposUi` with `AccessoryFamily.PAX.integrated()` (Gate 2 complete).
3. **Charge transactions work** — `mposUi.createTransactionIntent()` is wired and tested (Gate 3 complete).

If any prerequisite is missing, do not continue. Report `FAIL` with the missing gate.

---

## Critical Rules (NEVER violate these)

1. **Always guard with `isMposUiReady()`** — call `PaymentApplication.isMposUiReady()` before every offline operation. If false, show feedback and return — do NOT throw an exception.
2. **Use `mposUi.offlineModule`** — never call `mposUi.createTransactionIntent()` for offline operations. All offline operations go through `offlineModule` (Kotlin) or `getOfflineModule()` (Java).
3. **Use `io.mpos.transactions.Currency`** — NEVER `java.util.Currency`. Using the wrong import causes a compilation error.
4. **Use `BigDecimal(String)` constructor** — e.g. `BigDecimal("10.00")`. NEVER `BigDecimal(10.00)` (floating point imprecision). For arithmetic: `BigDecimal.valueOf(x).multiply(BigDecimal("1.19")).setScale(2, RoundingMode.HALF_UP)` — never `BigDecimal.valueOf(x * 1.19)`.
5. **UI must distinguish offline (pending) from settled** — add visual indicators; users must never confuse a locally-stored offline transaction with a confirmed online transaction.
6. **`getPendingTransactions()` does not exist in SDK 2.112.0** — track pending counts with a manual counter; increment on offline sale success, reset on batch sync success.
7. **`submitOfflineTransactionBatchIntent()` is the correct batch-sync method name** — `submitOfflineTransactionBatchIntent()` does not exist.

---

## Step 0 — Configure Offline Module in PaymentApplication ⭐ REQUIRED

Before any offline transaction can work, two changes must be made to `PaymentApplication` (the class that creates `MposUi`). These must go **immediately after** the existing `MposUi.create(...)` call:

**Step 0a — Set `OfflineTransactionConfiguration`** (limits per transaction and for the batch):

**Kotlin:**
```kotlin
import io.mpos.paybutton.OfflineTransactionConfiguration
import java.math.BigDecimal

// Immediately after: mposUi = MposUi.create(...)
val offlineConfig = OfflineTransactionConfiguration(
    maximumAmountPerTransaction = BigDecimal("1000.00"),
    maximumTotalAmountForBatch  = BigDecimal("5000.00")
)
mposUi.offlineModule.offlineTransactionConfiguration = offlineConfig
```

**Java:**
```java
import io.mpos.paybutton.OfflineTransactionConfiguration;
import java.math.BigDecimal;

// Immediately after: mposUi = MposUi.create(...)
OfflineTransactionConfiguration offlineConfig = new OfflineTransactionConfiguration(
    new BigDecimal("1000.00"),
    new BigDecimal("5000.00")
);
mposUi.getOfflineModule().setOfflineTransactionConfiguration(offlineConfig);
```

**Step 0b — Call `synchronizeConfiguration()`** (downloads terminal parameters; enables `FEATURE_OFFLINE_PROCESSING`):

**Kotlin:**
```kotlin
// After setting offlineTransactionConfiguration
mposUi.offlineModule.synchronizeConfiguration { configDetails, error ->
    if (configDetails != null && error == null) {
        Log.d(TAG, "Offline configuration synchronized — offline processing enabled")
    } else {
        Log.w(TAG, "Offline config sync failed: ${error?.info ?: "Unknown error"}")
        // Non-fatal. Online payments still work. Retried on next app start.
    }
}
```

**Java:**
```java
// After setting offlineTransactionConfiguration
mposUi.getOfflineModule().synchronizeConfiguration((configDetails, error) -> {
    if (configDetails != null && error == null) {
        Log.d(TAG, "Offline configuration synchronized — offline processing enabled");
    } else {
        Log.w(TAG, "Offline config sync failed: " + (error != null ? error.getInfo() : "Unknown"));
    }
});
```

> Without `synchronizeConfiguration()`, the terminal will not enable offline processing and offline sales will fail silently.

---

## Step 1 — Implement Offline Sale

The workflow must ask the developer **Q8a** before spawning this gate's implementation agent:

> **Q8a — Offline sale UI trigger:**
> - **Dedicated button** — add a separate "Offline Sale" button (`btnOfflineSale`) to the layout; always triggers `startOfflineSale()` regardless of connectivity
> - **Adaptive Pay button** — the existing Pay button automatically routes to `startOfflineSale()` when offline and `startCharge()` when online (seamless fallback)

Store the answer as `OFFLINE_UI_MODE` (`dedicated_button` | `adaptive`).

Pass `OFFLINE_UI_MODE` to the Gate 8 implementation agent so it knows which approach to implement.

---

### Option A — Dedicated button (`OFFLINE_UI_MODE = dedicated_button`)

Add `android:id="@+id/btnOfflineSale"` with label `"Offline Sale"` to the layout alongside existing buttons. Wire it to `startOfflineSale()`.

### Option B — Adaptive Pay button (`OFFLINE_UI_MODE = adaptive`)

No new button needed. Modify the existing Pay button's click handler to check connectivity first:

**Java:**
```java
btnPay.setOnClickListener(v -> {
    ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
    NetworkInfo info = cm.getActiveNetworkInfo();
    boolean isOnline = info != null && info.isConnected();
    if (isOnline) {
        startCharge(new BigDecimal("9.99"), Currency.EUR);
    } else {
        startOfflineSale(new BigDecimal("9.99"), Currency.EUR);
    }
});
```

**Kotlin:**
```kotlin
btnPay.setOnClickListener {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val isOnline = cm.activeNetworkInfo?.isConnected == true
    if (isOnline) startCharge(BigDecimal("9.99"), Currency.EUR)
    else startOfflineSale(BigDecimal("9.99"), Currency.EUR)
}
```

---

### `startOfflineSale()` implementation (both options)

### Key points

- The `TransactionParameters` builder chain is identical to a regular charge: `.charge(amount, currency)`
- The only difference from an online sale is routing through `mposUi.offlineModule.createTransactionIntent()` instead of `mposUi.createTransactionIntent()`
- `RESULT_CODE_APPROVED` means the transaction was **stored locally**, NOT submitted to CyberSource
- Store the `transactionIdentifier` from the result — needed for offline refunds

**Kotlin:**
```kotlin
private fun startOfflineSale(amount: BigDecimal, currency: Currency) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment SDK not initialized", Toast.LENGTH_SHORT).show()
        return
    }
    val params = TransactionParameters.Builder()
        .charge(amount, currency)
        .build()
    val intent = PaymentApplication.mposUi.offlineModule.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private void startOfflineSale(BigDecimal amount, Currency currency) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment SDK not initialized", Toast.LENGTH_SHORT).show();
        return;
    }
    TransactionParameters params = new TransactionParameters.Builder()
        .charge(amount, currency)
        .build();
    Intent intent = PaymentApplication.getMposUi().getOfflineModule().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

Update `onActivityResult` to handle `RESULT_CODE_APPROVED` (store locally, mark as PENDING in UI) and `RESULT_CODE_FAILED` (show error).

---

## Step 2 — Implement Connectivity Monitoring

Add a `BroadcastReceiver` that detects when the device comes back online and triggers batch sync.

- Register in `onResume()` / unregister in `onPause()` (or use a Service)
- On `onConnected()` callback: call `syncPendingTransactions()`
- On `onDisconnected()` callback: update UI to "offline mode"

Add a **"Batch Sync"** button (`android:id="@+id/btnBatchSync"`) to the layout so the user can trigger sync on demand. This is in addition to the automatic sync triggered by connectivity restoration.

---

## Step 3 — Implement Batch Sync

Add `syncPendingTransactions()` to submit all pending offline transactions to CyberSource when connectivity is available.

**Kotlin:**
```kotlin
private fun syncPendingTransactions() {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment SDK not initialized", Toast.LENGTH_SHORT).show()
        return
    }
    val intent = PaymentApplication.mposUi.offlineModule.submitOfflineTransactionBatchIntent()
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private void syncPendingTransactions() {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment SDK not initialized", Toast.LENGTH_SHORT).show();
        return;
    }
    Intent intent = PaymentApplication.getMposUi().getOfflineModule().submitOfflineTransactionBatchIntent();
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

Handle the result: `RESULT_CODE_APPROVED` → update all "Pending" indicators to "Settled"; `RESULT_CODE_FAILED` → keep as pending, retry later.

---

## Step 4 — Implement Pending Transaction UI

> **SDK 2.112.0 note:** `getPendingTransactions()` does **not** exist. Track the pending count with a manual counter — increment on each offline sale success, reset on batch sync success.

**Kotlin:**
```kotlin
// Member variable in Activity/ViewModel
private var pendingTransactionCount = 0

// Call after RESULT_CODE_APPROVED from offline sale
private fun onOfflineSaleStored() {
    pendingTransactionCount++
    updatePendingBadge(pendingTransactionCount)
}

// Call after RESULT_CODE_APPROVED from batch sync
private fun onBatchSyncSuccess() {
    pendingTransactionCount = 0
    updatePendingBadge(0)
}

private fun updatePendingBadge(count: Int) {
    tvPendingCount.visibility = if (count > 0) View.VISIBLE else View.GONE
    tvPendingCount.text = if (count > 0) "$count pending" else ""
}
```

**Java:**
```java
private int pendingTransactionCount = 0;

private void onOfflineSaleStored() {
    pendingTransactionCount++;
    updatePendingBadge(pendingTransactionCount);
}

private void onBatchSyncSuccess() {
    pendingTransactionCount = 0;
    updatePendingBadge(0);
}

private void updatePendingBadge(int count) {
    tvPendingCount.setVisibility(count > 0 ? View.VISIBLE : View.GONE);
    tvPendingCount.setText(count > 0 ? count + " pending" : "");
}
```

UI status labels:
- **Pending Sync** — orange/warning colour, clock icon
- **Settled** — green/success colour, checkmark icon
- **Sync Failed — Retry** — red/error colour, error icon

---

## Step 5 — Implement Offline Refund

Add `processOfflineRefund(transactionIdentifier)` to refund a stored offline sale before it has been synced.

**Kotlin:**
```kotlin
private fun processOfflineRefund(transactionIdentifier: String) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment SDK not initialized", Toast.LENGTH_SHORT).show()
        return
    }
    val params = TransactionParameters.Builder()
        .refund(transactionIdentifier)
        .build()
    val intent = PaymentApplication.mposUi.offlineModule.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private void processOfflineRefund(String transactionIdentifier) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment SDK not initialized", Toast.LENGTH_SHORT).show();
        return;
    }
    TransactionParameters params = new TransactionParameters.Builder()
        .refund(transactionIdentifier)
        .build();
    Intent intent = PaymentApplication.getMposUi().getOfflineModule().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

**Note:** If the original offline sale has already been submitted via batch sync, use a standard online referenced refund instead (see [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) Refund section).

---

## Step 6 — Build Verification

Run `./gradlew assembleDebug` and fix any errors.

Common failures: See `references/pax-aio/troubleshooting.md#offline-transactions` for offline-specific errors (SDK method names, EMV amount errors, configuration requirements).

---

## Acceptance Criteria

Report `PASS` only when **all** of the following are true:

1. `PaymentApplication` sets `OfflineTransactionConfiguration` on `mposUi.offlineModule` before calling `synchronizeConfiguration()`
2. `PaymentApplication` calls `mposUi.offlineModule.synchronizeConfiguration { ... }` immediately after `MposUi.create()`
3. `startOfflineSale()` uses `mposUi.offlineModule.createTransactionIntent()` — NOT `mposUi.createTransactionIntent()`
3a. If `OFFLINE_UI_MODE = dedicated_button`: layout contains `btnOfflineSale` wired to `startOfflineSale()`
3b. If `OFFLINE_UI_MODE = adaptive`: Pay button click handler checks connectivity and routes to `startOfflineSale()` when offline, `startCharge()` when online
4. `TransactionParameters` uses `.charge(amount, currency)` with `io.mpos.transactions.Currency` and `BigDecimal(String)` constructor; amount arithmetic uses `.multiply(BigDecimal("...")).setScale(2, RoundingMode.HALF_UP)`
5. `isMposUiReady()` guard is present before every offline operation — shows feedback and returns, does NOT throw
6. `onActivityResult` handles `RESULT_CODE_APPROVED` (mark as PENDING in UI, increment pending counter) and `RESULT_CODE_FAILED` (show error), with `super.onActivityResult()` called first
7. `syncPendingTransactions()` uses `mposUi.offlineModule.submitOfflineTransactionBatchIntent()` and is triggered when connectivity returns; resets pending counter on success
8. Pending transaction count tracked via manual counter — `getPendingTransactions()` is NOT used
9. UI clearly distinguishes pending offline transactions from settled ones (visual indicator required)
10. `processOfflineRefund()` uses the offline module (`mposUi.offlineModule.createTransactionIntent()`) with `.refund(transactionIdentifier)` parameters
11. `ConnectivityReceiver` (or equivalent) is unregistered on Activity pause/destroy
12. `./gradlew assembleDebug` succeeds

---

## Required Report

```
GATE 8 REPORT (Offline Transactions)
Status: PASS | FAIL | SKIPPED (Q8: developer declined offline transactions)
Build: SUCCESS | FAILED
Build time: Xs
OfflineTransactionConfiguration set in PaymentApplication: YES | NO
synchronizeConfiguration() called in PaymentApplication: YES | NO
offlineModule used (not mposUi directly): YES | NO
io.mpos.transactions.Currency used: YES | NO
isMposUiReady() guard present: YES | NO
RESULT_CODE_APPROVED marks PENDING in UI: YES | NO
Pending count tracked via manual counter (not getPendingTransactions): YES | NO
syncPendingTransactions() uses submitOfflineTransactionBatchIntent(): YES | NO
Connectivity monitoring implemented: YES | NO
UI status indicators implemented: YES | NO
processOfflineRefund() implemented: YES | NO
ConnectivityReceiver unregistered on pause/destroy: YES | NO
Files modified: <list>
Acceptance criteria met: <list>
```

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 8 of the PAX SDK integration: offline (store-and-forward) transactions.

Working directory: <project root>
genai-skills repo: <GENAI_SKILLS_REPO>
Offline UI mode: <OFFLINE_UI_MODE>   ← either "dedicated_button" or "adaptive"

## Transaction parameters (from Step 0 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
TRANSACTION_AMOUNT=<TRANSACTION_AMOUNT>

Use `io.mpos.transactions.Currency.<TRANSACTION_CURRENCY>` for the currency parameter in
offline transaction configuration. Use `BigDecimal("<TRANSACTION_AMOUNT>")` as the amount
when the app has no dynamic price source. If `project-plan.md` specifies a
`payment_amount_source` expression, use that instead.

## Inputs

Read these two files before writing any code:
1. `project-plan.md` (project root) — contains project context and payment entry points
2. `<GENAI_SKILLS_REPO>/src/skills/visa-acceptance-best-practices/references/pax-aio/activities/act_08_implement-offline-transactions.md` — the activity definition

Also read for API reference:
3. Fetch [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Offline Transactions section)

## Your task

Implement offline transactions as specified in the activity file.
Follow the activity file for all steps: offline sale, connectivity monitoring, batch sync,
pending transaction UI, and offline refund.

**Offline UI mode: `<OFFLINE_UI_MODE>`**
- If `dedicated_button`: add a `btnOfflineSale` button to the layout and wire it to `startOfflineSale()`
- If `adaptive`: modify the existing Pay button to call `startOfflineSale()` when offline and `startCharge()` when online

Critical constraints:
- NEVER call `mposUi.createTransactionIntent()` for offline operations — use `mposUi.offlineModule.createTransactionIntent()`
- Import `io.mpos.transactions.Currency` — NOT `java.util.Currency`
- `isMposUiReady()` guard must show feedback and return — it must NOT throw an exception
- UI must clearly distinguish pending offline transactions from settled ones

## Mandatory verification

Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

Verify no java.util.Currency import slipped in:
```bash
grep -rn "java.util.Currency" app/src --include="*.kt" --include="*.java" \
  && echo "FAIL: wrong Currency import" || echo "OK"
```

Verify offline module is used (not direct mposUi):
```bash
grep -rn "offlineModule\|getOfflineModule" app/src --include="*.kt" --include="*.java" \
  && echo "OK: offline module used" || echo "FAIL: offlineModule not found"
```

## Required report

```
GATE 8 REPORT (Offline Transactions)
Status: PASS | FAIL | SKIPPED (Q7d: developer declined offline transactions)
Build: SUCCESS | FAILED
Build time: Xs
OfflineTransactionConfiguration set in PaymentApplication: YES | NO
synchronizeConfiguration() called in PaymentApplication: YES | NO
offlineModule used (not mposUi directly): YES | NO
io.mpos.transactions.Currency used: YES | NO
isMposUiReady() guard present: YES | NO
RESULT_CODE_APPROVED marks PENDING in UI: YES | NO
Pending count tracked via manual counter (not getPendingTransactions): YES | NO
syncPendingTransactions() uses submitOfflineTransactionBatchIntent(): YES | NO
Connectivity monitoring implemented: YES | NO
UI status indicators implemented: YES | NO
processOfflineRefund() implemented: YES | NO
ConnectivityReceiver unregistered on pause/destroy: YES | NO
Files modified: <list>
Acceptance criteria met: <list>
```
```
