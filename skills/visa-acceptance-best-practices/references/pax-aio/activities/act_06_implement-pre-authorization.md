# Activity 7: Implement Pre-Authorization Transaction

Guide the developer through implementing a pre-authorization transaction using the PAX All-in-One SDK Default UI so their app can place temporary holds on card funds — essential for hospitality, car rental, and restaurant verticals where the final amount is unknown at card presentation.

**Reference:** [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Pre-Authorization, Incremental Authorization sections), [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (MposUi)

## Critical Rules (NEVER violate these)

1. **NEVER omit `autoCapture(false)`.** Without this flag, the transaction becomes a full sale (charge) instead of a pre-authorization. This is the only difference between a sale and a pre-auth.
2. **NEVER discard `transactionIdentifier` after pre-auth.** The transaction identifier returned on approval is required for all subsequent operations: capture, incremental authorization, tip adjustment, and refund. It must be persisted (SharedPreferences, member variable, or passed to the next screen).
3. **NEVER use `java.util.Currency`.** The PAX SDK uses its own `io.mpos.transactions.Currency` enum. Using `java.util.Currency` will cause a compilation error.
4. **NEVER start a transaction without an initialization guard.** Always call `PaymentApplication.isMposUiReady()` (or equivalent) before `createTransactionIntent()`. Calling it on an uninitialized instance will crash.
5. **NEVER hardcode amounts in the transaction parameters.** Accept the amount as a parameter to the payment method. Hardcoded amounts are unreviewable and untestable.
6. **NEVER skip calling `super.onActivityResult()`** before handling the request code. Omitting it breaks back-stack and fragment result propagation.
7. **NEVER check `resultCode == Activity.RESULT_OK`.** The SDK uses its own constants: `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED`. Using `RESULT_OK` misses declined transactions that still return a transaction object.
8. **NEVER include currency symbols or special characters in `transaction.subject`.** The backend `@SecureText` validator rejects values containing `$`, `€`, `£`, or other symbols — the transaction fails with HTTP 400 `TRANSACTION_ERROR_INVALID_TRANSACTION_REQUEST`. Use only alphanumeric characters, spaces, and standard punctuation.

## Prerequisites

Before starting this activity, the developer must have completed:

- **Activity 2** — SDK dependencies configured
- **Activity 1** — `MposUi` initialized; a `PaymentApplication` class must exist with `getMposUi()` and `isMposUiReady()`
- **Activity 4** (recommended) — if charge transaction is already implemented, reuse the same `onActivityResult` pattern and extend it

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
grep -rni "TODO.*pay\|TODO.*charge\|TODO.*purchase\|TODO.*pre.auth\|TODO.*preauth\|TODO.*checkout\|TODO.*hold" \
  app/src/main/java/ --include="*.kt" --include="*.java"
grep -rni "price\|amount\|total\|btn_pay\|btn_pre_auth\|btn_preauth\|btn_hold\|btnPreAuth" \
  app/src/main/res/layout/ --include="*.xml"
```

Compile the results into a list of candidate screens, then use `AskUserQuestion` to confirm:

**Question A — which screens:**
```
I found the following screens that appear to handle payments or display prices:

  <list each candidate class name and the evidence found>

Which of these should have pre-authorization integrated? (Select ALL that apply — do not skip any.)
```

**Do NOT ask about one screen and stop.** Integration must cover all confirmed screens.

For each confirmed screen, ask:

**Question B — what UI element (per screen):**
```
How should pre-authorization be triggered on <ScreenName>?

Options:
  - A toggle/radio above the existing pay button that switches between Sale and Pre-Auth modes (Recommended — avoids button overlap)
  - Replace the existing charge button with a pre-auth button
  - Separate "Pre-Auth" button alongside the existing charge button (⚠️ may cause overlap on small screens — requires careful layout management)
  - Other (describe)
```

**Question C — amount source (per screen, if not already determined from charge integration):**
```
What amount should be pre-authorized on <ScreenName>?

Options:
  - Same source as the existing charge amount (item price, user-entered, etc.)
  - Fixed amount (type the value, e.g. 200.00)
  - User-entered at runtime
```

After collecting answers, also determine:
- Is the project **Java** or **Kotlin**? (Check CLAUDE.md or existing source files.)
- Does the Activity already have an `onActivityResult` from charge integration? If so, extend it.

**Proceed to Step 2 only after all screens and their UI elements are confirmed.**

### Step 2: Ask for the Currency

Use `AskUserQuestion` to ask the developer which currency to use. The SDK requires `io.mpos.transactions.Currency` — an enum, not `java.util.Currency`.

If the currency was already established in Activity 4 (charge), reuse it:
```
Should pre-authorization use the same currency as charge transactions (<CURRENCY_CODE>)?
Options: Yes, use <CURRENCY_CODE> / No, use a different currency (type the ISO-4217 code)
```

### Step 3: Add the `startPreAuth` Method

In the target Activity or Fragment, add a method that:

1. Guards with `isMposUiReady()`
2. Builds `TransactionParameters` with `.charge(amount, currency).autoCapture(false)`
3. Calls `createTransactionIntent()` and starts the activity

**Java:**
```java
import android.content.Intent;
import io.mpos.paybutton.MposUi;
import io.mpos.transactions.Currency;
import io.mpos.transactions.parameters.TransactionParameters;
import java.math.BigDecimal;

private String preAuthTransactionIdentifier; // MUST persist for later capture

private void startPreAuth(BigDecimal amount, String subject) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .charge(amount, Currency.<CURRENCY_CODE>)
            .subject(subject)
            .autoCapture(false)   // Makes it a pre-auth
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

private var preAuthTransactionIdentifier: String? = null // MUST persist for later capture

private fun startPreAuth(amount: BigDecimal, subject: String) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }

    val params = TransactionParameters.Builder()
        .charge(amount, Currency.<CURRENCY_CODE>)
        .subject(subject)
        .autoCapture(false)   // Makes it a pre-auth
        .build()

    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

