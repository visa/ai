# Activity 5: Implement Refund Transactions

Implement refund transactions in the developer's Android project using `TransactionParameters.Builder()` and `MposUi`, covering referenced refunds, standalone credits, token-based refunds, and offline refunds. Write code directly to project files — do not just print code examples in the chat.

**Reference:** [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Refund, Token Refund sections), [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (MposUi)

## Critical Rules (NEVER violate these)

1. **NEVER process a refund without verifying mposUi initialization** — always use the guard pattern (`PaymentApplication.isMposUiReady()`) before any refund call. If `mposUi` is not initialized, stop and direct the developer to complete Activity 1 first.
2. **NEVER hardcode transaction identifiers** — always retrieve `transactionIdentifier` dynamically from the SDK via `mposUi.latestTransaction.identifier` or the built-in summary screen. Hardcoded identifiers will fail in production.
3. **NEVER use standalone credit when a referenced refund is possible** — standalone credits carry higher risk and should only be used when the original transaction identifier is unavailable.

## Prerequisites

Before starting, confirm the developer has:

1. **Activity 2 complete** — the project builds successfully with PAX SDK dependencies
2. **Activity 1 complete** — `MposUi` initialized and merchant credentials configured
3. **A completed charge transaction** — for referenced refunds, there must be a previous successful charge

### Verify mposUi Initialization (MANDATORY)

Before any refund implementation, confirm that the developer's application has the mposUi guard pattern in place:

**Kotlin:**
```kotlin
if (!PaymentApplication.isMposUiReady()) {
    return
}
val mposUi = PaymentApplication.mposUi
```

**Java:**
```java
if (!PaymentApplication.isMposUiReady()) {
    return;
}
MposUi mposUi = PaymentApplication.getMposUi();
```

**Do NOT proceed to Step 1 until the developer confirms mposUi initialization is in place.**

## Workflow

Follow these steps in order. **All code changes must be written directly to project files using the Edit or Write tools — do not just output code in the chat.**

### Step 1: Discover Project Context

Before writing any code, read the project to determine:

1. **Project language** — Java or Kotlin? Check existing source files in the app module.
2. **Target Activity or Fragment** — Which class should contain the refund functionality? Ask using `AskUserQuestion` if the target is ambiguous.
3. **Existing `onActivityResult`** — Does the target class already have one? If so, the refund handling must be added inside the existing method, not as a duplicate.

**From this point forward, write code only in the detected language.**

### Step 2: Configure SummaryFeature.REFUND_TRANSACTION

Enable the SDK's built-in refund capability on the transaction summary screen. Find the `UiConfiguration` setup in the Application class (from Activity 1). Add `SummaryFeature.REFUND_TRANSACTION` to the `summaryFeatures` set.

See [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Create a UiConfiguration Instance" for the full `UiConfiguration` structure.

**CRITICAL:** The existing `UiConfiguration` MUST retain `.terminalParameters()`. Just add `SummaryFeature.REFUND_TRANSACTION` to the `summaryFeatures` set alongside existing features.

With `REFUND_TRANSACTION` enabled, the SDK's summary screen (shown after every charge) includes a refund button. For historic transactions, use `createTransactionSummaryIntent()` to open the summary screen for any past transaction.

### Step 3: Determine Refund Approach

Use the `AskUserQuestion` tool to ask the developer which refund approach they need:

- **SDK Built-in Refund (Recommended)** — uses `SummaryFeature.REFUND_TRANSACTION` configured in Step 2. No custom refund UI needed.
- **Programmatic Refund** — build `TransactionParameters` manually for full control (continue to Step 4+)

If the developer chooses **SDK Built-in Refund**, the work is done — Step 2 already configured the refund button. Skip to Step 10 to optionally add a button that opens the summary screen via `createTransactionSummaryIntent()`, then Step 11 (Build and Verify).

If the developer chooses **Programmatic Refund**, continue below.

### Step 4: Determine Refund Type

Use the `AskUserQuestion` tool to ask which refund type:

- **Referenced Refund** — refund linked to an original transaction (full or partial)
- **Standalone Credit** — independent credit, card present, no original transaction
- **Token-Based Refund** — refund using a stored payment token (requires Token Management Service)
- **Offline Refund** — refund an offline sale not yet submitted to the processor

If the developer is unsure, recommend **Referenced Refund**.

### Step 5: Collect Required Inputs

Based on the refund type, collect the required inputs. Do not ask for multiple inputs at the same time.

**Referenced Refund:**
1. Full or partial? (use `AskUserQuestion`)
2. If partial: Amount and Currency

**Standalone Credit:**
1. Amount
2. Currency
3. Custom identifier (optional)

**Token-Based Refund:**
1. Amount and Currency
2. Instrument identifier ID
3. Custom identifier (required)

**Offline Refund:**
1. Transaction identifier of the offline sale

### Step 6: Add TransactionParameters Construction

Add a refund method to the target class with the `isMposUiReady()` guard and the correct `TransactionParameters.Builder()` chain.

Fetch the API signatures from [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) → "Refund" section. The docs show all builder patterns for:
- **Referenced Refund (full):** `.refund(transactionIdentifier)`
- **Referenced Refund (partial):** `.refund(transactionIdentifier)` + `.amountAndCurrency(amount, currency)`
- **Standalone Credit:** `.refund(amount, currency)` + `.customIdentifier(id)`

**Integration pattern** — always wrap with the guard:
```kotlin
private fun performRefund(transactionIdentifier: String) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available.", Toast.LENGTH_SHORT).show()
        return
    }
    val params = TransactionParameters.Builder()
        // ... builder chain from official docs
        .build()
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

### Step 7: Add AccountParameters Construction (Token Refunds Only)

If the developer selected token-based refund, add `AccountParameters` construction. Otherwise, **skip this step entirely**.

**Kotlin:**
```kotlin
val accountParams = AccountParameters.Builder()
    .token()
    .cybersource()
    .shopperAccountIdentifier(instrumentIdentifierID)
    .build()
```

### Step 8: Add Intent Creation and Launch

**For referenced refunds, standalone credits, and token-based refunds (Kotlin):**
```kotlin
// Standard refund (non-token)
val intent = mposUi.createTransactionIntent(params)

// Token-based refund — pass both params and accountParams
val intent = mposUi.createTransactionIntent(params, accountParams)

startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
```

**For offline refunds — use the offline module (Kotlin):**
```kotlin
val intent = mposUi.offlineModule.createTransactionIntent(params)
startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
```

### Step 9: Add Result Handling

Add or update `onActivityResult` in the target class. If `onActivityResult` already exists (found in Step 1), add the refund handling inside the existing method — do not create a duplicate.

**Kotlin:**
```kotlin
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        when (resultCode) {
            MposUi.RESULT_CODE_APPROVED -> {
                val transactionIdentifier = data?.getStringExtra(
                    MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER
                )
                val transaction = mposUi.latestTransaction
                // Show success to user, log the refund identifier
            }
            MposUi.RESULT_CODE_FAILED -> {
                val transaction = mposUi.latestTransaction
                val error = transaction?.error
                // Log error, show failure to user
            }
        }
    }
}
```

### Step 10: Add UI Trigger for Refund

Add a button to the target Activity or Fragment's layout so the user can trigger the refund.

```xml
<Button
    android:id="@+id/btnRefund"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="Refund" />
