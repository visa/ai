# Activity TTP-8: Implement Pre-Authorization, Incremental Authorization, and Capture

Implement the deferred-settlement flow: place a temporary hold on a card by tapping it
(**pre-authorization**), optionally raise that hold later without a second tap
(**incremental authorization**), and finally take the money (**capture**). This is the flow
hospitality, car rental and restaurant apps need, where the final amount is unknown when the card
is presented. Write code directly to project files; do not just print code examples in the chat.

**Reference:** [Tap to Pay on Android Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-payment-txn-intro.md) (Pre-Authorization, Incremental Authorization, Capture, Check Transaction Status sections), [Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) (`UiConfiguration` / `SummaryFeature`), `references/ttp/troubleshooting.md#ttp-pre-auth`, `references/ttp/troubleshooting.md#ttp-incremental-auth`, `references/ttp/constants/ttp-sdk-requirements.md`

## Critical Rules (NEVER violate these)

1. **`.autoCapture(false)` is the only thing separating a pre-authorization from a sale.** Omit it and the funds are captured immediately — the shopper is charged, and there is nothing left to capture. Nothing about the code will look wrong.
2. **NEVER discard the `transactionIdentifier` returned on pre-auth approval.** Capture, incremental authorization and refund all require it. Persist it — a member field survives a screen, `SharedPreferences` survives process death, and a pre-auth hold outlives both.
2b. **Decide what happens when a hold already exists — before writing `startPreAuth`.** The worked
    example persists **one** pre-authorization. With single-slot persistence, approving a second hold
    overwrites the first one's identifier, and that is a silent money problem: the first authorization is
    still on the shopper's card, but the app has lost the only handle it had for capturing, increasing or
    releasing it. It then expires days later as an abandoned hold. This directly contradicts Rule 2.

    Pick one and state it in the gate report:

    | Model | Implementation |
    |-------|----------------|
    | **One active hold** (default — correct wherever the app serves one customer at a time) | `startPreAuth` **refuses** while an uncaptured hold is persisted, and tells the user to capture or release it first |
    | **Concurrent holds** (tabs, rooms, orders — any app tracking several open bills at once) | persist a **collection keyed by transaction identifier**, each associated with its order, and never a single slot |

    Ask the developer which model their app needs; do not assume the single-slot default is acceptable
    just because it is simpler. Choosing wrong is silent — a second approval overwrites the first hold and
    the money stays held with nothing left to capture it. See Critical Rule 2b.

    ```kotlin
    fun startPreAuth(amount: BigDecimal, identifier: String) {
        val existing = transactionStore.preAuthorization
        if (existing != null && !existing.captured) {
            showMessage("A hold of ${existing.authorizedAmount} is still open. " +
                        "Capture or release it before starting another.")
            return                       // NOT a fall-through that overwrites it
        }
        // …build and launch
    }
    ```

    Whether the gateway can recover an orphaned hold, and how expiry is reported, is **not established**
    by this skill — which is exactly why losing the identifier must be prevented rather than recovered from.

3. **NEVER capture more than the authorized amount**, as raised by any incremental authorizations. The gateway rejects it with `CAPTURE_AMOUNT_EXCEEDS`.
4. **NEVER capture an already-captured transaction** → `TRANSACTION_ALREADY_CAPTURED`. Validate before building the parameters, and hide the capture affordance once capture succeeds.
5. **Incremental authorization requires an approved, uncaptured pre-authorization.** It cannot raise a sale (`autoCapture(true)`) and it cannot raise a captured transaction. The additional amount is passed as the **second argument** of the three-argument
   `.incrementalAuthorization(identifier, additionalAmount, currency)` — **not** via a chained
   `.amountAndCurrency(...)`, which does not exist on `IncrementalAuthorizationBuilder`. See Step 6.
6. **The incremental amount is the ADDITIONAL amount, not the new total.** An incremental authorization does not replace the original authorization; it is issued *in addition* to the previously authorized amount. Passing the intended new total therefore over-authorizes by the original amount. See *Step 6* for how to confirm this on the developer's own account before going live.
7. **Pre-authorization holds expire in roughly 5–7 days**, issuer-determined. An expired hold cannot be captured — a new pre-authorization is required. Do not build a flow that assumes an indefinite hold.
8. **Not every card scheme supports incremental authorization.** American Express does not. Treat an issuer-declined increment as "the original hold is still valid", never as a failed pre-authorization.
9. **ADD to the existing `summaryFeatures` set — never rebuild it.** `CAPTURE_TRANSACTION` always; `INCREMENT_TRANSACTION` **only when `INCREMENTAL_AUTH_REQUESTED = yes`** (see *Step 1*). `REFUND_TRANSACTION` was added in `act_TTP_05` and confirmed in `act_TTP_06`; it must still be there after this activity. Replacing the set silently removes the refund button.
10. **Guards, in order:** `isMposUiReady()` then `isDeviceEnrolled()`. Both show visible feedback and `return`. And `io.mpos.transactions.Currency` — never `java.util.Currency`, and never `com.visa.utils.Currency`. **Neither guard covers `.customIdentifier(...)`:** it accepts `^[a-zA-Z0-9_-]{0,256}$` only and *throws* from inside the builder, so an identifier with a space crashes the app before any guard or result callback is reached. Use `"Pizza_order_pre-auth"`, and validate non-literal identifiers with `isValidTtpCustomIdentifier()` — `act_TTP_05` Critical Rule 10 and Step 1b.
11. **Exactly one action handler per control.** By this activity the pay control may branch between sale and pre-auth; a leftover charge-only handler alongside the new one means the mode selector is ignored. `views` → exactly one `setOnClickListener` on the pay button. `compose` → exactly one `onClick` lambda that branches internally.

    **This activity's worked samples are Views/XML. Every one of them has a Compose equivalent, and on a
    Compose project the Views form is not merely unidiomatic — it does not apply at all:** there is no
    `res/layout` to edit, no `findViewById`, and Gate 5 deliberately chose the Activity Result API over
    `onActivityResult`. Read `UI_TOOLKIT` from `project-plan.md` **before** Step 3 and follow the matching
    branch throughout — including the acceptance criteria and the verification commands, which are also
    branched. Applying the Views samples to a Compose project regresses Gates 5–7.
12. **NEVER hardcode `app/`, `src/main/java/`, or `res/layout/`.** Use `$ANDROID_MODULE_DIR` and `$SOURCE_ROOT` from `project-plan.md`, and branch on `$UI_TOOLKIT` — a Compose project has no layout XML and no `findViewById`. A grep against a path that does not exist returns zero matches with exit status 1, which is indistinguishable from "checked and clean": that is how a verification step passes on a project it never read. Confirm each path exists before believing a zero-match result.
13. **On Compose, `rememberSaveable` may hold ONLY Bundle-safe values — enums and scale-2 amount strings. Never a `Transaction`.** This gate's actions read `status` and `isCaptured` off the selected transaction, so it is exposed to the same defect as refund: a detail screen holding `rememberSaveable { mutableStateOf<Transaction?>(null) }` compiles and then throws `IllegalStateException: MutableState(value=io.mpos.transactions.Transaction@…) cannot be saved using the current SaveableStateRegistry` when the SDK's payment Activity stops the host Activity — so **capture and increment crash on the way in**, before any hold is touched. The state belongs to `act_TTP_04` (its Critical Rule 11): hold `selectedTransactionId: String?` and resolve the record. The discriminator enum and `pendingAmount` string stay `rememberSaveable` — they are Bundle-safe and dropping them reintroduces the misattribution bug. Constants file § *CRITICAL — `rememberSaveable` holds Bundle-safe values ONLY*.

## Prerequisites

Before starting this activity, the developer must have completed:

- `act_TTP_05` — `PaymentApplication`, `startCharge()`, and identifier persistence
- `act_TTP_06` — the `summaryFeatures` set and the extended `onActivityResult` with its operation
  discriminator (this activity extends both)

Reuse the currency established in `act_TTP_05` Step 3; only ask if none was established.

## Workflow

Follow these steps in order. **All code changes must be written directly to project files using
the Edit or Write tools.**

### Step 1: Add the capture summary features to `UiConfiguration`

Find the `UiConfiguration` wherever `act_TTP_03` put it when it built the holder — `PaymentApplication`, the project's
existing `Application` subclass, or the DI provider — and **add** to the existing `summaryFeatures`
set. Every entry already there must survive.

**`INCREMENT_TRANSACTION` is conditional on `INCREMENTAL_AUTH_REQUESTED`.** `CAPTURE_TRANSACTION` is
not — capture is what this gate exists for.