Replace `<CURRENCY_CODE>` with the value from Step 2 (e.g., `Currency.USD`).

### Step 4: Add `onActivityResult` to Handle the Outcome

Add (or extend existing) `onActivityResult` in the same Activity. On approval, **persist `transactionIdentifier`** — it is required for capture.

**Java:**
```java
import io.mpos.transactions.Transaction;

@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        Transaction transaction = PaymentApplication.getMposUi().getLatestTransaction();

        if (resultCode == MposUi.RESULT_CODE_APPROVED) {
            if (transaction != null && !transaction.isCaptured()) {
                // Pre-auth approved — MUST persist identifier
                preAuthTransactionIdentifier = transaction.getIdentifier();
                onPreAuthApproved(transaction);
            }
        } else if (resultCode == MposUi.RESULT_CODE_FAILED) {
            onPreAuthFailed(transaction);
        }
    }
}

private void onPreAuthApproved(Transaction transaction) {
    Toast.makeText(this, "Pre-authorization approved", Toast.LENGTH_SHORT).show();
    // transaction.getIdentifier()      → use for capture, tip adjust, refund
    // transaction.getAmount()           → authorized amount
    // transaction.getCardDetails()      → masked PAN, scheme
    // TODO: enable capture button, navigate to next screen, or store identifier
}

private void onPreAuthFailed(Transaction transaction) {
    String message = (transaction != null) ? "Pre-authorization declined" : "Pre-authorization failed";
    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
}
```

**Kotlin:**
```kotlin
import io.mpos.transactions.Transaction

override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    if (requestCode == MposUi.REQUEST_CODE_PAYMENT) {
        val transaction = PaymentApplication.mposUi.getLatestTransaction()

        when (resultCode) {
            MposUi.RESULT_CODE_APPROVED -> {
                if (transaction != null && !transaction.isCaptured) {
                    // Pre-auth approved — MUST persist identifier
                    preAuthTransactionIdentifier = transaction.identifier
                    onPreAuthApproved(transaction)
                }
            }
            MposUi.RESULT_CODE_FAILED -> onPreAuthFailed(transaction)
        }
    }
}

private fun onPreAuthApproved(transaction: Transaction?) {
    Toast.makeText(this, "Pre-authorization approved", Toast.LENGTH_SHORT).show()
    // transaction?.identifier          → use for capture, tip adjust, refund
    // transaction?.amount              → authorized amount
    // transaction?.cardDetails         → masked PAN, scheme
    // TODO: enable capture button, navigate to next screen, or store identifier
}

private fun onPreAuthFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Pre-authorization declined" else "Pre-authorization failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
```

