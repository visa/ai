# Activity 8: Implement Capture Transaction

Implement capture transactions in the developer's Android project to finalize previously pre-authorized payments. Covers full capture, partial capture, and the SDK's built-in capture via the summary screen. Write code directly to project files — do not just print code examples in the chat.

**Reference:** [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Capture section), [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (MposUi)

## Critical Rules (NEVER violate these)

1. **NEVER hardcode transaction identifiers** — always retrieve `transactionIdentifier` dynamically from the pre-auth result, SharedPreferences, or the built-in summary screen. Hardcoded identifiers will fail in production.
2. **NEVER process capture without verifying mposUi initialization** — always use the guard pattern (`PaymentApplication.isMposUiReady()`) before any capture call. If `mposUi` is not initialized, stop and direct the developer to complete Activity 1 first.
3. **NEVER attempt capture on an already-captured transaction** — check `transaction.isCaptured()` before building capture parameters. The SDK will return `TRANSACTION_ALREADY_CAPTURED` error.
4. **NEVER capture an amount exceeding the authorized amount** — for partial capture, the amount must be <= the original authorized amount (after any incremental authorizations). The SDK will return `CAPTURE_AMOUNT_EXCEEDS` error.
5. **NEVER forget to handle partial capture when the final amount differs from the auth** — if the developer's use case involves variable final amounts (restaurants, hotels), they must use `.amountAndCurrency()` on the capture builder.

## Prerequisites

Before starting, confirm the developer has:

1. **Activity 2 complete** — the project builds successfully with PAX SDK dependencies
2. **Activity 1 complete** — `MposUi` initialized and merchant credentials configured
3. **Activity 7 complete** — pre-authorization is implemented and the `transactionIdentifier` is being persisted on approval

### Verify mposUi Initialization (MANDATORY)

Before any capture implementation, confirm that the developer's application has the mposUi guard pattern in place:

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
2. **Target Activity or Fragment** — Which class should contain the capture functionality? Typically the same class that has pre-auth from Activity 7, or a separate checkout/summary screen. Ask using `AskUserQuestion` if the target is ambiguous.
3. **Existing `onActivityResult`** — Does the target class already have one? If so, the capture handling must be added inside the existing method, not as a duplicate.
4. **Pre-auth identifier storage** — How is `transactionIdentifier` being stored from Activity 7? (member variable, SharedPreferences, Intent extra)

**From this point forward, write code only in the detected language.**

### Step 2: Configure SummaryFeature.CAPTURE_TRANSACTION

Enable the SDK's built-in capture capability on the transaction summary screen. Find the `UiConfiguration` setup in the Application class (from Activity 1). Add `SummaryFeature.CAPTURE_TRANSACTION` to the `summaryFeatures` set.

See [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Create a UiConfiguration Instance" for the full `UiConfiguration` structure.

**CRITICAL:** The existing `UiConfiguration` MUST retain `.terminalParameters()` and any previously-added `SummaryFeature` entries (e.g., `REFUND_TRANSACTION`). Just add `SummaryFeature.CAPTURE_TRANSACTION` to the set.

With `CAPTURE_TRANSACTION` enabled, the SDK's summary screen includes a capture button for uncaptured pre-authorizations. For historic transactions, use `createTransactionSummaryIntent()` to open the summary screen.

### Step 3: Determine Capture Approach

Use the `AskUserQuestion` tool to ask the developer which capture approach they need:

- **SDK Built-in Capture (Recommended)** — uses `SummaryFeature.CAPTURE_TRANSACTION` configured in Step 2. No custom capture UI needed. The summary screen after a pre-auth or via `createTransactionSummaryIntent()` shows a capture button.
- **Programmatic Capture** — build `TransactionParameters` manually for full control (continue to Step 4+)

If the developer chooses **SDK Built-in Capture**, the work is done — Step 2 already configured the capture button. Optionally add a button that opens the summary screen via `createTransactionSummaryIntent()`, then skip to Step 9 (Build and Verify).

If the developer chooses **Programmatic Capture**, continue below.

### Step 4: Determine Capture Type

Use the `AskUserQuestion` tool to ask which capture type:

- **Full Capture** — capture the entire authorized amount (most common for car rental returns, hotel checkouts at original rate)
- **Partial Capture** — capture a specific amount less than the authorized amount (restaurants with tip, hotel with minibar adjustments below original hold)

If the developer is unsure, recommend **Full Capture** and mention that partial capture can be added later.

### Step 5: Add `startCapture` Method (Full Capture)

In the target Activity or Fragment, add a method that:

1. Guards with `isMposUiReady()`
2. Validates that a pre-auth identifier exists
3. Builds `TransactionParameters` with `.capture(transactionIdentifier)`
4. Calls `createTransactionIntent()` and starts the activity

**Java:**
```java
import android.content.Intent;
import io.mpos.paybutton.MposUi;
import io.mpos.transactions.parameters.TransactionParameters;

private void startCapture(String transactionIdentifier) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }

    if (transactionIdentifier == null || transactionIdentifier.isEmpty()) {
        Toast.makeText(this, "No pre-authorization to capture.", Toast.LENGTH_SHORT).show();
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .capture(transactionIdentifier)
            .build();

    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

**Kotlin:**
```kotlin
import android.content.Intent
import io.mpos.paybutton.MposUi
import io.mpos.transactions.parameters.TransactionParameters

private fun startCapture(transactionIdentifier: String?) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }

    if (transactionIdentifier.isNullOrEmpty()) {
        Toast.makeText(this, "No pre-authorization to capture.", Toast.LENGTH_SHORT).show()
        return
    }

    val params = TransactionParameters.Builder()
        .capture(transactionIdentifier)
        .build()

    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

### Step 6: Add Partial Capture Variant (if applicable)

If the developer selected partial capture in Step 4, add a variant that accepts an amount:

**Java:**
```java
import io.mpos.transactions.Currency;
import java.math.BigDecimal;

private void startPartialCapture(String transactionIdentifier, BigDecimal captureAmount) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }

    if (transactionIdentifier == null || transactionIdentifier.isEmpty()) {
        Toast.makeText(this, "No pre-authorization to capture.", Toast.LENGTH_SHORT).show();
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .capture(transactionIdentifier)
            .amountAndCurrency(captureAmount, Currency.<CURRENCY_CODE>)
            .build();

    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

**Kotlin:**
```kotlin
import io.mpos.transactions.Currency
import java.math.BigDecimal

private fun startPartialCapture(transactionIdentifier: String?, captureAmount: BigDecimal) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }

    if (transactionIdentifier.isNullOrEmpty()) {
        Toast.makeText(this, "No pre-authorization to capture.", Toast.LENGTH_SHORT).show()
        return
    }

    val params = TransactionParameters.Builder()
        .capture(transactionIdentifier)
        .amountAndCurrency(captureAmount, Currency.<CURRENCY_CODE>)
        .build()

    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