```kotlin
configuration = UiConfiguration(
    summaryFeatures = setOf(
        SummaryFeature.REFUND_TRANSACTION,     // from act_TTP_05 — MUST survive
        SummaryFeature.CAPTURE_TRANSACTION,    // added here, always
        SummaryFeature.INCREMENT_TRANSACTION   // added here ONLY when
                                               // INCREMENTAL_AUTH_REQUESTED = yes
    )
)
```

> **Why the increment feature is not unconditional.** Enabling it puts an *Increase Hold* button on
> the summary screen, and a tester who presses it exercises the delta-vs-new-total arithmetic of
> Critical Rule 6 — the one piece of this gate whose behaviour Step 6 says must be confirmed against
> the developer's own merchant account before it is trusted. When the developer declined incremental
> authorization, that confirmation never happened, so the button offers a path this integration has
> no evidence for. Omitting it is the safe default; record it under *Decisions taken without asking*
> in the gate report (`workflow.md` § *Always-fires decisions*) rather than dropping it silently.

This alone is the **recommended low-code path**: with these features enabled, the summary screen
shown after an approved pre-authorization carries capture and increment buttons for uncaptured
transactions, and the same screen is reachable later for any historic transaction:

```kotlin
val summaryIntent = PaymentApplication.mposUi.createTransactionSummaryIntent(
    transactionIdentifier = preAuthTransactionIdentifier!!
)
startActivityForResult(summaryIntent, MposUi.REQUEST_CODE_SHOW_SUMMARY)
```

That intent returns `MposUi.RESULT_CODE_SUMMARY_CLOSED` under
`MposUi.REQUEST_CODE_SHOW_SUMMARY` — a different request code from a transaction. Read the outcome
afterwards from `mposUi.latestTransaction?.status`.

### Step 2: Establish how capture is driven

Ask **`G7a`** from `$SKILL_DIR/references/ttp/constants/ttp-questions.md` § *Gate-local questions*,
verbatim. This is the one gate-local question with **no** Step 0 counterpart, so it is always asked —
`Q7a`–`Q7d` cover capture types, incremental authorization, the hold amount and the UI pattern, but
not who drives the capture. Store the answer as `PRE_AUTH_DRIVE_MODE`.

**SDK built-in**: implement Steps 3–5 (pre-auth and result handling), then skip to Step 9.
**Programmatic**: complete every step.

### Step 3: Identify the screens and choose the UI pattern <!-- UI-FIX -->

Pre-authorization competes for the same screen real estate as the existing pay button. Adding
another button naively causes real overlap bugs. Use `AskUserQuestion` per screen:

```
How should pre-authorization be triggered on <ScreenName>?

Options:
  - Sale / Pre-Auth selector above the existing pay button (Recommended) — no new button, no
    overlap risk; the existing pay button branches on the selected mode
  - Separate "Pre-Authorize" button alongside the existing pay button (⚠️ may overlap on small
    screens — requires explicit layout positioning)
```

#### Option A — mode selector (recommended)

Add a `RadioGroup` as a **sibling above** the existing pay button — never layered on top of it:

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

**CRITICAL layout rule:** in a vertical `LinearLayout`, insert the `RadioGroup` immediately before
the pay button element. In a `ConstraintLayout`, constrain it above the pay button:
`app:layout_constraintBottom_toTopOf="@id/btn_pay"`.

Then **replace** the pay control's existing handler with a mode-branching one.

##### `UI_TOOLKIT = compose`

There is no `RadioGroup` and no layout file. Hoist the mode into saveable state and branch inside the
single `onClick`:

```kotlin
enum class PaymentMode { SALE, PRE_AUTH }

// rememberSaveable so the selected mode survives rotation and process recreation.
var mode by rememberSaveable { mutableStateOf(PaymentMode.SALE) }

Column {
    // Any Compose selector works — SegmentedButton, RadioButton row, FilterChip row.
    Row {
        RadioButton(selected = mode == PaymentMode.SALE,     onClick = { mode = PaymentMode.SALE })
        Text("Sale")
        RadioButton(selected = mode == PaymentMode.PRE_AUTH, onClick = { mode = PaymentMode.PRE_AUTH })
        Text("Pre-authorization")
    }

    // ONE onClick that branches — not two buttons, and not a second onClick added alongside.
    Button(
        enabled = blockedReason == null,
        onClick = {
            when (mode) {
                PaymentMode.SALE     -> onCharge(amount, "Sale")
                PaymentMode.PRE_AUTH -> onPreAuth(amount, "Pre-auth hold")
            }
        }
    ) { Text(payButtonLabel(mode)) }
}
```

> On a screen that already carries dialogs, selectors and a cart, extract these additions into private
> composables rather than inlining them. Inlining can double a composable's cyclomatic complexity, and
> many Kotlin projects fail their quality gate on exactly that.

##### `UI_TOOLKIT = views`

**Kotlin:**
```kotlin
val radioMode = findViewById<RadioGroup>(R.id.radio_transaction_mode)
findViewById<Button>(R.id.btn_pay).setOnClickListener {
    if (radioMode.checkedRadioButtonId == R.id.radio_pre_auth) {
        startPreAuth(amount, "Pre-auth hold")
    } else {
        startCharge(amount, "Sale")
    }
}
```

**Java:**
```java
RadioGroup radioMode = findViewById(R.id.radio_transaction_mode);
findViewById(R.id.btn_pay).setOnClickListener(v -> {
    if (radioMode.getCheckedRadioButtonId() == R.id.radio_pre_auth) {
        startPreAuth(amount, "Pre-auth hold");
    } else {
        startCharge(amount, "Sale");
    }
});
```

**The original `startCharge()`-only listener must be removed, not left alongside this one.** There
must be exactly **one** `setOnClickListener` on the pay button.

#### Option B — separate button (only on explicit request)

```xml
<!-- Place AFTER the existing pay button -->
<Button
    android:id="@+id/btn_pre_auth"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="Pre-Authorize" />
```

In a `ConstraintLayout` also add
`app:layout_constraintTop_toBottomOf="@id/<existing_pay_button_id>"`. Explicit positioning is
mandatory — without it the button overlaps.

### Step 4: Add `startPreAuth(amount, identifier)`

Identical to `startCharge()` from `act_TTP_05` **plus `.autoCapture(false)`**. Replace
`<CURRENCY_CODE>` with the currency from `act_TTP_05` Step 3.

**Kotlin:**
```kotlin
private var preAuthTransactionIdentifier: String? = null   // MUST persist for capture / increment

private fun startPreAuth(amount: BigDecimal, identifier: String) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show()
        routeToEnrollment()
        return
    }

    val params = TransactionParameters.Builder()
        .charge(amount, Currency.<CURRENCY_CODE>)
        // MUST satisfy ^[a-zA-Z0-9_-]{0,256}$ — act_TTP_05 Critical Rule 10. This call THROWS otherwise.
        .customIdentifier(identifier)
        .autoCapture(false)               // THIS makes it a pre-auth, not a sale
        .build()

    pendingOperation = PaymentOperation.PRE_AUTH
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private String preAuthTransactionIdentifier;   // MUST persist for capture / increment

private void startPreAuth(BigDecimal amount, String identifier) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show();
        routeToEnrollment();
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .charge(amount, Currency.<CURRENCY_CODE>)
            .customIdentifier(identifier)
            .autoCapture(false)           // THIS makes it a pre-auth, not a sale
            .build();

    pendingOperation = PaymentOperation.PRE_AUTH;
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

If tipping was implemented in `act_TTP_07`, do **not** attach tipping parameters to a
pre-authorization — the tip belongs to the final amount, which is what capture decides.

### Step 5: Result handling — six operations, one handler

**Branch on `UI_TOOLKIT` first.** On a Compose project there is no `onActivityResult` to extend —
Gate 5 registered a launcher and Gate 6 extended its callback; this gate extends the same callback and
adds `PRE_AUTH`, `INCREMENTAL_AUTH` and `CAPTURE` to the operation enum. The canonical pattern,
including why the discriminator must be `rememberSaveable`, is in
`$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` § *Result handling*.

The sample below is the **`views`** branch.

By this point a single `onActivityResult` serves charge, refund, stand-alone credit,
pre-authorization, incremental authorization and capture — all returning under
`MposUi.REQUEST_CODE_PAYMENT`. **Extend** the handler from `act_TTP_06`; do not add a second one.

> **Why the operation discriminator carries the branch, not `isCaptured`.** A completed sale and a
> completed capture are both captured, so a captured/uncaptured test cannot tell them apart. The
> `PaymentOperation` enum introduced in `act_TTP_06` records what was actually started, which is
> unambiguous. Use the captured state for what it is good for: **validating that a pre-auth is
> still capturable before you try**. The accessor is **confirmed**:
> `io.mpos.transactions.Transaction.isCaptured(): Boolean` exists, so the `isCaptured` shape below is
> correct — see `references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names*. Re-confirm
> only if the project resolves an SDK version that file has not verified, and report the name used if
> it differs.