```

Wire the button to the refund method:

**Kotlin:**
```kotlin
findViewById<Button>(R.id.btnRefund).setOnClickListener {
    performRefund()
}
```

**Java:**
```java
Button btnRefund = findViewById(R.id.btnRefund);
btnRefund.setOnClickListener(v -> performRefund());
```

### Step 10b: Verify Refund Click-Listener Wiring (Mandatory — Non-Skippable) <!-- REC-02 -->

After wiring the refund button on every screen, run these two checks for each modified Activity.
Both checks must pass before running the build.

**Check A — refund wiring IS present:**
```bash
grep -n "performRefund\|startActivityForResult.*REQUEST_CODE_PAYMENT\|btnRefund" \
  app/src/main/java/<path-to-activity>
```
Zero matches = FAIL. Fix the wiring before continuing.

**Check B — no original Toast/booking handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```
Review the output carefully. If `Toast.makeText` appears inside a `setOnClickListener` block that
was replaced by the refund call, that is a **HARD FAIL**. The original handler must be removed
entirely — it must NOT remain in any click listener that now calls the refund method.

This check is binary. Do NOT report success and move on — fix the wiring, then re-run both checks.

### Step 11: Build and Verify

**You MUST actually run the build command using the Bash tool** — do not just tell the developer to run it. Execute the build, read the output, and fix any errors before finishing.