Replace `<CURRENCY_CODE>` with the currency established in Activity 7.

### Step 7: Add Result Handling

Add or update `onActivityResult` in the target class. If `onActivityResult` already exists (from pre-auth or charge integration), add the capture handling inside the existing method — do not create a duplicate.

**Kotlin:**
```kotlin
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        val transaction = PaymentApplication.mposUi.getLatestTransaction()

        when (resultCode) {
            MposUi.RESULT_CODE_APPROVED -> {
                if (transaction != null && transaction.isCaptured) {
                    onCaptureApproved(transaction)
                } else {
                    // Pre-auth approved (from Activity 7)
                    onPreAuthApproved(transaction)
                }
            }
            MposUi.RESULT_CODE_FAILED -> {
                onTransactionFailed(transaction)
            }
        }
    }
}

private fun onCaptureApproved(transaction: Transaction?) {
    Toast.makeText(this, "Payment captured successfully", Toast.LENGTH_SHORT).show()
    preAuthTransactionIdentifier = null // Clear — capture is done
    // transaction?.identifier → captured transaction ID
    // transaction?.amount     → captured amount
}

private fun onTransactionFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Transaction declined" else "Transaction failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
```

**Java:**
```java
@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        Transaction transaction = PaymentApplication.getMposUi().getLatestTransaction();

        if (resultCode == MposUi.RESULT_CODE_APPROVED) {
            if (transaction != null && transaction.isCaptured()) {
                onCaptureApproved(transaction);
            } else {
                // Pre-auth approved (from Activity 7)
                onPreAuthApproved(transaction);
            }
        } else if (resultCode == MposUi.RESULT_CODE_FAILED) {
            onTransactionFailed(transaction);
        }
    }
}

private void onCaptureApproved(Transaction transaction) {
    Toast.makeText(this, "Payment captured successfully", Toast.LENGTH_SHORT).show();
    preAuthTransactionIdentifier = null; // Clear — capture is done
}

private void onTransactionFailed(Transaction transaction) {
    String message = (transaction != null) ? "Transaction declined" : "Transaction failed";
    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
}
```