**Kotlin:**
```kotlin
private enum class PaymentOperation {
    CHARGE, REFUND, STANDALONE_CREDIT, PRE_AUTH, INCREMENTAL_AUTH, CAPTURE
}

private var pendingOperation: PaymentOperation = PaymentOperation.CHARGE

override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)   // ALWAYS first

    if (requestCode != MposUi.REQUEST_CODE_PAYMENT) return

    val transaction = PaymentApplication.mposUi.latestTransaction
    val identifier = data?.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)

    when (resultCode) {
        MposUi.RESULT_CODE_APPROVED -> when (pendingOperation) {
            PaymentOperation.CHARGE -> {
                lastTransactionIdentifier = identifier
                onChargeApproved(transaction)
            }
            PaymentOperation.REFUND,
            PaymentOperation.STANDALONE_CREDIT -> onRefundApproved(transaction, identifier)

            PaymentOperation.PRE_AUTH -> {
                preAuthTransactionIdentifier = identifier      // REQUIRED for capture / increment
                onPreAuthApproved(transaction)
            }
            PaymentOperation.INCREMENTAL_AUTH -> onIncrementApproved(transaction)
            PaymentOperation.CAPTURE -> onCaptureApproved(transaction)
        }

        MposUi.RESULT_CODE_FAILED -> when (pendingOperation) {
            PaymentOperation.CHARGE -> onChargeFailed(transaction)
            PaymentOperation.REFUND,
            PaymentOperation.STANDALONE_CREDIT -> onRefundFailed(transaction)
            PaymentOperation.PRE_AUTH -> onPreAuthFailed(transaction)
            // An issuer-declined increment leaves the ORIGINAL hold intact — do not clear it.
            PaymentOperation.INCREMENTAL_AUTH -> onIncrementFailed(transaction)
            PaymentOperation.CAPTURE -> onCaptureFailed(transaction)
        }
        // Any other result code = the shopper backed out before the tap.
    }
}

private fun onPreAuthApproved(transaction: Transaction?) {
    Toast.makeText(this, "Pre-authorization approved", Toast.LENGTH_SHORT).show()
    // NO capture/increment control on this screen. Both act on THIS pre-authorization, so they live
    // on its transaction detail page (act_TTP_04 Step 3's actions slot), reached from the
    // Transactions list. Nothing to show or hide here.
}

// CAPTURE AND INCREMENT ARE NOT POS-SCREEN CONTROLS.
// They target an existing pre-authorization, so they belong on that transaction's detail page —
// exactly like refund in act_TTP_06. Derive their ENABLED state from the transaction being shown:
//
//   @Composable
//   fun TransactionDetailActions(transaction: Transaction) {          // slot left empty by act_TTP_04
//       val holdOpen = transaction.status == TransactionStatus.APPROVED && !transaction.isCaptured
//       Button(onClick = { onCapture(transaction) },   enabled = holdOpen) { Text("Capture") }
//       Button(onClick = { onIncrement(transaction) }, enabled = holdOpen) { Text("Increase hold") }
//   }
//
// Reading the state off the displayed transaction — rather than a flag set in a result callback —
// is also what makes these correct after process death, with no persisted-visibility bookkeeping.

private fun onIncrementApproved(transaction: Transaction?) {
    Toast.makeText(this, "Authorization increased", Toast.LENGTH_SHORT).show()
    // The hold identifier does NOT change — keep preAuthTransactionIdentifier as it is.
    // Track the new authorized total so partial capture can be validated against it.
}

private fun onIncrementFailed(transaction: Transaction?) {
    // The original hold is still valid. This is NOT a failed pre-authorization.
    Toast.makeText(this, "Could not increase the hold. The original hold is still active.",
        Toast.LENGTH_LONG).show()
}

private fun onCaptureApproved(transaction: Transaction?) {
    Toast.makeText(this, "Payment captured", Toast.LENGTH_SHORT).show()
    preAuthTransactionIdentifier = null                          // nothing left to capture
    // No visibility bookkeeping: the detail page derives its actions from the transaction's own
    // isCaptured/status, so re-reading it after the capture is enough.
}

private fun onPreAuthFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Pre-authorization declined" else "Pre-authorization failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}

private fun onCaptureFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Capture declined" else "Capture failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    // Keep preAuthTransactionIdentifier — the hold may still be capturable.
}
```

**Java** — same structure with a `switch` on `pendingOperation`:
```java
private enum PaymentOperation {
    CHARGE, REFUND, STANDALONE_CREDIT, PRE_AUTH, INCREMENTAL_AUTH, CAPTURE
}

private PaymentOperation pendingOperation = PaymentOperation.CHARGE;

@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);   // ALWAYS first

    if (requestCode != MposUi.REQUEST_CODE_PAYMENT) {
        return;
    }

    Transaction transaction = PaymentApplication.getMposUi().getLatestTransaction();
    String identifier =
            data != null ? data.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER) : null;

    if (resultCode == MposUi.RESULT_CODE_APPROVED) {
        switch (pendingOperation) {
            case CHARGE:
                lastTransactionIdentifier = identifier;
                onChargeApproved(transaction);
                break;
            case REFUND:
            case STANDALONE_CREDIT:
                onRefundApproved(transaction, identifier);
                break;
            case PRE_AUTH:
                preAuthTransactionIdentifier = identifier;   // REQUIRED for capture / increment
                onPreAuthApproved(transaction);
                break;
            case INCREMENTAL_AUTH:
                onIncrementApproved(transaction);
                break;
            case CAPTURE:
                onCaptureApproved(transaction);
                break;
        }
    } else if (resultCode == MposUi.RESULT_CODE_FAILED) {
        switch (pendingOperation) {
            case CHARGE:            onChargeFailed(transaction);   break;
            case REFUND:
            case STANDALONE_CREDIT: onRefundFailed(transaction);   break;
            case PRE_AUTH:          onPreAuthFailed(transaction);  break;
            case INCREMENTAL_AUTH:  onIncrementFailed(transaction); break;
            case CAPTURE:           onCaptureFailed(transaction);  break;
        }
    }
}
```

### Step 6: Add `startIncrementalAuth(identifier, additionalAmount)`

Raises an existing hold without a second tap. Validate the preconditions before building — an
increment against a sale or a captured transaction cannot succeed.

**Kotlin:**
```kotlin
private fun startIncrementalAuth(transactionIdentifier: String?, additionalAmount: BigDecimal) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show()
        routeToEnrollment()
        return
    }
    if (transactionIdentifier.isNullOrEmpty()) {
        Toast.makeText(this, "No pre-authorization to increase.", Toast.LENGTH_SHORT).show()
        return
    }
    // Only an uncaptured pre-auth can be increased.
    if (PaymentApplication.mposUi.latestTransaction?.isCaptured == true) {
        Toast.makeText(this, "This transaction is already captured.", Toast.LENGTH_SHORT).show()
        return
    }

    // VERIFIED against SDK 2.115.0: incrementalAuthorization takes THREE arguments.
    // additionalAmount is the ADDITIONAL amount added to the existing hold — NOT the new total.
    // There is no .amountAndCurrency() on IncrementalAuthorizationBuilder; see the note below.
    val params = TransactionParameters.Builder()
        .incrementalAuthorization(transactionIdentifier, additionalAmount, Currency.<CURRENCY_CODE>)
        .build()

    pendingOperation = PaymentOperation.INCREMENTAL_AUTH
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private void startIncrementalAuth(String transactionIdentifier, BigDecimal additionalAmount) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show();
        routeToEnrollment();
        return;
    }
    if (transactionIdentifier == null || transactionIdentifier.isEmpty()) {
        Toast.makeText(this, "No pre-authorization to increase.", Toast.LENGTH_SHORT).show();
        return;
    }
    Transaction latest = PaymentApplication.getMposUi().getLatestTransaction();
    if (latest != null && latest.isCaptured()) {
        Toast.makeText(this, "This transaction is already captured.", Toast.LENGTH_SHORT).show();
        return;
    }

    // THREE arguments — verified against SDK 2.115.0. additionalAmount is the ADDITIONAL
    // amount, not the new total. IncrementalAuthorizationBuilder has no amountAndCurrency().
    TransactionParameters params = new TransactionParameters.Builder()
            .incrementalAuthorization(transactionIdentifier, additionalAmount, Currency.<CURRENCY_CODE>)
            .build();

    pendingOperation = PaymentOperation.INCREMENTAL_AUTH;
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

#### CRITICAL — the published sample for this call does not compile

The public Payment Services page shows a **one-argument** chain:

```kotlin
// FROM THE PUBLIC DOCUMENTATION — DOES NOT COMPILE against 2.115.0
TransactionParameters.Builder()
    .incrementalAuthorization("transactionIdentifier")
    .amountAndCurrency(BigDecimal("1.00"), Currency.EUR)
    .build()