```bash
./gradlew assembleDebug
```

**If the build fails, fix the errors and rebuild.** Do not consider the activity complete until the build passes.

## Troubleshooting

See `references/pax-aio/troubleshooting.md#refund` for refund-specific errors (null mposUi, invalid identifiers, amount exceeds, TMS, ProGuard).

## Acceptance Criteria

This activity is complete when all of the following are true:

1. **Code was written to project files** — refund logic was added directly to the target class using Edit or Write tools
2. **Only the project language was used** — code was written in either Java or Kotlin (not both)
3. **`SummaryFeature.REFUND_TRANSACTION` is configured** — `UiConfiguration` includes `REFUND_TRANSACTION`
4. For programmatic refunds: correct `TransactionParameters` built for the selected refund type
5. mposUi initialization guard is present before the refund call
6. For programmatic refunds: `startActivityForResult` is called with `MposUi.REQUEST_CODE_PAYMENT`
7. For programmatic refunds: `onActivityResult` handles both `RESULT_CODE_APPROVED` and `RESULT_CODE_FAILED`
8. Transaction identifier is retrieved from the SDK — no hardcoded identifiers
9. For token-based refunds: `AccountParameters` is constructed and passed to `createTransactionIntent`
10. For offline refunds: `mposUi.offlineModule.createTransactionIntent()` is used
11. **A UI trigger (button) was added** — a refund button was added to the layout XML and wired to the refund method for **all** screens that received a charge button in Activity 4 <!-- REC-02 -->
12. **Build was executed and passes** — `./gradlew assembleDebug` was actually run using the Bash tool and succeeded
13. `grep -n "performRefund\|btnRefund" <each-modified-activity>` returns at least one match per screen <!-- REC-02 -->
14. No original Toast/booking handler remains in any click listener that now calls the refund method <!-- REC-02 -->

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 4 of the PAX SDK integration: refund transactions.

Working directory: <project root>

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — contains project context, `payment_entry_points`, and GATE 4 implementation notes
2. `references/pax-aio/activities/act_04_implement-refund.md` — the activity definition (full implementation guidance)

## Your task

Implement refund transactions using the activity file as your primary implementation guide.
Use `project-plan.md` for project-specific metadata (target screens, layout files).
Use the SDK Built-in Refund approach (SummaryFeature.REFUND_TRANSACTION) as the primary path.

## Mandatory verification

Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

Verify REFUND_TRANSACTION is present:
```bash
grep -rn "REFUND_TRANSACTION" app/src --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: REFUND_TRANSACTION missing"
```

<!-- REC-02 -->
**Mandatory click-listener verification for refund button (non-skippable):**

For each modified Activity that received a refund button, run both checks:

**Check A — refund wiring IS present:**
```bash
grep -n "performRefund\|startActivityForResult.*REQUEST_CODE_PAYMENT\|btnRefund" \
  app/src/main/java/<path-to-activity>
```
If zero matches: FAIL — refund was not wired.

**Check B — no original handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```

<!-- REC-01 -->
**Multi-screen check:** Confirm each screen from `payment_entry_points` in `project-plan.md`
that received a charge button in Gate 3 also has a refund button wired in Gate 4.

## Required report

```
GATE 4 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED
Build time: Xs
REFUND_TRANSACTION in UiConfiguration: YES | NO
isMposUiReady guard before refund: YES | NO
No hardcoded transaction identifiers: YES | NO
Refund button in layout: YES | NO (list all screens)
performRefund wired on all refund buttons: YES | NO
Original Toast handler removed from all wired refund buttons: YES | NO
All payment_entry_points have refund button: YES | NO (list any missed)
Files modified: <list>
Acceptance criteria met: <list>
```
```