### Step 8: Add UI Trigger for Capture

Add a capture button to the layout. The button MUST be **initially hidden** (`android:visibility="gone"`)
and only made visible after a successful pre-authorization. This prevents UI clutter and avoids
overlapping with existing buttons (charge, refund, mode selector).

**Layout XML — place BELOW the existing pay button with explicit positioning:**
```xml
<!-- Place AFTER the existing pay button. Initially hidden — shown after pre-auth approval. -->
<Button
    android:id="@+id/btn_capture"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="Capture Payment"
    android:visibility="gone" />
```

If the parent is a `ConstraintLayout`, also add:
```xml
app:layout_constraintTop_toBottomOf="@id/<existing_pay_button_id>"
```

**CRITICAL layout rule:** The capture button must NOT overlap the pay button, mode selector, or
refund button. Use `layout_marginTop` (LinearLayout) or `layout_constraintTop_toBottomOf`
(ConstraintLayout) to position it below the last visible element.

**Wire the button and manage visibility:**

**Kotlin:**
```kotlin
val btnCapture = findViewById<Button>(R.id.btn_capture)
btnCapture.setOnClickListener {
    startCapture(preAuthTransactionIdentifier)
}
```

In `onPreAuthApproved` (from Activity 7), **show** the capture button:
```kotlin
private fun onPreAuthApproved(transaction: Transaction?) {
    Toast.makeText(this, "Pre-authorization approved", Toast.LENGTH_SHORT).show()
    // Show capture button now that a pre-auth is pending
    findViewById<Button>(R.id.btn_capture).visibility = View.VISIBLE
}
```

In `onCaptureApproved`, **hide** it again:
```kotlin
private fun onCaptureApproved(transaction: Transaction?) {
    Toast.makeText(this, "Payment captured successfully", Toast.LENGTH_SHORT).show()
    preAuthTransactionIdentifier = null
    // Hide capture button — capture is done
    findViewById<Button>(R.id.btn_capture).visibility = View.GONE
}
```

**Java:**
```java
Button btnCapture = findViewById(R.id.btn_capture);
btnCapture.setOnClickListener(v -> startCapture(preAuthTransactionIdentifier));
```

In `onPreAuthApproved`:
```java
private void onPreAuthApproved(Transaction transaction) {
    Toast.makeText(this, "Pre-authorization approved", Toast.LENGTH_SHORT).show();
    // Show capture button now that a pre-auth is pending
    findViewById(R.id.btn_capture).setVisibility(View.VISIBLE);
}
```

In `onCaptureApproved`:
```java
private void onCaptureApproved(Transaction transaction) {
    Toast.makeText(this, "Payment captured successfully", Toast.LENGTH_SHORT).show();
    preAuthTransactionIdentifier = null;
    // Hide capture button — capture is done
    findViewById(R.id.btn_capture).setVisibility(View.GONE);
}
```