```

The resolved artifact disagrees, and the artifact is authoritative:

```
public class TransactionParameters$Builder {
  public IncrementalAuthorizationBuilder incrementalAuthorization(String, BigDecimal, Currency);
}
public class IncrementalAuthorizationBuilder {
  public IncrementalAuthorizationBuilder workflow(TransactionWorkflowType);
  public TransactionParameters build();
}
```

There is **no** one-argument overload, and `IncrementalAuthorizationBuilder` exposes only
`workflow()` and `build()` — **no `amountAndCurrency()`**. Copying the documented chain produces two
compile errors, and the amount ends up in a different argument position rather than being lost.

`.amountAndCurrency(...)` *is* correct for **capture** (`CaptureBuilder`), which is why the two are
easy to conflate. The builder returned by each call has a different surface — see
`references/ttp/constants/ttp-sdk-requirements.md` § *Builder chains switch type mid-chain*.

**Re-verify when the SDK version changes.** These signatures were read from `2.115.0`. If
`SELECTED_SDK_VERSION` differs, confirm before writing code — the published sample is already stale
for 2.115.0, so it cannot be used to settle the question for any other version:

```bash
CP=$(find ~/.gradle/caches/modules-2/files-2.1/io.payworks -name '*.jar' | tr '\n' ':')
javap -cp "$CP" 'io.mpos.transactions.parameters.TransactionParameters$Builder' \
  | grep -i incremental
javap -cp "$CP" io.mpos.transactions.parameters.IncrementalAuthorizationBuilder
```

#### Delta vs. new total — the answer, and how to prove it on the developer's own account

**The amount is the additional (incremented) amount.** An incremental authorization does not
replace the original authorization; it is issued *in addition* to the previously authorized amount.
So a 100.00 hold plus a 20.00 increment is a 120.00 hold — passing `120.00` would produce a 220.00
hold.

The Payment Services page states the purpose ("used after an approved pre-authorization to increase
the authorized amount before capture") without restating this arithmetic, so **confirm it once in
TEST mode before relying on it in production**: pre-authorize a known amount, increment by a
different known amount, then read back the authorized total from the summary screen
(`createTransactionSummaryIntent(identifier)`, then `mposUi.latestTransaction?.status` and amount).
Record the observed total in `project-plan.md`. If it disagrees with the arithmetic above, stop and
flag it rather than shipping a guess.

Note also that not all schemes support this flow — **American Express does not**. An issuer decline
here leaves the original hold valid.

### Step 7: Add `startCapture(identifier)` and `startPartialCapture(identifier, amount)`

**Kotlin:**
```kotlin
private fun startCapture(transactionIdentifier: String?) {
    if (!captureGuardsPass(transactionIdentifier)) return

    val params = TransactionParameters.Builder()
        .capture(transactionIdentifier!!)
        .build()

    pendingOperation = PaymentOperation.CAPTURE
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}

private fun startPartialCapture(transactionIdentifier: String?, captureAmount: BigDecimal) {
    if (!captureGuardsPass(transactionIdentifier)) return
    // captureAmount MUST be <= the authorized amount, including any incremental authorizations.

    val params = TransactionParameters.Builder()
        .capture(transactionIdentifier!!)
        .amountAndCurrency(captureAmount, Currency.<CURRENCY_CODE>)
        .build()

    pendingOperation = PaymentOperation.CAPTURE
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}

private fun captureGuardsPass(transactionIdentifier: String?): Boolean {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return false
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show()
        routeToEnrollment()
        return false
    }
    if (transactionIdentifier.isNullOrEmpty()) {
        Toast.makeText(this, "No pre-authorization to capture.", Toast.LENGTH_SHORT).show()
        return false
    }
    if (PaymentApplication.mposUi.latestTransaction?.isCaptured == true) {
        Toast.makeText(this, "This transaction is already captured.", Toast.LENGTH_SHORT).show()
        return false
    }
    return true
}
```

**Java:**
```java
private void startCapture(String transactionIdentifier) {
    if (!captureGuardsPass(transactionIdentifier)) {
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .capture(transactionIdentifier)
            .build();

    pendingOperation = PaymentOperation.CAPTURE;
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}

private void startPartialCapture(String transactionIdentifier, BigDecimal captureAmount) {
    if (!captureGuardsPass(transactionIdentifier)) {
        return;
    }
    // captureAmount MUST be <= the authorized amount, including any incremental authorizations.

    TransactionParameters params = new TransactionParameters.Builder()
            .capture(transactionIdentifier)
            .amountAndCurrency(captureAmount, Currency.<CURRENCY_CODE>)
            .build();

    pendingOperation = PaymentOperation.CAPTURE;
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}

private boolean captureGuardsPass(String transactionIdentifier) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return false;
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show();
        routeToEnrollment();
        return false;
    }
    if (transactionIdentifier == null || transactionIdentifier.isEmpty()) {
        Toast.makeText(this, "No pre-authorization to capture.", Toast.LENGTH_SHORT).show();
        return false;
    }
    Transaction latest = PaymentApplication.getMposUi().getLatestTransaction();
    if (latest != null && latest.isCaptured()) {
        Toast.makeText(this, "This transaction is already captured.", Toast.LENGTH_SHORT).show();
        return false;
    }
    return true;
}
```

Capture takes no tap — the card is not present. Only the pre-authorization needed the NFC read.

### Step 8: UI triggers — on the transaction detail page <!-- UI-FIX -->

Capture and increment both act on an **existing pre-authorization**, so they belong where that
transaction is selected: `act_TTP_04` Step 3's transaction-detail actions slot, alongside refund from
`act_TTP_06`. There is no visibility bookkeeping, because the actions are derived from the transaction the
page is displaying.

> **Do not put capture or increment on the payment screen.** A capture control there has no target, so it
> can only act on "the pre-auth we happen to have stored" — which is wrong the moment a second hold is
> taken, and stale after the first is captured. The visibility-toggling pattern this step used to
> prescribe (`View.VISIBLE` in `onPreAuthApproved`, `View.GONE` in `onCaptureApproved`) existed only to
> paper over that: a control that derives its state from the displayed transaction needs no toggling and
> is correct after process death for free.
>
> **Sale vs Pre-Auth is different and stays on the payment screen** (Step 2). That choice has no target
> transaction — it decides what the *next* tap creates.

`UI_TOOLKIT = compose` — fill the slot `act_TTP_04` left empty:

```kotlin
@Composable
fun TransactionDetailActions(transaction: Transaction) {
    // An open hold: approved, not yet captured. Read from the transaction, never from a cached flag.
    val holdOpen = transaction.status == TransactionStatus.APPROVED && !transaction.isCaptured

    Button(onClick = { startCapture(transaction.identifier) }, enabled = holdOpen) {
        Text("Capture Payment")
    }
    if (INCREMENTAL_AUTH_REQUESTED) {                 // only when the developer asked for it
        Button(
            onClick = { startIncrementalAuth(transaction.identifier, additionalAmount) },
            enabled = holdOpen,
        ) { Text("Increase Hold") }
    }
    if (!holdOpen) {
        Text("No open hold on this transaction (status: ${transaction.status.name}).")
    }
}
```

`UI_TOOLKIT = views` — in the **transaction detail** layout, not the POS layout:

```xml
<!-- res/layout/<transaction_detail_layout>.xml — the screen act_TTP_04 Step 3 created.
     No android:visibility="gone": these are enabled/disabled from the displayed transaction. -->
<Button
    android:id="@+id/btn_increment"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="Increase Hold" />

<Button
    android:id="@+id/btn_capture"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="Capture Payment" />
```

```kotlin
val holdOpen = selectedTransaction.status == TransactionStatus.APPROVED
        && !selectedTransaction.isCaptured

findViewById<Button>(R.id.btn_increment).apply {
    isEnabled = holdOpen
    setOnClickListener { startIncrementalAuth(selectedTransaction.identifier, additionalAmount) }
}
findViewById<Button>(R.id.btn_capture).apply {
    isEnabled = holdOpen
    setOnClickListener { startCapture(selectedTransaction.identifier) }
}
```

> **`preAuthTransactionIdentifier` still has a job — a smaller one.** Persisting the active hold remains
> useful for the single-active-hold rule (Step 1) and for telling the developer a hold is outstanding. It
> is no longer what capture *acts on*: capture acts on the transaction the detail page is showing. Keeping
> both straight is what stops a second pre-auth from silently capturing the first.

> **A transaction detail page always exists by the time this gate runs.** Gate 4 is never `declined` and
> both of its menu entries always ship (`act_TTP_04` Critical Rule 9), so the actions slot is there —
> refund from `act_TTP_06` is usually already in it. The one variant: if Gate 4 was `skip` because the app
> already had an equivalent menu **and** a `transactionModule`-backed history, attach to the app's own
> detail surface and name it in the report. If Gate 4 was `skip` and no such surface can be found, the
> skip decision was wrong — **stop and tell the developer** so Gate 4 can be re-run. Never fall back to
> POS-screen buttons, and never build a history here.

### Step 8b: Verification checks (mandatory — non-skippable)

Run **all** of these. Any failure must be fixed and the checks re-run before Step 9.

> **§ *Mandatory verification* below carries the same checks plus the build.** Keep the two in sync —
> editing one copy only is how a check goes stale while still looking authoritative.

```bash
# The one flag that separates a pre-auth from a sale — must match
grep -rn "autoCapture\s*(false)" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: autoCapture(false) missing — this is a sale, not a pre-auth"

