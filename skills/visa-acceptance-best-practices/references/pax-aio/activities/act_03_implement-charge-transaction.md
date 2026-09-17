# Activity 4: Implement Charge Transaction

Guide the developer through implementing a charge transaction using the PAX All-in-One SDK Default UI so their app can accept card payments on PAX terminals.

**Reference:** [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Sale section), [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (MposUi)

## Critical Rules (NEVER violate these)

1. **NEVER use `java.util.Currency`.** The PAX SDK uses its own `io.mpos.transactions.Currency` enum. Using `java.util.Currency` will cause a compilation error.
2. **NEVER start a transaction without an initialization guard.** Always call `PaymentApplication.isMposUiReady()` (or equivalent) before `createTransactionIntent()`. Calling it on an uninitialized instance will crash.
3. **NEVER hardcode amounts in the transaction parameters.** Accept the amount as a parameter to the payment method. Hardcoded amounts are unreviewable and untestable.
4. **NEVER skip calling `super.onActivityResult()`** before handling the request code. Omitting it breaks back-stack and fragment result propagation.
5. **NEVER check `resultCode == Activity.RESULT_OK`.** The SDK uses its own constants: `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED`. Using `RESULT_OK` misses declined transactions that still return a transaction object.
6. **NEVER leave `onChargeApproved` or `onChargeFailed` as empty stubs.** Both handlers must show user-visible feedback (at minimum a Toast or Snackbar).
7. **NEVER include currency symbols or special characters in `transaction.subject`.** The backend `@SecureText` validator rejects values containing `$`, `€`, `£`, or other symbols — the transaction fails with HTTP 400 `TRANSACTION_ERROR_INVALID_TRANSACTION_REQUEST`. Use only alphanumeric characters, spaces, and standard punctuation (e.g., `"Fox donation 1.00"` not `"Fox donation $1"`).

## Prerequisites

Before starting this activity, the developer must have completed:

- **Activity 2** — SDK dependencies configured
- **Activity 1** — `MposUi` initialized; a `PaymentApplication` class must exist with `getMposUi()` and `isMposUiReady()`

## Workflow

Follow these steps in order.

### Step 1: Identify ALL Payment Screens

<!-- REC-01 -->
**Do NOT assume a single screen has the payment button.** First, search the project for ALL
payment entry points, then confirm with the developer.

**Search for ALL payment entry points:**
```bash
# Find activities/fragments with price, amount, or pay-related UI
grep -rn "setOnClickListener\|OnClickListener" app/src/main/java/ --include="*.kt" --include="*.java"
grep -rni "TODO.*pay\|TODO.*charge\|TODO.*purchase\|TODO.*donat\|TODO.*checkout" \
  app/src/main/java/ --include="*.kt" --include="*.java"
grep -rni "price\|amount\|total\|btn_pay\|btn_buy\|btn_donate\|btnPay\|btnBuy" \
  app/src/main/res/layout/ --include="*.xml"
```

Compile the results into a list of candidate screens, then use `AskUserQuestion` to confirm:

**Question A — which screens:**
```
I found the following screens that appear to handle payments or display prices:

  <list each candidate class name and the evidence found>

Which of these should have PAX payment integrated? (Select ALL that apply — do not skip any.)
```

**Do NOT ask about one screen and stop.** Integration must cover all confirmed screens.

For each confirmed screen, ask:

**Question B — what UI element (per screen):**
```
How should payment be triggered on <ScreenName>?

Options:
  - Button on each list item (e.g. "Buy" per product row) — amount comes from the item
  - Floating Action Button (FAB) — developer provides a fixed amount
  - Standalone Button in the layout — developer provides a fixed amount
  - Other (describe)
```

**Question C — amount source (per screen, only if FAB or standalone Button was chosen in B):**
```
What amount should be charged on <ScreenName>?

Options:
  - Fixed amount (type the value, e.g. 9.99)
  - User-entered at runtime (add an EditText for the user to type the amount)
```

If "Button on each list item" was chosen, the amount always comes from the item's price field — do NOT ask Question C.

After collecting answers, also determine:
- Is the project **Java** or **Kotlin**? (Check CLAUDE.md or existing source files.)

**Proceed to Step 2 only after all screens and their UI elements are confirmed.**

The instruction for implementation is: integrate PAX payment in **all** of the confirmed screens —
do not implement only the primary screen and leave others untouched.

### Step 2: Ask for the Currency

Use `AskUserQuestion` to ask the developer which currency to use. The SDK requires `io.mpos.transactions.Currency` — an enum, not `java.util.Currency`.

Common values: `EUR`, `USD`, `GBP`, `CHF`, `PLN`, `CZK`, `HUF`, `SEK`, `NOK`, `DKK`.

```
Which currency should be used for charge transactions?
Options: EUR / USD / GBP / CHF / Other (type the ISO-4217 code)
```

### Step 3: Add the `startCharge` Method

In the target Activity or Fragment, add a method that:

1. Guards with `isMposUiReady()`
2. Builds `TransactionParameters` using the `ChargeBuilder`
3. Calls `createTransactionIntent()` and starts the activity

**Java:**
```java
import android.content.Intent;
import io.mpos.paybutton.MposUi;
import io.mpos.transactions.Currency;
import io.mpos.transactions.parameters.TransactionParameters;
import java.math.BigDecimal;

private void startCharge(BigDecimal amount, String subject) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .charge(amount, Currency.<CURRENCY_CODE>)
            .subject(subject)
            .build();

    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

**Kotlin:**
```kotlin
import android.content.Intent
import io.mpos.paybutton.MposUi
import io.mpos.transactions.Currency
import io.mpos.transactions.parameters.TransactionParameters
import java.math.BigDecimal

private fun startCharge(amount: BigDecimal, subject: String) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }

    val params = TransactionParameters.Builder()
        .charge(amount, Currency.<CURRENCY_CODE>)
        .subject(subject)
        .build()

    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