### Step 8b: Verify Click-Listener Wiring (Mandatory — Non-Skippable) <!-- REC-02 -->

After wiring the capture button on every screen, run these checks for each modified Activity.
All checks must pass before running the build.

**Check A — capture wiring IS present:**
```bash
grep -n "startCapture\|startPartialCapture\|btn_capture\|btnCapture" \
  app/src/main/java/<path-to-activity>
```
Zero matches = FAIL. Fix the wiring before continuing.

**Check B — no original Toast/booking handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```
Review the output carefully. If `Toast.makeText` appears inside a `setOnClickListener` block that
was replaced by the capture call, that is a **HARD FAIL**. The original handler must be removed
entirely — it must NOT remain in any click listener that now calls the capture method.

**Check C — capture button starts hidden and uses visibility management:** <!-- UI-FIX -->
```bash
grep -n "visibility.*gone\|GONE\|View.VISIBLE\|View.GONE" \
  app/src/main/java/<path-to-activity>
grep -n "visibility.*gone\|android:visibility" \
  app/src/main/res/layout/<layout-file>.xml
```
The layout XML must have `android:visibility="gone"` on `btn_capture`. The Activity source
must set `View.VISIBLE` in `onPreAuthApproved` and `View.GONE` in `onCaptureApproved`.
If the capture button is visible by default, that is a **HARD FAIL** — it must only appear after
a successful pre-authorization.

**Check D — no button overlap in layout:** <!-- UI-FIX -->
```bash
grep -n "btn_capture\|btn_pay\|btn_pre_auth\|btn_refund" \
  app/src/main/res/layout/<layout-file>.xml
```
Review the layout: every button must have explicit positioning (margin, constraint, or LinearLayout
ordering) that prevents overlap. If two buttons lack positioning constraints relative to each other,
that is a **HARD FAIL**.

This check is binary. Do NOT report success and move on — fix the wiring, then re-run all checks.

### Step 9: Build and Verify

**You MUST actually run the build command using the Bash tool** — do not just tell the developer to run it. Execute the build, read the output, and fix any errors before finishing.

```bash
./gradlew assembleDebug
```

**If the build fails, fix the errors and rebuild.** Do not consider the activity complete until the build passes.

Additional verification:

```bash
# Verify CAPTURE_TRANSACTION is present in UiConfiguration
grep -rn "CAPTURE_TRANSACTION" app/src --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: CAPTURE_TRANSACTION missing"
```

## Troubleshooting

See `references/pax-aio/troubleshooting.md#capture` for capture-specific errors (amount exceeds, already captured, expired auth, cashback not allowed, ProGuard).

## Acceptance Criteria

This activity is complete when all of the following are true:

1. **Code was written to project files** — capture logic was added directly to the target class using Edit or Write tools
2. **Only the project language was used** — code was written in either Java or Kotlin (not both)
3. **`SummaryFeature.CAPTURE_TRANSACTION` is configured** — `UiConfiguration` includes `CAPTURE_TRANSACTION`
4. For programmatic capture: correct `TransactionParameters` built with `.capture(transactionIdentifier)`
5. For partial capture: `.amountAndCurrency()` is used with the correct amount and currency
6. mposUi initialization guard is present before the capture call
7. Transaction identifier is validated before building capture parameters (null/empty check)
8. For programmatic capture: `startActivityForResult` is called with `MposUi.REQUEST_CODE_PAYMENT`
9. For programmatic capture: `onActivityResult` handles both `RESULT_CODE_APPROVED` and `RESULT_CODE_FAILED`
10. Transaction identifier is retrieved dynamically — no hardcoded identifiers
11. **A UI trigger (button) was added** — a capture button was added to the layout XML and wired to the capture method <!-- REC-02 -->
12. **Build was executed and passes** — `./gradlew assembleDebug` was actually run using the Bash tool and succeeded
13. `grep -n "startCapture\|startPartialCapture\|btnCapture" <each-modified-activity>` returns at least one match per screen <!-- REC-02 -->
14. No original Toast/booking handler remains in any click listener that now calls the capture method <!-- REC-02 -->
15. **Capture button starts hidden** — layout XML has `android:visibility="gone"` on `btn_capture` <!-- UI-FIX -->
16. **Capture button shown after pre-auth** — `onPreAuthApproved` sets `btn_capture` to `View.VISIBLE` <!-- UI-FIX -->
17. **Capture button hidden after capture** — `onCaptureApproved` sets `btn_capture` to `View.GONE` <!-- UI-FIX -->
18. **No button overlap** — capture button has explicit layout positioning (`layout_marginTop` or `layout_constraintTop_toBottomOf`) relative to adjacent elements <!-- UI-FIX -->

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 7 of the PAX SDK integration: capture transaction.