# All three entry points wired
grep -n "startPreAuth(\|startCapture(\|startIncrementalAuth(" "$SOURCE_ROOT/<path-to-screen>"

# The feature added by this gate unconditionally
grep -rn "CAPTURE_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: CAPTURE_TRANSACTION summary feature missing"

# INCREMENT_TRANSACTION is expected ONLY when INCREMENTAL_AUTH_REQUESTED=yes. Present on the
# 'no' path means the gate exposed an unverified flow; absent on the 'yes' path means the
# developer asked for increments and cannot reach them.
grep -rq "INCREMENT_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && FOUND=yes || FOUND=no
[ "$FOUND" = "$INCREMENTAL_AUTH_REQUESTED" ] \
  && echo "OK: INCREMENT_TRANSACTION present=$FOUND matches request" \
  || echo "FAIL: INCREMENT_TRANSACTION present=$FOUND but INCREMENTAL_AUTH_REQUESTED=$INCREMENTAL_AUTH_REQUESTED"

# REGRESSION GUARD — REFUND_TRANSACTION must STILL be present after this gate
grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: summaryFeatures was replaced — REFUND_TRANSACTION was dropped"

# Incremental authorization must use the THREE-argument call (identifier, amount, currency).
# Do NOT check for .amountAndCurrency() here — that method does not exist on
# IncrementalAuthorizationBuilder, so requiring it false-fails the only form that compiles.
grep -rn 'incrementalAuthorization(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -qE 'incrementalAuthorization\([^)]*,[^)]*,' \
  && echo "OK: three-argument incrementalAuthorization" \
  || echo "FAIL: incrementalAuthorization must be called as (identifier, additionalAmount, currency)"

# And the inverse: the stale documented chain must NOT be present.
grep -rn -A3 'incrementalAuthorization(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -q 'amountAndCurrency' \
  && echo "FAIL: .amountAndCurrency() after incrementalAuthorization() — does not compile on 2.115.0" \
  || echo "OK: no stale one-argument chain"

# Exactly one listener on the pay button (mode-selector pattern)
# One action handler on the pay control — branch on UI_TOOLKIT.
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -c 'setOnClickListener\|findViewById' "$SOURCE_ROOT/<path-to-screen>" | grep -qx 0 \
    && echo "OK: no Views handlers in a Compose screen" \
    || echo "FAIL: setOnClickListener/findViewById found in a Compose screen"
else
  grep -cn "setOnClickListener" "$SOURCE_ROOT/<path-to-screen>"
fi
# Expect one per distinct button. A second listener on the pay button = HARD FAIL.

# Capture and increment must start hidden
# Control gating — branch on UI_TOOLKIT. A Compose project has NO res/layout directory, so this
# grep returns zero matches with exit status 1: indistinguishable from "checked and clean".
if [ "$UI_TOOLKIT" = "compose" ]; then
  # The capture/increment controls must be gated on the PERSISTED hold, not on a session flag.
  grep -qE 'preAuthorization|storedPreAuth|hold' "$SOURCE_ROOT/<path-to-screen>" \
    && echo "OK: capture/increment controls derive from persisted pre-auth state" \
    || echo "FAIL: no persisted pre-auth state gating the capture/increment controls"
  grep -c 'android:visibility' "$SOURCE_ROOT/<path-to-screen>" | grep -qx 0 \
    && echo "OK: no Views visibility flags in a Compose screen" \
    || echo "FAIL: Views visibility handling found in a Compose screen"
else
  grep -n "btn_capture\|btn_increment" "$ANDROID_MODULE_DIR/src/main/res/layout/<transaction-detail-layout>.xml"
  # Both must be in the TRANSACTION DETAIL layout, not the POS layout.
fi

# Capture/increment must NOT be wired into a payment screen. Run over payment_entry_points.
for f in $PAYMENT_ENTRY_POINT_FILES; do
  [ -f "$f" ] || { echo "note: $f not found — check payment_entry_points"; continue; }
  grep -qE 'startCapture|startIncrementalAuth|btn_capture|btn_increment' "$f" \
    && echo "FAIL: $f is a payment screen and carries capture/increment wiring" \
    || echo "OK: $f (payment screen) has no capture/increment wiring"
done

# The enabled state must come from the DISPLAYED transaction, not a cached flag or visibility toggle.
grep -rnE 'isCaptured|TransactionStatus\.APPROVED' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  2>/dev/null | head \
  && echo "OK: capture/increment state derives from transaction fields" \
  || echo "FAIL: no transaction-derived hold state — do not gate these on a cached identifier"

# No button overlap — every button must have explicit positioning
grep -n "btn_pay\|btn_refund\|btn_capture\|btn_increment\|radio_transaction_mode" \
  "$ANDROID_MODULE_DIR/src/main/res/layout/<layout-file>.xml"