Replace `<CURRENCY_CODE>` with the value from Step 2 (e.g., `Currency.EUR`).

### Step 4: Add `onActivityResult` to Handle the Outcome

Add (or update) `onActivityResult` in the same Activity. Use `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED` — **not** `Activity.RESULT_OK`.

**Java:**
```java
import android.content.Intent;
import io.mpos.paybutton.MposUi;
import io.mpos.transactions.Transaction;

@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        Transaction transaction = PaymentApplication.getMposUi().getLatestTransaction();

        if (resultCode == MposUi.RESULT_CODE_APPROVED) {
            onChargeApproved(transaction);
        } else if (resultCode == MposUi.RESULT_CODE_FAILED) {
            onChargeFailed(transaction);
        }
    }
}

private void onChargeApproved(Transaction transaction) {
    Toast.makeText(this, "Payment approved", Toast.LENGTH_SHORT).show();
    // TODO: navigate to a receipt screen and pass transaction details:
    //   transaction.getIdentifier()   → transaction ID (for receipts/refunds)
    //   transaction.getAmount()       → charged amount
    //   transaction.getCardDetails()  → masked PAN, card scheme
}

private void onChargeFailed(Transaction transaction) {
    String message = (transaction != null) ? "Payment declined" : "Payment failed";
    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    // TODO: show a more detailed error dialog or navigate to a retry screen
}
```

**Kotlin:**
```kotlin
import android.content.Intent
import io.mpos.paybutton.MposUi
import io.mpos.transactions.Transaction

override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        val transaction = PaymentApplication.mposUi.getLatestTransaction()

        when (resultCode) {
            MposUi.RESULT_CODE_APPROVED -> onChargeApproved(transaction)
            MposUi.RESULT_CODE_FAILED   -> onChargeFailed(transaction)
        }
    }
}

private fun onChargeApproved(transaction: Transaction?) {
    Toast.makeText(this, "Payment approved", Toast.LENGTH_SHORT).show()
    // TODO: navigate to a receipt screen and pass transaction details:
    //   transaction?.identifier   → transaction ID (for receipts/refunds)
    //   transaction?.amount       → charged amount
    //   transaction?.cardDetails  → masked PAN, card scheme
}

private fun onChargeFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Payment declined" else "Payment failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    // TODO: show a more detailed error dialog or navigate to a retry screen
}
```

### Step 5: Wire to the UI Element

Connect the UI element (FAB, Button, or item tap) to `startCharge()`.

**FAB example (Java):**
```java
FloatingActionButton fab = findViewById(R.id.fab);
fab.setOnClickListener(view -> startCharge(new BigDecimal("10.00"), "Tire purchase"));
```

**Button example (Kotlin):**
```kotlin
val payButton = findViewById<Button>(R.id.btn_pay)
payButton.setOnClickListener { startCharge(amount, subject) }
```

For item taps on a `RecyclerView`, call `startCharge()` from the adapter's click callback, passing the item's price as a `BigDecimal`.

### Step 5b: Verify Click-Listener Wiring (Mandatory — Non-Skippable) <!-- REC-02 -->

After wiring `startCharge()` on every screen, run these two checks for each modified Activity.
Both checks must pass before proceeding to Step 6.

**Check A — `startCharge(` IS present in the file:**
```bash
grep -n "startCharge(" app/src/main/java/<path-to-activity>
```
Zero matches = FAIL. Fix the wiring before continuing.

**Check B — no original Toast/booking handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```
Review the output carefully. If `Toast.makeText` appears inside a `setOnClickListener` block that
was supposed to be replaced by `startCharge()`, that is a **HARD FAIL**. The original handler must
be removed entirely — it must NOT remain in any click listener that now calls `startCharge()`.

This check is binary and must produce a hard FAIL if the old handler remains. Do NOT report
success and move on — fix the wiring, then re-run both checks.

### Step 6: Build and Verify

```bash
./gradlew assembleDebug
```

If the build fails:

1. **`Currency` import error** — ensure `import io.mpos.transactions.Currency;` is present, not `java.util.Currency`.
2. **`createTransactionIntent` not found** — verify the `MposUi` instance is from `PaymentApplication.getMposUi()`.
3. **`startActivityForResult` deprecated warning** — this is expected on API 31+. The SDK's Default UI still requires `startActivityForResult` / `onActivityResult`. Use `@SuppressWarnings("deprecation")` if necessary.
4. **`PaymentApplication` not found** — complete Activity 1 first to create the Application class.

## Troubleshooting

See `references/pax-aio/troubleshooting.md#common` for charge-related errors (Currency import, MposUi init guard, getLatestTransaction null, user cancellation).