**If `onActivityResult` already exists** (from charge integration in Activity 4): extend the existing handler to distinguish pre-auth from charge results using `transaction.isCaptured()`. Pre-auth results have `isCaptured() == false`.

### Step 5: Wire to the UI Element

Connect the UI element to `startPreAuth()` based on the UI approach chosen in Question B.

#### Option A — Transaction Mode Selector (Recommended)

Add a `RadioGroup` (or `Switch`) **above** the existing pay button in the layout XML so the user
can choose between Sale and Pre-Auth before tapping pay. This avoids adding a separate button
that may overlap existing UI elements.

**Layout XML — add ABOVE the existing pay button:**
```xml
<RadioGroup
    android:id="@+id/radio_transaction_mode"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center"
    android:paddingBottom="8dp">

    <RadioButton
        android:id="@+id/radio_sale"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Sale"
        android:checked="true" />

    <RadioButton
        android:id="@+id/radio_pre_auth"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Pre-Auth" />
</RadioGroup>
```

**CRITICAL layout rule:** The `RadioGroup` MUST be placed as a **sibling above** the existing pay
button, NOT on top of it. If the parent is a `LinearLayout` (vertical), insert the `RadioGroup`
immediately before the pay button element. If the parent is a `ConstraintLayout`, constrain the
`RadioGroup` bottom to the pay button top: `app:layout_constraintBottom_toTopOf="@id/btn_pay"`.

Then **modify the existing pay button's click listener** to check the mode:

**Java:**
```java
RadioGroup radioMode = findViewById(R.id.radio_transaction_mode);

Button btnPay = findViewById(R.id.<existing_pay_button_id>);
btnPay.setOnClickListener(v -> {
    if (radioMode.getCheckedRadioButtonId() == R.id.radio_pre_auth) {
        startPreAuth(amount, "Pre-auth hold");
    } else {
        startCharge(amount, "Sale");
    }
});
```

**Kotlin:**
```kotlin
val radioMode = findViewById<RadioGroup>(R.id.radio_transaction_mode)

val btnPay = findViewById<Button>(R.id.<existing_pay_button_id>)
btnPay.setOnClickListener {
    if (radioMode.checkedRadioButtonId == R.id.radio_pre_auth) {
        startPreAuth(amount, "Pre-auth hold")
    } else {
        startCharge(amount, "Sale")
    }
}
```

Replace `<existing_pay_button_id>` with the actual button ID from the layout (e.g., `btn_pay`, `btnBook`).

**IMPORTANT:** The existing `startCharge()` call in the pay button's click listener must be
**replaced** by the mode-checking if/else — do NOT leave the original `startCharge()` call
alongside the new code. There must be exactly ONE click listener on the pay button.

#### Option B — Separate Pre-Auth Button

**Only use if the developer explicitly chose this in Question B.** You MUST provide layout
constraints so the button does not overlap existing elements.

Add the button **below** the existing pay button with explicit positioning:

```xml
<!-- Place AFTER the existing pay button in the layout XML -->
<Button
    android:id="@+id/btn_pre_auth"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="Pre-Authorize" />
```

If the parent is a `ConstraintLayout`, also add:
```xml
app:layout_constraintTop_toBottomOf="@id/<existing_pay_button_id>"
```

Wire the button:

**Java:**
```java
Button btnPreAuth = findViewById(R.id.btn_pre_auth);
btnPreAuth.setOnClickListener(v -> startPreAuth(amount, "Pre-auth hold"));
```

**Kotlin:**
```kotlin
val btnPreAuth = findViewById<Button>(R.id.btn_pre_auth)
btnPreAuth.setOnClickListener { startPreAuth(amount, "Pre-auth hold") }
```

### Step 5b: Verify Click-Listener Wiring (Mandatory — Non-Skippable) <!-- REC-02 -->

After wiring `startPreAuth()` on every screen, run these checks for each modified Activity.
All checks must pass before proceeding to Step 6.

**Check A — `startPreAuth(` IS present in the file:**
```bash
grep -n "startPreAuth(" app/src/main/java/<path-to-activity>
```
Zero matches = FAIL. Fix the wiring before continuing.