# Currency trap — SCOPED to files that actually build SDK transaction parameters.
# Scope this to the CALL SITE, not the file. java.util.Currency is legitimately used for display
# formatting, locale currency lists, and unrelated legacy code — and it can live in the SAME file as
# a correct TTP builder. Classifying a whole file by its presence fails correct integrations.
SDK_CALL='\.charge\(|\.refund\(|\.capture\(|\.incrementalAuthorization\(|\.tipAdjust\('
FAILED=0
for f in $(grep -rlE "$SDK_CALL" "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null); do
  # 1. A file that builds transaction parameters must resolve the SDK enum somehow.
  grep -qE 'import io\.mpos\.transactions\.Currency|io\.mpos\.transactions\.Currency\.' "$f" \
    || { echo "FAIL: $f builds transaction parameters but never resolves io.mpos.transactions.Currency"; FAILED=1; }
  # 2. The JDK type must not appear AT or immediately after an SDK builder call.
  grep -E -A2 "$SDK_CALL" "$f" | grep -q 'java\.util\.Currency' \
    && { echo "FAIL: $f passes java.util.Currency into an SDK transaction builder"; FAILED=1; }
done
[ "$FAILED" -eq 0 ] && echo "OK: every SDK builder call site resolves io.mpos.transactions.Currency"

# The second, undocumented decoy — never legitimate here
# Forbidden-token check: strip comments before judging. This skill recommends comments that NAME the
# forbidden type ("never java.util.Currency or com.visa.utils.Currency"), so an unfiltered grep flags a
# violation the guidance itself introduced — and the tempting "fix" is deleting a useful comment.
grep -rn 'com\.visa\.utils\.Currency' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -vE ':\s*(//|\*|/\*)' | grep -v '//.*com\.visa\.utils\.Currency' \
  | grep -q . \
  && echo "FAIL: com.visa.utils.Currency is used in code — not the SDK Currency type" \
  || echo "OK: no com.visa.utils.Currency outside comments"

# Exactly one onActivityResult per Activity
# Result site — branch on UI_TOOLKIT.
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -c 'onActivityResult\|startActivityForResult' "$SOURCE_ROOT/<path-to-screen>" | grep -qx 0 \
    && echo "OK: no deprecated result path" \
    || echo "FAIL: Compose screen must not use onActivityResult/startActivityForResult"
  grep -qE 'pendingOperation by rememberSaveable|SavedStateHandle' "$SOURCE_ROOT/<path-to-screen>" \
    && echo "OK: discriminator survives Activity recreation" \
    || echo "FAIL: operation discriminator uses plain remember — resets on recreation"
else
  grep -c "onActivityResult" "$SOURCE_ROOT/<path-to-screen>"
fi
```

### Step 9: Build and verify

**You MUST actually run the build with the Bash tool.** Read the output and fix any errors.

```bash
cd "$GRADLE_ROOT" || exit 1
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
  > /tmp/ttp-build.log 2>&1
BUILD_EXIT=$?
tail -30 /tmp/ttp-build.log
[ "$BUILD_EXIT" -eq 0 ] \
  && echo "BUILD OK (exit 0)" \
  || echo "BUILD FAILED (exit $BUILD_EXIT) — this gate is FAIL"
```

> `BUILD_EXIT` is the signal. Never pipe the build into `tail`/`grep` — that substitutes the
> filter's exit status for Gradle's, so a failed build reports success.

Do not consider this activity complete until the build passes.

## Troubleshooting

See `references/ttp/troubleshooting.md#ttp-pre-auth` for pre-authorization and capture failures
(transaction completed as a sale, null identifier, `AUTHORIZATION_EXPIRED`,
`TRANSACTION_ALREADY_CAPTURED`, `CAPTURE_AMOUNT_EXCEEDS`, `TRANSACTION_NOT_FOUND`, missing capture
button, disappeared refund button) and `references/ttp/troubleshooting.md#ttp-incremental-auth` for
incremental-authorization failures (missing `.amountAndCurrency()`, incrementing a sale or a
captured transaction, missing increment button, issuer decline, delta-vs-total confusion). Shared
setup failures are in `references/ttp/troubleshooting.md#tap-to-pay`.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. **Code was written to project files** with Edit or Write — not printed in the chat
2. **Only the project language was used** — Java or Kotlin, not both
3. `SummaryFeature.CAPTURE_TRANSACTION` is in the `summaryFeatures` set, and
   `SummaryFeature.INCREMENT_TRANSACTION` is present **if and only if**
   `INCREMENTAL_AUTH_REQUESTED = yes`. Present on the `no` path is a FAIL — it exposes the
   delta-vs-total flow of Critical Rule 6 with no TEST confirmation behind it
4. **`SummaryFeature.REFUND_TRANSACTION` is still present** — the set was extended, not replaced
5. A `startPreAuth(BigDecimal, String)` method exists with `.autoCapture(false)` in the builder chain
5b. **The hold-cardinality decision is implemented and reported** — either `startPreAuth` refuses while an
    uncaptured hold is persisted, or holds are persisted in a collection keyed by transaction identifier.
    A single persisted slot that a second approval can overwrite is a FAIL (Critical Rule 2b)
5c. **On Compose, the pending-operation discriminator and any operation-specific amount survive Activity
    recreation** (`rememberSaveable`, a ViewModel `SavedStateHandle`, or persisted state) — a plain
    `remember` is a FAIL. The host Activity can be recreated while the SDK Activity is in front, and the
    result then arrives with a null discriminator: an approved hold is filed as "unknown operation" and its
    identifier never persisted
6. `.autoCapture(false)` is present — the transaction is a pre-authorization, not a sale
7. `preAuthTransactionIdentifier` is persisted on pre-auth approval, read from `MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER`
8. `startIncrementalAuth(...)` uses the **three-argument** `.incrementalAuthorization(id, additionalAmount, currency)` — verified against SDK 2.115.0. It must NOT chain `.amountAndCurrency(...)`, which does not exist on `IncrementalAuthorizationBuilder` and will not compile
9. The incremental amount is documented and implemented as the **additional** amount, not the new total, and the delta-vs-total behaviour was confirmed in TEST mode (or explicitly flagged as unconfirmed)
10. `startIncrementalAuth(...)` validates that the identifier is non-empty and the transaction is uncaptured before building parameters
11. An issuer-declined increment is handled as "the original hold is still valid" — it does not clear `preAuthTransactionIdentifier` or report a failed pre-authorization
12. `startCapture(...)` uses `.capture(identifier)`; `startPartialCapture(...)` adds `.amountAndCurrency(amount, currency)`
13. A partial capture amount is constrained to ≤ the authorized amount including any increments
14. Capture validates the identifier and the uncaptured state before building parameters
15. Both guards are present in order — `isMposUiReady()` then `isDeviceEnrolled()` — each showing visible feedback and returning gracefully
16. `io.mpos.transactions.Currency` is used — never `java.util.Currency` or `com.visa.utils.Currency`, and the verification check is **scoped** so pre-existing unrelated `java.util.Currency` uses do not produce a false FAIL
16a. Every value reaching `.customIdentifier(...)` satisfies `^[a-zA-Z0-9_-]{0,256}$`; non-literal identifiers pass `isValidTtpCustomIdentifier()` before parameters are built. The pre-auth path is the one most likely to carry a descriptive literal (`"Pizza_order_pre-auth"`, never `"Pizza order pre-auth"`), and the builder throws rather than declining
17. Gate 5/6's **existing** result site was extended, matching `UI_TOOLKIT`:
    - `views` → exactly one `onActivityResult` per Activity, `super.onActivityResult()` first
    - `compose` → the single launcher callback extended with `PRE_AUTH`/`INCREMENTAL_AUTH`/`CAPTURE`,
      the discriminator held in `rememberSaveable`/`SavedStateHandle`, and **no** `onActivityResult`
      or `startActivityForResult` anywhere in the screen
18. Results are branched on the recorded operation, so a sale, a capture, an increment and a refund are never confused with one another
19. Every outcome handler shows user-visible feedback — no empty bodies
20. **The capture and increment controls are on the transaction detail page, not a payment screen.** They
    fill `act_TTP_04` Step 3's actions slot alongside refund, and each acts on the transaction that page
    is showing. **No file in `payment_entry_points` carries capture or increment wiring.** If Gate 4 was
    skipped, the app's own transaction detail surface was used and is named in the report <!-- UI-FIX -->
21. Their enabled state is derived from the **displayed transaction** (`status == APPROVED && !isCaptured`),
    not from a flag set in a result callback — which is also what keeps them correct after process death,
    with no persisted-visibility bookkeeping <!-- UI-FIX -->
22. **No button overlap** — every button and the mode selector have explicit positioning (`layout_marginTop` or ConstraintLayout constraints) relative to their neighbours <!-- UI-FIX -->
23. **Exactly one action handler on the pay control** — the mode-branching one replaced the charge-only one.
    `views` → one `setOnClickListener`; `compose` → one `onClick` that branches internally, and no
    `setOnClickListener`/`findViewById` anywhere in the screen <!-- UI-FIX -->
24. Pre-authorization is reachable in the UI without being hidden behind or overlapped by other elements <!-- UI-FIX -->
25. **Build was executed and passes** — `$GRADLE_MODULE_PATH:assembleDebug` was actually run with the Bash tool and succeeded
26. On a compatible enrolled physical device, a pre-authorization hold is approved by NFC tap and a subsequent capture completes

> **Device-dependent criteria:** AC 26 requires a compatible enrolled physical Android device and a
> real card. If no such device is available in this environment, implement AC 1–25 and mark AC 26
> `DEFERRED → TTP Gate 10 (manual device validation)`. Do **not** report PASS on AC 26 without a
> real pre-authorization followed by a real capture.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 8 of the Tap to Pay on Android integration: pre-authorization,
incremental authorization, and capture.

Working directory: <project root>

## Transaction parameters (from Step 0 / TTP GATE 5 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
PRE_AUTH_AMOUNT=<PRE_AUTH_AMOUNT>            (fixed FALLBACK amount only)
PRE_AUTH_AMOUNT_SOURCE=<PRE_AUTH_AMOUNT_SOURCE>  (expression from project-plan.md, or "" — PREFER THIS)
PAYMENT_AMOUNT_TYPE=<PAYMENT_AMOUNT_TYPE>    (Double | BigDecimal | minor units | String — convert per
                                              the constants file § Money; BigDecimal at scale 2)
CAPTURE_TYPES=<CAPTURE_TYPES>                    (set: one or more of full | partial)
INCREMENTAL_AUTH_REQUESTED=<INCREMENTAL_AUTH_REQUESTED>   (yes | no)
UI_PATTERN=<UI_PATTERN>                          (mode-selector | separate-button)
SKILL_DIR=<SKILL_DIR>                        (ABSOLUTE path to this skill. EVERY `references/...`
                                             path below is relative to it, NOT to the project.
                                             Read them as "$SKILL_DIR/references/ttp/...".)
GRADLE_ROOT=<GRADLE_ROOT>                    (ABSOLUTE — holds gradlew, settings.gradle, local.properties)
GRADLE_MODULE_PATH=<GRADLE_MODULE_PATH>      (Gradle task path, e.g. :app — may be empty for a root-level app)
GRADLE_ARGS=<GRADLE_ARGS>                    (extra args every build must carry, or empty)
BASELINE_QUALITY_TASK=<BASELINE_QUALITY_TASK>  (the KOTLIN tool: detekt | ktlintCheck | spotlessCheck | none — from Gate 0)
BASELINE_QUALITY_TASK_2=<BASELINE_QUALITY_TASK_2>  (the ANDROID tool: lintDebug | lint | none — from Gate 0)
BASELINE_QUALITY_FINDINGS_2=<BASELINE_QUALITY_FINDINGS_2>  (count + rule types at HEAD for that task)
BASELINE_QUALITY_FINDINGS=<BASELINE_QUALITY_FINDINGS>  (count + rule types measured at HEAD, before any change)
ANDROID_MODULE_DIR=<ANDROID_MODULE_DIR>      (the com.android.application module — NOT necessarily "app")
SOURCE_ROOT=<SOURCE_ROOT>                    (may be src/main/kotlin, not src/main/java)

(ANDROID_MODULE_DIR and SOURCE_ROOT are relative to GRADLE_ROOT. cd "$GRADLE_ROOT"
before running any command. Build with:
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" > /tmp/ttp-build.log 2>&1
then check $? — never pipe the build.)
UI_TOOLKIT=<UI_TOOLKIT>                      (views | compose | mixed)
PROJECT_LANGUAGE=<PROJECT_LANGUAGE>              (java | kotlin)
DEVICE_AVAILABLE=<DEVICE_AVAILABLE>              (yes | no)
MPOS_ACCESSOR=<mpos_accessor>                    (from project-plan.md, written by TTP GATE 3)

Reuse `Currency.<TRANSACTION_CURRENCY>` from TTP GATE 5 — do not re-prompt for a currency.

**Every `PaymentApplication.mposUi` in this file's samples means `MPOS_ACCESSOR`.** Gate 5 recorded
which of its three holder branches this project took; on the DI-owned branch there is no
`PaymentApplication` class and emitting that literal will not compile. Substitute, do not create.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context, payment entry points, TTP GATE 8 notes
2. `$SKILL_DIR/references/ttp/activities/act_TTP_08_implement-pre-auth-capture.md` — the activity definition
3. `$SKILL_DIR/references/ttp/activities/act_TTP_05_implement-charge.md` — PaymentApplication and startCharge
4. `$SKILL_DIR/references/ttp/activities/act_TTP_06_implement-refund.md` — the onActivityResult and operation
   discriminator this gate extends
5. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — import-resolution procedure (import paths
   are NOT published — resolve, do not guess)
6. `$SKILL_DIR/references/ttp/constants/ttp-questions.md` — the verbatim text of `G7a`, the only question
   this gate asks. Everything else (`Q7a`–`Q7d`) was answered in Step 0 and injected below.

## Your task

Implement TTP GATE 8 using the activity file as your primary guide.

Critical constraints:
1. `.autoCapture(false)` MUST be present on the pre-auth builder chain — without it the
   transaction is a sale and there is nothing to capture.
2. Persist the identifier from `MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER` on pre-auth approval.
   Capture, increment and refund all need it.
3. ADD `CAPTURE_TRANSACTION` to the EXISTING `summaryFeatures` set. ADD `INCREMENT_TRANSACTION`
   **only if `INCREMENTAL_AUTH_REQUESTED = yes`** — on the `no` path it would expose an
   *Increase Hold* button for a flow this integration never confirmed in TEST.
   `REFUND_TRANSACTION` MUST survive — dropping it is a regression, not a refactor.
4. `.incrementalAuthorization(...)` takes **three arguments** — `(identifier, additionalAmount, currency)`.
   Verified against SDK 2.115.0. Do NOT chain `.amountAndCurrency(...)`: it does not exist on
   `IncrementalAuthorizationBuilder` and will not compile. The public documentation sample showing the
   one-argument chain is stale.
   The amount is the ADDITIONAL amount, NOT the new total. Confirm this in TEST mode and record the
   observed authorized total in `project-plan.md`; if it disagrees, STOP and flag it.
5. Validate before building: identifier non-empty, and the transaction not already captured.
   Never capture more than the authorized amount including increments.
6. An issuer-declined increment leaves the ORIGINAL hold valid — do not clear the identifier and do
   not report a failed pre-authorization.
7. EXTEND the existing result site for your UI_TOOLKIT — `views`: the single `onActivityResult`;
   `compose`: the single launcher callback plus a `rememberSaveable` discriminator, and NO
   `onActivityResult`/`startActivityForResult`. Branch on the recorded operation, not on captured state
   alone — a sale and a capture are both captured and cannot be told apart that way.
8. Guard order is `isMposUiReady()` then `isDeviceEnrolled()`. Both show feedback and return.
9. UI — two different placements, do not conflate them:
   - **Sale vs Pre-Auth STAYS on the payment screen.** Both start a NEW card-present transaction with no
     prior transaction to target, so the choice belongs before the tap. If UI_PATTERN = mode-selector, add
     a Sale/Pre-Auth RadioGroup ABOVE the existing pay button.
   - **Capture and increment do NOT go on the payment screen.** Both act on an EXISTING
     pre-authorization, so they go in `act_TTP_04` Step 3's transaction-detail actions slot, enabled from
     the displayed transaction's own `status`/`isCaptured`. Never wire them into a `payment_entry_points`
     file, and never gate them on a cached identifier.
     On the payment screen there is exactly ONE listener on the pay button, and it branches on the
     selected mode. On the detail page, capture/increment are enabled from the displayed transaction, so
     there is no visibility flag to manage in either toolkit — do not create one. Every control needs
     explicit layout positioning so nothing overlaps.
10. Import `io.mpos.transactions.Currency` — never `java.util.Currency` or `com.visa.utils.Currency`.
10a. Take every FQN from `references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names*;
     several types have plausible decoys in `io.mpos.taptophone` or `com.visa.*`.

## Mandatory verification

Run every command below with the Bash tool. Do NOT report PASS until the build succeeds.

> **These checks are the same ones as § *Step 8b: Verification checks*, plus the build.** Two copies
> exist because the body walks an integrator through them while this section is what the agent prompt
> executes. **Any change to a check here must be made in Step 8b as well, and vice versa.** A stale
> copy is worse than a missing check: one of these blocks once still demanded
> `.amountAndCurrency()` after `incrementalAuthorization()` for a release where that method does not
> exist, so it failed the only form that compiles and invited an agent to "fix" working code into a
> build error.

```bash
# Path preamble — see references/ttp/constants/ttp-sdk-requirements.md § Project Path Variables
cd "$GRADLE_ROOT" || exit 1

"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
  --parallel --build-cache > /tmp/ttp-build.log 2>&1
BUILD_EXIT=$?
tail -30 /tmp/ttp-build.log
[ "$BUILD_EXIT" -eq 0 ] \
  && echo "BUILD OK (exit 0)" \
  || echo "BUILD FAILED (exit $BUILD_EXIT) — this gate is FAIL"
```

> **Check `BUILD_EXIT`, not the output text.** Never pipe the build into `tail`/`grep` — in a
> pipeline the shell reports the *filter's* exit status, so a failed build reports success. See
> `references/ttp/constants/ttp-sdk-requirements.md` § *CRITICAL — never pipe the build command*.

```bash
grep -rn "autoCapture\s*(false)" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: autoCapture(false) missing"

grep -n "startPreAuth(\|startCapture(\|startIncrementalAuth(" "$SOURCE_ROOT/<path-to-screen>"

grep -rn "CAPTURE_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: CAPTURE_TRANSACTION summary feature missing"

# Conditional — must match INCREMENTAL_AUTH_REQUESTED exactly, in both directions
grep -rq "INCREMENT_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && FOUND=yes || FOUND=no
[ "$FOUND" = "$INCREMENTAL_AUTH_REQUESTED" ] \
  && echo "OK: INCREMENT_TRANSACTION present=$FOUND matches request" \
  || echo "FAIL: INCREMENT_TRANSACTION present=$FOUND but INCREMENTAL_AUTH_REQUESTED=$INCREMENTAL_AUTH_REQUESTED"

grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: summaryFeatures replaced — REFUND_TRANSACTION dropped"

# Incremental authorization must use the THREE-argument call (identifier, amount, currency).
# Do NOT check for .amountAndCurrency() here — that method does not exist on
# IncrementalAuthorizationBuilder, so requiring it false-fails the only form that compiles.
grep -rn 'incrementalAuthorization(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -qE 'incrementalAuthorization\([^)]*,[^)]*,' \
  && echo "OK: three-argument incrementalAuthorization" \
  || echo "FAIL: incrementalAuthorization must be called as (identifier, additionalAmount, currency)"