## Acceptance Criteria

This activity is complete when all of the following are true:

1. ALL payment entry point screens were discovered (via grep) and confirmed with the user before any code was written <!-- REC-01 -->
2. PAX payment was integrated into **all** confirmed screens — not only the primary screen <!-- REC-01 -->
3. A `startCharge(BigDecimal amount, String subject)` method exists in each target class
4. Each method guards with `isMposUiReady()` before building `TransactionParameters`
5. `TransactionParameters` is built with `.charge(amount, Currency.<CODE>)` and `.subject(subject)` using `io.mpos.transactions.Currency`
6. The activity is started with `createTransactionIntent(params)` and `MposUi.REQUEST_CODE_PAYMENT`
7. `onActivityResult` handles both `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED`
8. `super.onActivityResult()` is called first in `onActivityResult`
9. `getLatestTransaction()` is used (not an Intent extra) to retrieve the `Transaction` object
10. Project builds without compilation errors (`./gradlew assembleDebug`)
11. `onChargeApproved` shows user-visible feedback — an empty body is not acceptable
12. `onChargeFailed` shows user-visible feedback — an empty body is not acceptable
13. The initialization guard in `startCharge()` shows a user-visible error and returns gracefully
14. `grep -n "startCharge(" <each-modified-activity>` returns at least one match per screen <!-- REC-02 -->
15. No original Toast/booking handler remains in any click listener that calls `startCharge()` <!-- REC-02 -->

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 3 of the PAX SDK integration: charge transaction.

Working directory: <project root>

## Transaction parameters (from Step 0 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
TRANSACTION_AMOUNT=<TRANSACTION_AMOUNT>

Use `io.mpos.transactions.Currency.<TRANSACTION_CURRENCY>` for the currency parameter.
Use `BigDecimal("<TRANSACTION_AMOUNT>")` as the amount when the app has no dynamic price
source. If `project-plan.md` specifies a `payment_amount_source` expression (e.g.,
`item.getPrice()`), use that expression instead of the fixed amount.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — contains project context, `payment_entry_points`, and GATE 3 implementation notes
2. `references/pax-aio/activities/act_03_implement-charge-transaction.md` — the activity definition (full implementation guidance)

## Your task

Implement the charge transaction using the activity file as your primary implementation guide.
Use `project-plan.md` for project-specific metadata (target screens, amount source, currency, UI element type).
Integrate ALL screens listed in `payment_entry_points` — do not prompt the developer for these.

Critical constraints:
- Import `io.mpos.transactions.Currency` — NOT `java.util.Currency`
- `transaction.subject` must NOT contain `$`, `€`, `£`, or other currency symbols
- `onChargeApproved` and `onChargeFailed` must have user-visible feedback (Toast or Snackbar) —
  empty stubs are not acceptable
- The `isMposUiReady()` guard must show feedback and return — it must NOT throw an exception

## Mandatory verification

Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

Verify no java.util.Currency import slipped in:
```bash
grep -rn "java.util.Currency" app/src --include="*.kt" --include="*.java" \
  && echo "FAIL: wrong Currency import" || echo "OK"
```

<!-- REC-02 -->
**Mandatory click-listener verification (non-skippable — applies to ALL flavors):**

For each modified Activity, run the following two checks. Both must pass before reporting PASS.

**Check A — `startCharge(` IS present in the file:**
```bash
grep -n "startCharge(" app/src/main/java/<path-to-activity>
```
If zero matches: FAIL — `startCharge` was not wired.

**Check B — no original handler (Toast/booking logic) coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```
Review the output: if `Toast.makeText` appears inside a `setOnClickListener` block that was
supposed to be replaced by `startCharge()`, that is a HARD FAIL. The original handler must be
removed entirely — it must not remain in any click listener that now also calls `startCharge()`.

If either check fails, fix the wiring and re-run before reporting PASS.

<!-- REC-01 -->
**Multi-screen check:** For each screen listed in `payment_entry_points` in `project-plan.md`,
confirm Check A and Check B pass. Answer: "Are there screens with payment UI that were NOT
integrated in this gate?" If yes, add them and repeat the checks.

## Required report

```
GATE 3 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED
Build time: Xs
Target Activity: <class name(s) — list all integrated screens>
UI element: <type>
Currency: <currency>
io.mpos.transactions.Currency used: YES | NO
onChargeApproved has visible feedback: YES | NO
onChargeFailed has visible feedback: YES | NO
Guard returns gracefully (no throw): YES | NO
startCharge( present in all modified activities: YES | NO
Original Toast handler removed from all wired buttons: YES | NO
All payment_entry_points integrated: YES | NO (list any missed)
Files modified: <list>
Acceptance criteria met: <list>
```
```