**Check B — no original Toast/booking handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```
Review the output carefully. If `Toast.makeText` appears inside a `setOnClickListener` block that
was supposed to be replaced by `startPreAuth()`, that is a **HARD FAIL**. The original handler must
be removed entirely — it must NOT remain in any click listener that now calls `startPreAuth()`.

**Check C — mode selector: no duplicate click listeners on the pay button (if using RadioGroup):**
```bash
grep -cn "setOnClickListener" app/src/main/java/<path-to-activity>
```
Count the listeners. The existing pay button must have **exactly one** `setOnClickListener` — the
mode-checking if/else that calls either `startCharge()` or `startPreAuth()`. If the old
`startCharge()`-only listener remains alongside a new listener, that is a **HARD FAIL**.

**Check D — layout: no overlapping buttons:**
```bash
grep -n "btn_pre_auth\|radio_transaction_mode\|radio_pre_auth" \
  app/src/main/res/layout/<layout-file>.xml
```
If using the mode selector (Option A): `radio_transaction_mode` must be present. `btn_pre_auth` must NOT be present.
If using a separate button (Option B): `btn_pre_auth` must have explicit layout positioning (`layout_marginTop`, `layout_constraintTop_toBottomOf`, or equivalent).

This check is binary and must produce a hard FAIL if the old handler remains or buttons overlap.
Do NOT report success and move on — fix the wiring, then re-run all checks.

### Step 6: Build and Verify

```bash
./gradlew assembleDebug
```

If the build fails:

1. **`Currency` import error** — ensure `import io.mpos.transactions.Currency;` is present, not `java.util.Currency`.
2. **`createTransactionIntent` not found** — verify the `MposUi` instance is from `PaymentApplication.getMposUi()`.
3. **`autoCapture` method not found** — verify the builder chain starts with `.charge()` before calling `.autoCapture()`.
4. **`startActivityForResult` deprecated warning** — this is expected on API 31+. The SDK's Default UI still requires `startActivityForResult` / `onActivityResult`. Use `@SuppressWarnings("deprecation")` if necessary.
5. **`PaymentApplication` not found** — complete Activity 1 first to create the Application class.

## Troubleshooting

See `references/pax-aio/troubleshooting.md#pre-authorization` for pre-auth errors (autoCapture missing, null identifier, cashback not allowed, Currency import).

## Acceptance Criteria

This activity is complete when all of the following are true:

1. ALL payment entry point screens were discovered (via grep) and confirmed with the user before any code was written <!-- REC-01 -->
2. Pre-authorization was integrated into **all** confirmed screens — not only the primary screen <!-- REC-01 -->
3. A `startPreAuth(BigDecimal amount, String subject)` method exists in each target class
4. Each method guards with `isMposUiReady()` before building `TransactionParameters`
5. `TransactionParameters` is built with `.charge(amount, Currency.<CODE>).autoCapture(false)` using `io.mpos.transactions.Currency`
6. `.autoCapture(false)` is present — the transaction is a pre-auth, not a sale
7. The activity is started with `createTransactionIntent(params)` and `MposUi.REQUEST_CODE_PAYMENT`
8. `onActivityResult` handles both `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED`
9. `super.onActivityResult()` is called first in `onActivityResult`
10. `transactionIdentifier` is persisted on approval (member variable, SharedPreferences, or passed to next screen)
11. `getLatestTransaction()` is used to retrieve the `Transaction` object
12. Project builds without compilation errors (`./gradlew assembleDebug`)
13. `onPreAuthApproved` shows user-visible feedback — an empty body is not acceptable
14. `onPreAuthFailed` shows user-visible feedback — an empty body is not acceptable
15. The initialization guard in `startPreAuth()` shows a user-visible error and returns gracefully
16. `grep -n "startPreAuth(" <each-modified-activity>` returns at least one match per screen <!-- REC-02 -->
17. No original Toast/booking handler remains in any click listener that calls `startPreAuth()` <!-- REC-02 -->
18. **No button overlap:** If using a mode selector (RadioGroup/Switch), the selector is positioned above the existing pay button with proper layout constraints. If using a separate button, it has explicit margin/constraint so it does not overlap other buttons. <!-- UI-FIX -->
19. **Single click listener per button:** The existing pay button has exactly one `setOnClickListener` — either the mode-checking if/else (mode selector approach) or the original charge-only listener (separate button approach). No duplicate listeners. <!-- UI-FIX -->
20. **Pre-auth is reachable:** The pre-auth trigger (radio button or separate button) is visible and tappable without scrolling past or being hidden behind other UI elements <!-- UI-FIX -->

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 6 of the PAX SDK integration: pre-authorization transaction.