# And the inverse: the stale documented chain must NOT be present. Strip comments first — this
# activity recommends comments that name the forbidden token, and a comment is not a violation.
grep -rn -A3 'incrementalAuthorization(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | sed 's|//.*||' | grep -q 'amountAndCurrency' \
  && echo "FAIL: .amountAndCurrency() after incrementalAuthorization() — does not compile on 2.115.0" \
  || echo "OK: no stale one-argument chain"

# One action handler on the pay control — branch on UI_TOOLKIT.
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -c 'setOnClickListener\|findViewById' "$SOURCE_ROOT/<path-to-screen>" | grep -qx 0 \
    && echo "OK: no Views handlers in a Compose screen" \
    || echo "FAIL: setOnClickListener/findViewById found in a Compose screen"
else
  grep -cn "setOnClickListener" "$SOURCE_ROOT/<path-to-screen>"
fi
# a second listener on the pay button is a HARD FAIL

# Control gating — branch on UI_TOOLKIT. A Compose project has NO res/layout directory, so an
# unbranched grep here returns zero matches with exit status 1: indistinguishable from "checked
# and clean", which is how this check silently passes on a project it never read.
# Placement: capture/increment belong on the transaction detail page, never on a payment screen.
for f in $PAYMENT_ENTRY_POINT_FILES; do
  [ -f "$f" ] || continue
  grep -qE 'startCapture|startIncrementalAuth|btn_capture|btn_increment' "$f" \
    && echo "FAIL: $f is a payment screen and carries capture/increment wiring" \
    || echo "OK: $f (payment screen) clean"