Working directory: <project root>

## Transaction parameters (from Step 0 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
TRANSACTION_AMOUNT=<TRANSACTION_AMOUNT>

Use `io.mpos.transactions.Currency.<TRANSACTION_CURRENCY>` for the currency parameter in
capture parameters. For partial capture, the amount must be <= the authorized amount from
Gate 6.

## Inputs

Read these two files before writing any code:
1. `project-plan.md` (project root) — contains project context and payment entry points
2. `references/pax-aio/activities/act_07_implement-capture.md`

Also read for API reference:
3. Fetch [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Capture section)

## Your task

Implement capture transactions as specified in the activity file.
Follow the activity file for sequencing, critical rules, and acceptance criteria.
Use the SDK Built-in Capture approach (SummaryFeature.CAPTURE_TRANSACTION) as the primary path.

Critical constraints:
- NEVER hardcode transaction identifiers
- Transaction identifier must be validated (null/empty check) before building capture parameters
- `SummaryFeature.CAPTURE_TRANSACTION` must be added to `UiConfiguration`
- For partial capture, amount must be <= authorized amount

UI constraints (CRITICAL — prevents button overlap):
- The capture button MUST start with `android:visibility="gone"` in layout XML
- Show the capture button (`View.VISIBLE`) only in `onPreAuthApproved`
- Hide the capture button (`View.GONE`) in `onCaptureApproved`
- The capture button MUST have explicit layout positioning (`layout_marginTop` or
  `layout_constraintTop_toBottomOf`) so it does not overlap the pay button or mode selector

## Mandatory verification

Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

Verify CAPTURE_TRANSACTION is present:
```bash
grep -rn "CAPTURE_TRANSACTION" app/src --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: CAPTURE_TRANSACTION missing"
```

<!-- REC-02 -->
**Mandatory click-listener verification for capture button (non-skippable):**

**Check A — capture wiring IS present:**
```bash
grep -n "startCapture\|startPartialCapture\|btnCapture" \
  app/src/main/java/<path-to-activity>
```

**Check B — no original handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```

**Check C — capture button starts hidden and has visibility management:**
```bash
grep -n "visibility.*gone\|GONE\|View.VISIBLE" app/src/main/res/layout/<layout>.xml \
  app/src/main/java/<path-to-activity>
```

If any check fails, fix and re-run before reporting PASS.

## Required report

```
GATE 7 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED
Build time: Xs
CAPTURE_TRANSACTION in UiConfiguration: YES | NO
isMposUiReady guard before capture: YES | NO
No hardcoded transaction identifiers: YES | NO
Transaction identifier validated (null check): YES | NO
Capture button in layout: YES | NO (list all screens)
Capture button starts hidden (visibility=gone): YES | NO
Capture button shown in onPreAuthApproved: YES | NO
Capture button hidden in onCaptureApproved: YES | NO
No button overlap (layout verified): YES | NO
startCapture wired on all capture buttons: YES | NO
Original Toast handler removed from all wired capture buttons: YES | NO
Files modified: <list>
Acceptance criteria met: <list>
```
```