Working directory: <project root>

## Transaction parameters (from Step 0 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
TRANSACTION_AMOUNT=<TRANSACTION_AMOUNT>

Use `io.mpos.transactions.Currency.<TRANSACTION_CURRENCY>` for the currency parameter.
Use `BigDecimal("<TRANSACTION_AMOUNT>")` as the amount when the app has no dynamic price
source. If `project-plan.md` specifies a `payment_amount_source` expression, use that instead.

## Inputs

Read these two files before writing any code:
1. `project-plan.md` (project root) — contains project context and payment entry points
2. `references/pax-aio/activities/act_06_implement-pre-authorization.md`

Also read for API reference:
3. Fetch [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (Pre-Authorization, Incremental Authorization sections)

## Your task

Implement pre-authorization transactions as specified in the activity file.
Follow the activity file for sequencing, critical rules, and acceptance criteria.

Critical constraints:
- `.autoCapture(false)` MUST be present — without it, the transaction is a sale, not a pre-auth
- Import `io.mpos.transactions.Currency` — NOT `java.util.Currency`
- `transactionIdentifier` MUST be persisted on approval — it is required for capture
- `transaction.subject` must NOT contain `$`, `€`, `£`, or other currency symbols
- `onPreAuthApproved` and `onPreAuthFailed` must have user-visible feedback
- The `isMposUiReady()` guard must show feedback and return — it must NOT throw an exception

UI integration constraints (CRITICAL — prevents button overlap):
- Do NOT add a separate pre-auth button by default. Use a **transaction mode selector**
  (RadioGroup with Sale/Pre-Auth options) placed above the existing pay button.
  The existing pay button's click listener must check the selected mode and call
  either `startCharge()` or `startPreAuth()` accordingly.
- If the developer explicitly requests a separate button, it MUST have explicit layout
  positioning (layout_marginTop or ConstraintLayout constraints) to prevent overlap.
- The capture button (added in Gate 7) must start with `android:visibility="gone"` and
  only be shown after a successful pre-auth via `View.VISIBLE` in `onPreAuthApproved`.

## Mandatory verification

Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

Verify no java.util.Currency import slipped in:
```bash
grep -rn "java.util.Currency" app/src --include="*.kt" --include="*.java" \
  && echo "FAIL: wrong Currency import" || echo "OK"
```

Verify autoCapture(false) is present:
```bash
grep -rn "autoCapture\s*(false)" app/src --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: autoCapture(false) missing"
```

<!-- REC-02 -->
**Mandatory click-listener verification (non-skippable):**

For each modified Activity, run:

**Check A — `startPreAuth(` IS present:**
```bash
grep -n "startPreAuth(" app/src/main/java/<path-to-activity>
```

**Check B — no original handler coexists on the same button:**
```bash
grep -n "Toast.makeText\|makeText" app/src/main/java/<path-to-activity>
```

**Check C — mode selector or explicit positioning (no button overlap):**
```bash
grep -n "radio_transaction_mode\|radio_pre_auth" app/src/main/res/layout/<layout>.xml
```

If any check fails, fix and re-run before reporting PASS.

## Required report

```
GATE 6 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED
Build time: Xs
Target Activity: <class name(s) — list all integrated screens>
UI pattern: mode-selector | separate-button
Currency: <currency>
io.mpos.transactions.Currency used: YES | NO
autoCapture(false) present: YES | NO
transactionIdentifier persisted on approval: YES | NO
onPreAuthApproved has visible feedback: YES | NO
onPreAuthFailed has visible feedback: YES | NO
Guard returns gracefully (no throw): YES | NO
startPreAuth( present in all modified activities: YES | NO
Original Toast handler removed from all wired buttons: YES | NO
No button overlap (layout verified): YES | NO
Pre-auth trigger is reachable in UI: YES | NO
Files modified: <list>
Acceptance criteria met: <list>
```
```