done

# Enabled state derives from the displayed transaction, not from a visibility toggle.
grep -rqE 'isCaptured' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK: hold state read from the transaction" \
  || echo "FAIL: no isCaptured check — the actions cannot be correct after process death"

# Currency trap — SCOPED to files that actually build SDK transaction parameters.
# Scope this to the CALL SITE, not the file. java.util.Currency is legitimately used for display
# formatting, locale currency lists, and unrelated legacy code — and it can live in the SAME file as
# a correct TTP builder. Classifying a whole file by its presence fails correct integrations.
SDK_CALL='\.charge\(|\.refund\(|\.capture\(|\.incrementalAuthorization\(|\.tipAdjust\('
FAILED=0
for f in $(grep -rlE "$SDK_CALL" "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null); do
  # 1. A file that builds transaction parameters must resolve the SDK enum somehow.
  grep -qE 'import io\.mpos\.transactions\.Currency|io\.mpos\.transactions\.Currency\.' "$f" \
    || { echo "FAIL: $f builds transaction parameters but never resolves io.mpos.transactions.Currency"; FAILED=1; }
  # 2. The JDK type must not appear AT or immediately after an SDK builder call.
  grep -E -A2 "$SDK_CALL" "$f" | grep -q 'java\.util\.Currency' \
    && { echo "FAIL: $f passes java.util.Currency into an SDK transaction builder"; FAILED=1; }
done
[ "$FAILED" -eq 0 ] && echo "OK: every SDK builder call site resolves io.mpos.transactions.Currency"

# The second, undocumented decoy — never legitimate here
# Forbidden-token check: strip comments before judging. This skill recommends comments that NAME the
# forbidden type ("never java.util.Currency or com.visa.utils.Currency"), so an unfiltered grep flags a
# violation the guidance itself introduced — and the tempting "fix" is deleting a useful comment.
grep -rn 'com\.visa\.utils\.Currency' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -vE ':\s*(//|\*|/\*)' | grep -v '//.*com\.visa\.utils\.Currency' \
  | grep -q . \
  && echo "FAIL: com.visa.utils.Currency is used in code — not the SDK Currency type" \
  || echo "OK: no com.visa.utils.Currency outside comments"

# Result site — branch on UI_TOOLKIT.
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -c 'onActivityResult\|startActivityForResult' "$SOURCE_ROOT/<path-to-screen>" | grep -qx 0 \
    && echo "OK: no deprecated result path" \
    || echo "FAIL: Compose screen must not use onActivityResult/startActivityForResult"
  grep -qE 'pendingOperation by rememberSaveable|SavedStateHandle' "$SOURCE_ROOT/<path-to-screen>" \
    && echo "OK: discriminator survives Activity recreation" \
    || echo "FAIL: operation discriminator uses plain remember — resets on recreation"
  # The converse, Critical Rule 13: nothing from io.mpos.* may be saveable. Scan the whole source
  # root — the offending state is usually Gate 4's detail screen or navigation graph, and it crashes
  # on the way INTO capture or increment. TransactionStatus is an enum and IS saveable.
  grep -rn -A2 'rememberSaveable' "$SOURCE_ROOT" --include="*.kt" --exclude-dir=build \
    | grep -E 'mutableStateOf<[^{}]*\bTransaction\??>|mutableStateOf<[^{}]*io\.mpos' \
    && echo "FAIL: an SDK object is held in rememberSaveable — IllegalStateException at onSaveInstanceState on the first capture/increment tap. Hold the identifier String and resolve the record (act_TTP_04 Critical Rule 11)" \
    || echo "OK: no SDK object in saveable state"
else
  grep -c "onActivityResult" "$SOURCE_ROOT/<path-to-screen>"
fi
# more than one definition per Activity = FAIL
```

If DEVICE_AVAILABLE = yes: install the APK, run a pre-authorization by tap, then a capture, and
report the real results including the authorized total after any increment.
If DEVICE_AVAILABLE = no: complete AC 1–25, verify the build, and mark the on-device
pre-auth→capture flow DEFERRED → TTP Gate 10 (manual device validation). Do NOT fabricate an
approved pre-authorization or capture.

### Quality-gate diff (mandatory when the project has one)

`baseline_quality_task` in `project-plan.md` names the project's own static-analysis task, measured
by Gate 0 **before any change**. If it is not `none`, re-run it and compare:

```bash
cd "$GRADLE_ROOT" || exit 1
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:$BASELINE_QUALITY_TASK" \
  > /tmp/ttp-quality.log 2>&1
QUALITY_EXIT=$?
tail -40 /tmp/ttp-quality.log
```

The pass condition is a **diff against the baseline**, not an absolute pass:

- **No new rule types** compared with `baseline_quality_findings`.
- **No findings in files this gate created.**

It is emphatically **not** "the quality task must pass". Many real projects are already red at HEAD —
one measured baseline had 14 detekt findings before the integration started. Demanding an absolute
pass turns unrelated pre-existing debt into a blocker for this gate, and tempts an agent into
"fixing" code it was never asked to touch.

If a new finding *is* attributable to this gate, fix the code — do not raise a threshold, do not edit
the project's detekt/ktlint config, and do not add a blanket suppression.

Decomposition is the default and usually the right answer. When a rule is *structural* to the code the
gate must write — `LongMethod` on a Compose screen composable is the recurring case — follow
`"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` § *When a new lint finding is
structural: the suppression rule*, which sets out when a targeted single-declaration `@Suppress` is
permitted and what must be reported. Do not settle it by copying whatever the surrounding code does
without checking that section.

## Required report

```
TTP GATE 8 REPORT
Status: PASS | FAIL | PASS (on-device pre-auth→capture DEFERRED to TTP Gate 10)
Build: SUCCESS | FAILED
Target Activity: <class name(s)>
UI pattern: mode-selector | separate-button
autoCapture(false) present: YES | NO
preAuthTransactionIdentifier persisted: YES | NO
summaryFeatures (full set): <list — REFUND_TRANSACTION must appear>
REFUND_TRANSACTION survived this gate: YES | NO
Capture types REQUESTED (verbatim from CAPTURE_TYPES / project-plan.md capture_types): <list>
  capture, full amount:    IMPLEMENTED (<function/file>) | NOT REQUESTED
  capture, partial amount: IMPLEMENTED (<function/file>) | NOT REQUESTED
  Requested set fully covered: YES | NO (<which are missing — this is a FAIL, not a note>)
Incremental auth REQUESTED (from INCREMENTAL_AUTH_REQUESTED / project-plan.md): YES | NO
Incremental auth implemented: YES | NO | N/A
incrementalAuthorization uses the 3-arg form (id, additionalAmount, currency): YES | NO | N/A
Incremental amount semantics: ADDITIONAL (confirmed in TEST: <observed total>) | ADDITIONAL (unconfirmed) | N/A
Increment decline handled as "original hold valid": YES | NO | N/A
Capture type: full | partial
Partial capture <= authorized amount enforced: YES | NO | N/A
Already-captured validated before capture: YES | NO
Captured-state accessor used: <exact accessor resolved from the artifact>
Hold cardinality model: one-active-hold | keyed-collection
  startPreAuth refuses while an uncaptured hold exists: YES | NO | N/A (keyed collection)
Result site extended, not duplicated: YES | NO   (toolkit: views onActivityResult | compose launcher)
Compose discriminator is saveable across Activity recreation: YES | NO | N/A (views)
Results branched on recorded operation: YES | NO
Capture/increment buttons start hidden: YES | NO
Buttons shown in onPreAuthApproved / hidden in onCaptureApproved: YES | NO
No button overlap (layout verified): YES | NO
Exactly one listener on the pay button: YES | NO
On-device pre-auth result: APPROVED | FAILED | DEFERRED (no device)
On-device capture result: CAPTURED | FAILED | DEFERRED (no device)
Files modified: <list>
Acceptance criteria met: <list>
```
```
