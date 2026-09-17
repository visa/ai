# Activity TTP-6: Implement Refund and Stand-Alone Credit

Implement money-out transactions on an enrolled Tap to Pay device: a **referenced refund** against
a previous sale (full or partial), and a **stand-alone credit** for the case where no original
transaction identifier exists. Write code directly to project files — do not just print code
examples in the chat.

**Reference:** [Tap to Pay on Android Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-payment-txn-intro.md) (Refund, Stand-Alone Credit, Check Transaction Status sections), [Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) (`UiConfiguration` / `SummaryFeature`), `references/ttp/troubleshooting.md#ttp-refund`, `references/ttp/constants/ttp-sdk-requirements.md`

## Critical Rules (NEVER violate these)

1. **NEVER hardcode a transaction identifier.** Retrieve it from the Activity TTP-5 result (`MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER`), from where TTP-5 persisted it, or from the summary screen. A hardcoded identifier works exactly once, on one device, and then fails in production.
2. **NEVER use a stand-alone credit when the original transaction identifier is available.** A referenced refund is bounded by the original transaction; a stand-alone credit is not bounded by anything, and the card must be presented. Prefer the referenced path every time it is possible.
3. **Both guards are required, in order:** `isMposUiReady()` then `isDeviceEnrolled()`. A refund is a card-present transaction on this platform — an unenrolled phone cannot process one.
4. **A partial referenced refund must not exceed the original amount minus refunds already issued.** Exceeding it fails at the gateway, not at compile time.
5. **ADD `SummaryFeature.REFUND_TRANSACTION` to the existing `summaryFeatures` set — never rebuild the set.** Activity TTP-3 established the set when it built the holder, and Activity TTP-8 adds to it again. Replacing it silently deletes features added elsewhere; this is the highest-risk regression in this integration path.
6. **Extend Gate 5's existing result site — never add a second one. Branch on `UI_TOOLKIT` first.**
   Refunds return under the same `MposUi.REQUEST_CODE_PAYMENT` as charges, so the result site is shared.
   - `views` → extend the single `onActivityResult`. A second override is a duplicate, not an extension.
   - `compose` → extend Gate 5's single `rememberLauncherForActivityResult` callback and its **saveable**
     operation discriminator. **Do NOT add `onActivityResult` or `startActivityForResult`** — Gate 5
     deliberately chose the Activity Result API, many projects' lint/detekt reject the deprecated path,
     and reintroducing it here regresses a working integration.
   See `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` § *Result handling*.
7. **Use `AccessoryFamily.TAP_TO_PHONE`** and `io.mpos.transactions.Currency` (never `java.util.Currency`, and never `com.visa.utils.Currency` — both exist on the classpath and neither satisfies the builder) — as in every activity on this path.
8. **NEVER hardcode `app/`, `src/main/java/`, or `res/layout/`.** Use `$ANDROID_MODULE_DIR` and `$SOURCE_ROOT` from `project-plan.md`, and branch on `$UI_TOOLKIT` — a Compose project has no layout XML and no `findViewById`. A grep against a path that does not exist returns zero matches with exit status 1, which is indistinguishable from "checked and clean": that is how a verification step passes on a project it never read. Confirm each path exists before believing a zero-match result.
9. **On Compose, `rememberSaveable` may hold ONLY Bundle-safe values — the discriminator enum and scale-2 amount strings. Never a `Transaction`.** This gate is where the crash appears, because refund is the first flow that **selects a `Transaction` before launching an SDK Activity** — charge and verification never populate that state, so they never trip it. If the detail screen holds its selection as `rememberSaveable { mutableStateOf<Transaction?>(null) }`, the app dies on the way *into* the refund with `IllegalStateException: MutableState(value=io.mpos.transactions.Transaction@…) cannot be saved using the current SaveableStateRegistry` — launching the SDK's payment Activity stops the host Activity, which triggers `onSaveInstanceState`.

    **The state is usually not this gate's code** — `act_TTP_04` created it (its Critical Rule 11). Fix it there: hold `selectedTransactionId: String?` and resolve the record from it. Do **not** work around it by narrowing `TransactionDetailActions` to take a `String`, and do **not** conclude that the discriminator should become a plain `remember` — it still must be saveable, because an enum is Bundle-safe. Constants file § *CRITICAL — `rememberSaveable` holds Bundle-safe values ONLY*.

## Prerequisites

Before starting this activity, the developer must have completed:

- `act_TTP_01`, `act_TTP_02`, `act_TTP_03` — dependencies, credentials, enrollment
- `act_TTP_03` — the `MposUi` holder exists with `isMposUiReady()` / `isDeviceEnrolled()`, and `mpos_accessor` is recorded in `project-plan.md`
- `act_TTP_04` — the transaction detail page with its empty actions slot, which Step 7 fills
- `act_TTP_05` — a charge
  flow works, and the transaction identifier is being persisted on approval
- For referenced refunds specifically: **a previous successful sale**, so an identifier exists

### Verify the holder guards (MANDATORY)

Confirm the guard pattern the holder established is in place before writing any refund code — see
`references/ttp/constants/ttp-sdk-requirements.md` § *The `MposUi` holder*, built by `act_TTP_03`. The
samples spell the holder `PaymentApplication`; read that as `MPOS_ACCESSOR`. On the DI-owned branch
the two guards are a null check on the injected reference followed by
`mposUi?.tapToPhone?.isDeviceEnrolled() == true` — same two checks, same order, different spelling:

**Kotlin:**
```kotlin
if (!PaymentApplication.isMposUiReady()) return
if (!PaymentApplication.isDeviceEnrolled()) return
val mposUi = PaymentApplication.mposUi
```

**Java:**
```java
if (!PaymentApplication.isMposUiReady()) return;
if (!PaymentApplication.isDeviceEnrolled()) return;
MposUi mposUi = PaymentApplication.getMposUi();
```

**Do NOT proceed to Step 1 until these exist.** If they do not, complete `act_TTP_05` first.

## Workflow

Follow these steps in order. **All code changes must be written directly to project files using
the Edit or Write tools.** Reuse the currency established in `act_TTP_05` Step 3; only ask for a
currency if none was established.

### Step 1: Discover project context

Read the project to determine:

1. **Project language** — Java or Kotlin. Write only in the detected language.
2. **Target class(es)** — normally the same classes that received `startCharge()` in TTP-5. When
   `PAYMENT_ENTRY_POINTS` was injected by the workflow, use it and do **not** ask. Only when it is
   absent *and* the classes are genuinely ambiguous, ask **`G5a`** from
   `$SKILL_DIR/references/ttp/constants/ttp-questions.md` § *Gate-local questions*, verbatim.
3. **The existing `onActivityResult`** — locate it. Refund results arrive under the same request code as charges, so this handler must be **extended**, never duplicated.
4. **How TTP-5 persisted the identifier** — member field, `SharedPreferences`, or an Intent extra.

```bash
grep -rn "onActivityResult\|lastTransactionIdentifier\|startCharge(" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java"
```

### Step 2: Confirm `SummaryFeature.REFUND_TRANSACTION` in `UiConfiguration`

`act_TTP_03` already put `REFUND_TRANSACTION` in the `summaryFeatures` set when it built the holder.
Confirm it
survived:

```bash
grep -rn "summaryFeatures\|REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java"
```

If it is missing, **add it to the existing set** — do not replace the set:

```kotlin
// CORRECT — extends whatever is already there
configuration = UiConfiguration(
    summaryFeatures = setOf(
        SummaryFeature.REFUND_TRANSACTION,
        /* keep every entry that was already present */
    )
)
```

With this feature enabled, the SDK's post-sale summary screen carries a **refund button** — no
custom refund UI is required at all. For a historic transaction, re-open that same screen:

```kotlin
val summaryIntent = PaymentApplication.mposUi.createTransactionSummaryIntent(
    transactionIdentifier = lastTransactionIdentifier!!
)
startActivityForResult(summaryIntent, MposUi.REQUEST_CODE_SHOW_SUMMARY)
```

The summary screen returns `MposUi.RESULT_CODE_SUMMARY_CLOSED` under
`MposUi.REQUEST_CODE_SHOW_SUMMARY` — a **different request code** from a transaction. Read the
outcome afterwards from `mposUi.latestTransaction?.status`.

### Step 3: Refund approach — **use the injected value; only ask if it is absent**

`REFUND_APPROACH` is owned by the workflow's Step 0 (Q6a) and injected into this gate. **If it has a
value, use it and do NOT ask.** The workflow already collected it, the developer already approved it
at the plan checkpoint, and re-asking here costs a round trip and can produce an answer that
contradicts the approved plan.

Ask the question below **only** when `REFUND_APPROACH` is empty or `N/A` — for example when this
activity is run standalone rather than through the workflow.

<details>
<summary>Fallback question (only when <code>REFUND_APPROACH</code> is absent)</summary>

```
How should refunds be handled?

Options:
  - SDK built-in refund (Recommended) — the summary screen's refund button. Step 2 already
    enabled it; no custom refund code or UI is needed.
  - Programmatic refund — build TransactionParameters yourself for full control over which
    refund type runs and when.
```

</details>

**Act on the resolved value:**

- `builtin` → the implementation work is already done. Optionally add a button that opens the summary
  screen via `createTransactionSummaryIntent()` (Step 2), then skip to **Step 8**.
- `programmatic` → continue.

> **`programmatic` does not disable the built-in path.** Step 2 enables
> `SummaryFeature.REFUND_TRANSACTION` and this gate never removes it, so choosing `programmatic`
> yields *both* the SDK summary refund and your own refund code. That is intentional — but say so in
> the gate report rather than implying only one path exists, and remember the summary screen can
> refund a transaction your own code knows nothing about.

### Step 4: Refund type — **use the injected value; only ask if it is absent**

`REFUND_TYPES` is likewise owned by Step 0 (Q6b). **If it has a value, use it and do NOT ask.**

<details>
<summary>Fallback question (only when <code>REFUND_TYPES</code> is absent)</summary>

```
Which refund type do you need? (Select all that apply.)

Options:
  - Referenced refund, full amount (Recommended) — refunds an entire previous sale
  - Referenced refund, partial amount — refunds part of a previous sale
  - Stand-alone credit — a credit with no original transaction; the card must be present
```

If the developer is unsure, recommend **referenced refund, full amount**.

</details>

The three variants are all built from `TransactionParameters.Builder()`:

| Variant | Builder chain | Notes |
|---|---|---|
| Referenced refund (full) | `.refund(transactionIdentifier)` | **Preferred path** |
| Referenced refund (partial) | `.refund(transactionIdentifier).amountAndCurrency(amount, currency)` | Amount ≤ original minus prior refunds |
| Stand-alone credit | `.refund(amount, currency).customIdentifier(id)` | Not bounded by any original transaction — higher risk; card must be present |

> **Why the stand-alone credit is the risky one.** There is no original transaction to bound it
> against, so nothing in the request itself limits the credit amount — a typo in the amount is
> money out of the door. Use it only when the original identifier genuinely does not exist.

### Step 5: Implement the refund method(s)

Only implement the variants selected in Step 4. Guards first, in order, each with visible feedback
and a `return`. Replace `<CURRENCY_CODE>` with the currency from `act_TTP_05` Step 3.

**Kotlin:**
```kotlin
/** Referenced refund. Pass null/blank amount for a full refund, an amount for a partial one. */
private fun performRefund(transactionIdentifier: String?, partialAmount: BigDecimal? = null) {
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
        Toast.makeText(this, "No transaction available to refund.", Toast.LENGTH_SHORT).show()
        return
    }

    val builder = TransactionParameters.Builder().refund(transactionIdentifier)
    if (partialAmount != null) {
        // Must be <= original amount minus refunds already issued
        builder.amountAndCurrency(partialAmount, Currency.<CURRENCY_CODE>)
    }

    pendingOperation = PaymentOperation.REFUND     // see Step 6
    val intent = PaymentApplication.mposUi.createTransactionIntent(builder.build())
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}

/** Stand-alone credit — no original transaction. Card must be present. */
private fun performStandaloneCredit(amount: BigDecimal, identifier: String) {
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
        .refund(amount, Currency.<CURRENCY_CODE>)
        // `identifier` MUST satisfy ^[a-zA-Z0-9_-]{0,256}$ or this THROWS MposRuntimeException.
        // On this path it is typically TYPED BY THE USER — validate before you get here.
        .customIdentifier(identifier)
        .build()

    pendingOperation = PaymentOperation.STANDALONE_CREDIT
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private void performRefund(String transactionIdentifier, BigDecimal partialAmount) {
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
        Toast.makeText(this, "No transaction available to refund.", Toast.LENGTH_SHORT).show();
        return;
    }

    TransactionParameters.Builder builder =
            new TransactionParameters.Builder().refund(transactionIdentifier);
    if (partialAmount != null) {
        builder.amountAndCurrency(partialAmount, Currency.<CURRENCY_CODE>);
    }

    pendingOperation = PaymentOperation.REFUND;     // see Step 6
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(builder.build());
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}

private void performStandaloneCredit(BigDecimal amount, String identifier) {
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
            .refund(amount, Currency.<CURRENCY_CODE>)
            .customIdentifier(identifier)
            .build();

    pendingOperation = PaymentOperation.STANDALONE_CREDIT;
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

### Step 6: Extend Gate 5's existing result site

**Branch on `UI_TOOLKIT` from `project-plan.md` before writing anything here.** The two toolkits have
different result sites, and applying the wrong one either fails to compile or regresses Gate 5.

**This is where a discriminator becomes necessary.** In `act_TTP_05` the handler served exactly
one operation, so `RESULT_CODE_APPROVED` unambiguously meant "the sale was approved". Now a charge
and a refund both return `RESULT_CODE_APPROVED` under the same `MposUi.REQUEST_CODE_PAYMENT`, and
treating them alike would overwrite the sale identifier with the refund's — destroying the value
Activity TTP-8 needs for capture.

Record which operation was started, and branch on it. Activity TTP-8 extends the same enum.

#### `UI_TOOLKIT = compose` — extend the launcher callback

Gate 5 registered one `rememberLauncherForActivityResult`. Extend **that** callback. The full
canonical pattern is in
`$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` § *Result handling*; the refund-specific
part is the discriminator and the amount bookkeeping:

```kotlin
enum class PaymentOperation { CHARGE, REFUND, STANDALONE_CREDIT }

// rememberSaveable, NOT remember: this value is read after the SDK Activity returns, and the host
// Activity can be recreated while that Activity is in front. A plain `remember` resets to null and
// an approved refund arrives as "unknown operation" — silently misattributed.
//
// This applies to THIS enum, and to Bundle-safe values generally. It does NOT generalise to
// "important state belongs in rememberSaveable": an io.mpos.* object in rememberSaveable CRASHES at
// onSaveInstanceState. Hold a Transaction with plain `remember`, or hold its identifier String.
// Critical Rule 9.
var pendingOperation by rememberSaveable { mutableStateOf<PaymentOperation?>(null) }

// Inside Gate 5's existing launcher callback, add the refund branches:
//   PaymentOperation.REFUND            -> onRefundApproved(transaction, id)
//   PaymentOperation.STANDALONE_CREDIT -> onStandaloneCreditApproved(transaction, id)
// and set pendingOperation immediately before launcher.launch(intent).

// The built-in summary refund needs its OWN launcher — its result is not a transaction result.
val summaryLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.StartActivityForResult()
) { /* outcome is uncertain — do NOT adjust persisted amounts on the assumption it succeeded */ }
```

**Do not add `onActivityResult`, `startActivityForResult`, `findViewById`, or layout XML.** A Compose
project has no `res/layout` to edit.

#### `UI_TOOLKIT = views` — extend the single `onActivityResult`

**Kotlin:**
```kotlin
private enum class PaymentOperation { CHARGE, REFUND, STANDALONE_CREDIT }

private var pendingOperation: PaymentOperation = PaymentOperation.CHARGE

override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)   // ALWAYS first

    if (requestCode != MposUi.REQUEST_CODE_PAYMENT) return

    val transaction = PaymentApplication.mposUi.latestTransaction
    val identifier = data?.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)

    when (resultCode) {
        MposUi.RESULT_CODE_APPROVED -> when (pendingOperation) {
            PaymentOperation.CHARGE -> {
                lastTransactionIdentifier = identifier   // refundable / capturable
                onChargeApproved(transaction)
            }
            PaymentOperation.REFUND,
            PaymentOperation.STANDALONE_CREDIT -> onRefundApproved(transaction, identifier)
        }
        MposUi.RESULT_CODE_FAILED -> when (pendingOperation) {
            PaymentOperation.CHARGE -> onChargeFailed(transaction)
            else -> onRefundFailed(transaction)
        }
        // Any other result code = the shopper backed out before the tap.
    }
}

private fun onRefundApproved(transaction: Transaction?, refundIdentifier: String?) {
    Toast.makeText(this, "Refund approved", Toast.LENGTH_SHORT).show()
    // refundIdentifier is the identifier OF THE REFUND — do NOT store it as the last sale.
    // Once a sale is fully refunded, clear lastTransactionIdentifier so it cannot be
    // refunded or captured again.
}

private fun onRefundFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Refund declined" else "Refund failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
```

**Java:**
```java
private enum PaymentOperation { CHARGE, REFUND, STANDALONE_CREDIT }

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
        if (pendingOperation == PaymentOperation.CHARGE) {
            lastTransactionIdentifier = identifier;
            onChargeApproved(transaction);
        } else {
            onRefundApproved(transaction, identifier);
        }
    } else if (resultCode == MposUi.RESULT_CODE_FAILED) {
        if (pendingOperation == PaymentOperation.CHARGE) {
            onChargeFailed(transaction);
        } else {
            onRefundFailed(transaction);
        }
    }
}
```

If the app also opens the summary screen (Step 2), handle
`MposUi.REQUEST_CODE_SHOW_SUMMARY` / `MposUi.RESULT_CODE_SUMMARY_CLOSED` as a separate branch — a
refund taken from the summary screen's own button closes that screen rather than returning a
payment result.

### Step 7: Attach the refund trigger to the transaction detail page

**A refund targets a specific transaction, so its control belongs where that transaction is selected —
not on the payment screen.** Gate 4 built the Transactions list and left an empty actions slot on the
detail page precisely for this gate to fill.

> **Do not add a refund button to the POS screen.** A refund control there has no transaction to act on,
> so it can only fall back to "the most recent one" — which caps refunds at the last sale forever, and
> silently refunds the wrong transaction the moment a second sale happens in between. The pay screen's
> job is to start a *new* transaction; refund is an operation *on an existing* one.

`UI_TOOLKIT = compose` — fill the slot Gate 4 left:

```kotlin
// act_TTP_04 left this composable empty. The selected transaction IS the refund target, so the
// identifier comes from it — never from a "last transaction" field.
@Composable
fun TransactionDetailActions(transaction: Transaction) {
    val refundable = transaction.status == TransactionStatus.APPROVED && !transaction.isRefunded
    Button(
        onClick = { performRefund(transaction.identifier) },
        enabled = refundable,
    ) { Text("Refund") }

    if (!refundable) {
        Text("This transaction cannot be refunded (status: ${transaction.status.name}).")
    }
}
```

`UI_TOOLKIT = views` — the detail screen's layout, not the POS layout:

```xml
<!-- res/layout/<transaction_detail_layout>.xml — the screen act_TTP_04 Step 3 created -->
<Button
    android:id="@+id/btn_refund"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="8dp"
    android:text="Refund" />
```

```kotlin
findViewById<Button>(R.id.btn_refund).setOnClickListener {
    performRefund(selectedTransaction.identifier)   // the transaction this screen is showing
}
```

> **A transaction detail page always exists by the time this gate runs.** Gate 4 is never `declined` and
> both of its menu entries always ship (`act_TTP_04` Critical Rule 9), so the slot is there. Exactly one
> case needs different handling:
>
> | State | What to attach to |
> |-------|-------------------|
> | Gate 4 `run` (the normal case) | the `TransactionDetailActions` slot `act_TTP_04` Step 3 left empty |
> | Gate 4 `skip` — the app already had an equivalent menu **and** a `transactionModule`-backed history | the app's own transaction detail surface. Name it in the report |
> | Gate 4 `skip` but no detail surface can be found | **stop and tell the developer.** The skip decision was wrong; Gate 4 should be re-run |
>
> In none of those cases do you fall back to a POS-screen button, and in none of them do you build a
> history here — that is Gate 4's job, and a second one guarantees divergence.

**Stand-alone credit is the one exception.** It is not bound to any prior transaction, so it has no
detail page to live on. Keep it off the POS screen anyway — it is the highest-risk operation in this
gate, and a button next to `Pay` invites a mis-tap that moves money to a card with no original sale
behind it. Put it behind the menu (a "Refund without a receipt" entry) or a deliberate confirmation, and
never as a sibling of the pay button.

### Step 7b: Verify the refund trigger is on the detail page, not the POS screen (mandatory) <!-- REC-02 -->

```bash
cd "$GRADLE_ROOT" || exit 1

# Check A — the refund trigger EXISTS and is wired.
grep -rn "performRefund\|performStandaloneCredit\|btn_refund\|btnRefund" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
# Zero matches = FAIL. Fix the wiring before continuing.

# Check B — it is NOT on a payment entry-point screen. Every file listed in payment_entry_points
# must be free of refund wiring; that is the whole point of moving it to the detail page.
# Replace the loop input with the payment_entry_points file list from project-plan.md.
for f in $PAYMENT_ENTRY_POINT_FILES; do
  [ -f "$f" ] || { echo "note: $f not found — check payment_entry_points"; continue; }
  grep -qE 'performRefund|btn_refund|btnRefund' "$f" \
    && echo "FAIL: $f is a payment entry point and carries refund wiring — move it to the transaction detail page" \
    || echo "OK: $f (payment screen) has no refund wiring"
done

# Check B2 — EVERY requested refund type exists. A gate that built one of three requested types
# reports PASS and reads as complete; this is the only check that catches it. REFUND_TYPES is
# injected, and project-plan.md refund_types is the fallback if it is empty or you are resuming.
REQUESTED="$REFUND_TYPES"
[ -n "$REQUESTED" ] || REQUESTED=$(grep -E '^refund_types:' "$GRADLE_ROOT/project-plan.md" \
  | sed -E 's/^refund_types:[[:space:]]*//; s/[[:space:]]*#.*$//')
echo "refund types requested: ${REQUESTED:-<UNKNOWN — stop and re-read project-plan.md>}"

case "$REQUESTED" in *standalone_credit*)
  grep -rqE 'performStandaloneCredit|STANDALONE_CREDIT' "$SOURCE_ROOT" \
    --include="*.kt" --include="*.java" --exclude-dir=build \
    && echo "OK: stand-alone credit path present" \
    || echo "FAIL: standalone_credit was REQUESTED and no stand-alone credit path exists — this gate is incomplete, not passing" ;;
  *) echo "n/a: stand-alone credit not requested" ;;
esac

case "$REQUESTED" in *referenced_partial*)
  # A partial refund needs an amount on the refund call; a full refund does not.
  grep -rqE '\.refund\([^)]*[Aa]mount' "$SOURCE_ROOT" \
    --include="*.kt" --include="*.java" --exclude-dir=build \
    && echo "OK: an amount-bearing refund call is present (partial path)" \
    || echo "FAIL: referenced_partial was REQUESTED but no refund call passes an amount" ;;
  *) echo "n/a: partial refund not requested" ;;
esac

# Check C — the identifier is the SELECTED transaction, not a cached "latest".
grep -rnE 'performRefund\(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null \
  | grep -E 'lastTransactionIdentifier|latestTransaction' \
  && echo "FAIL: refund is using a cached latest-transaction identifier — pass the selected transaction's identifier" \
  || echo "OK: refund does not depend on a cached latest identifier"

# Check D — no original handler survives on the same control.
grep -rn "Toast.makeText\|makeText" "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null | head
# If Toast.makeText (or any other original handler) appears INSIDE a setOnClickListener block that now
# calls a refund method, that is a HARD FAIL. Remove the original handler entirely.
```

These checks are binary. Do NOT report success and move on — fix the wiring, then re-run them.

### Step 8: Build and verify

**You MUST actually run these commands with the Bash tool.** Read the output and fix any errors
before finishing.

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

```bash
# The summary-feature regression guard — must STILL match after this gate
grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: REFUND_TRANSACTION missing from summaryFeatures"

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

# Exactly one result site per Activity — a second one is a duplicate, not an extension.
# Which check applies depends on UI_TOOLKIT; running the wrong one false-fails a correct project.
if [ "$UI_TOOLKIT" = "compose" ]; then
  # Compose: the deprecated path must be ABSENT, and there must be exactly one payment launcher.
  grep -c 'onActivityResult\|startActivityForResult' "$SOURCE_ROOT/<path-to-screen>" \
    | grep -qx 0 && echo "OK: no deprecated result path" \
    || echo "FAIL: Compose screen must not use onActivityResult/startActivityForResult"
  grep -c 'rememberLauncherForActivityResult' "$SOURCE_ROOT/<path-to-screen>"
  # The operation discriminator must survive Activity recreation.
  grep -qE 'pendingOperation by rememberSaveable|SavedStateHandle|pendingOperation.*rememberSaveable' \
    "$SOURCE_ROOT/<path-to-screen>" \
    && echo "OK: discriminator is saveable" \
    || echo "FAIL: pendingOperation uses plain remember — resets on Activity recreation"
  # ...and the CONVERSE, Critical Rule 9: nothing from io.mpos.* may be saveable. Scan the whole
  # source root, not just this screen — the offending state is usually in the navigation graph or
  # the detail screen created by Gate 4. Launching the SDK Activity stops the host Activity, so this
  # crashes on the way INTO the refund. TransactionStatus is an enum and IS saveable.
  grep -rn -A2 'rememberSaveable' "$SOURCE_ROOT" --include="*.kt" --exclude-dir=build \
    | grep -E 'mutableStateOf<[^{}]*\bTransaction\??>|mutableStateOf<[^{}]*io\.mpos' \
    && echo "FAIL: an SDK object is held in rememberSaveable — IllegalStateException at onSaveInstanceState on the first refund tap. Hold the identifier String and resolve the record (act_TTP_04 Critical Rule 11)" \
    || echo "OK: no SDK object in saveable state"
else
  # Views: exactly one onActivityResult, and super called first.
  grep -c "onActivityResult" "$SOURCE_ROOT/<path-to-screen>"
fi

# No hardcoded identifiers: every refund call must take a variable, never a string literal
grep -rn "\.refund(\"" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: hardcoded transaction identifier" || echo "OK"
```

## Troubleshooting

See `references/ttp/troubleshooting.md#ttp-refund` for refund-specific failures: invalid or
expired transaction identifier, a partial amount that exceeds the original minus prior refunds, a
missing refund button on the summary screen, and stand-alone credit misuse. Shared setup failures
(network, credentials, enrollment, build config) are in
`references/ttp/troubleshooting.md#tap-to-pay`; charge-flow failures are in
`references/ttp/troubleshooting.md#ttp-charge`.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. **Code was written to project files** — refund logic was added to the target class(es) with Edit or Write, not printed in the chat
2. **Only the project language was used** — Java or Kotlin, not both
3. `SummaryFeature.REFUND_TRANSACTION` is present in the `summaryFeatures` set
4. The `summaryFeatures` set was **extended, not replaced** — every entry present before this activity is still present
5. For programmatic refunds: the correct builder chain was used for each selected variant (`.refund(id)`, `.refund(id).amountAndCurrency(...)`, or `.refund(amount, currency).customIdentifier(...)`)
6. `io.mpos.transactions.Currency` is used — never `java.util.Currency` or `com.visa.utils.Currency`, and the verification check is **scoped** so pre-existing unrelated `java.util.Currency` uses do not produce a false FAIL
7. Both guards are present in order — `isMposUiReady()` then `isDeviceEnrolled()` — each showing visible feedback and returning gracefully
8. The transaction identifier is validated (null/empty) before the builder is constructed
8a. **For the stand-alone credit path only:** the value passed to `.customIdentifier(...)` is validated against `^[a-zA-Z0-9_-]{0,256}$` with `isValidTtpCustomIdentifier()` (`act_TTP_05` Step 1b) **before** the builder is constructed. This identifier is normally typed by the user, and `.customIdentifier(...)` **throws** `MposRuntimeException` on a space or a period — so an unvalidated text field is a crash, not a declined refund. Rejection shows an inline error; the value is never silently rewritten
9. No hardcoded transaction identifiers anywhere — every identifier comes from the TTP-5 result, persisted storage, or the summary screen
10. For programmatic refunds: `startActivityForResult` is called with `MposUi.REQUEST_CODE_PAYMENT`
11. Gate 5's **existing** result site was extended, matching `UI_TOOLKIT`:
    - `views` → exactly one `onActivityResult` per Activity, `super.onActivityResult()` called first
    - `compose` → exactly one payment launcher callback extended, a **separate** launcher for the
      built-in summary intent, the operation discriminator held in `rememberSaveable`/`SavedStateHandle`,
      and **no** `onActivityResult`/`startActivityForResult` anywhere in the screen
12. Charge results and refund results are distinguished, and a refund's identifier is never stored as the last sale identifier
13. Both refund outcome handlers show user-visible feedback — empty bodies are not acceptable
14. **The refund trigger is on the transaction detail page, not a payment screen.** It fills the actions slot `act_TTP_04` Step 3 left empty, and the refunded identifier is the **selected** transaction's — never a cached `lastTransactionIdentifier` or `latestTransaction`. **No file in `payment_entry_points` carries refund wiring.** If Gate 4 was skipped, the app's own transaction detail surface was used and is named in the report <!-- REC-02 -->
14a. Stand-alone credit, if implemented, is **not** a sibling of the pay button — it sits behind the menu or a deliberate confirmation, because it moves money with no original sale behind it
15. `grep -n "performRefund\|btn_refund" <each-modified-activity>` returns at least one match per screen <!-- REC-02 -->
16. No original handler remains in any click listener that now calls a refund method <!-- REC-02 -->
17. **Build was executed and passes** — `$GRADLE_MODULE_PATH:assembleDebug` was actually run with the Bash tool and succeeded
18. On a compatible enrolled physical device, a referenced refund against a real previous sale is approved
19. On a compatible enrolled physical device, a stand-alone credit processes independently of any previous transaction (only if that variant was selected)

> **Device-dependent criteria:** AC 18 and AC 19 require a compatible enrolled physical Android
> device and a real card. If no such device is available in this environment, implement AC 1–17 and
> mark AC 18–19 `DEFERRED → TTP Gate 10 (manual device validation)`. Do **not** report PASS on
> them without real approved transactions.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 6 of the Tap to Pay on Android integration: refunds and
stand-alone credit.

Working directory: <project root>

## Transaction parameters (from Step 0 / TTP GATE 5 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
REFUND_APPROACH=<REFUND_APPROACH>            (builtin | programmatic)
REFUND_TYPES=<REFUND_TYPES>                  (referenced_full | referenced_partial | standalone_credit — one or more)
PAYMENT_ENTRY_POINTS=<PAYMENT_ENTRY_POINTS>
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
PROJECT_LANGUAGE=<PROJECT_LANGUAGE>          (java | kotlin)
DEVICE_AVAILABLE=<DEVICE_AVAILABLE>          (yes | no)
MPOS_ACCESSOR=<mpos_accessor>                (from project-plan.md, written by TTP GATE 3)

Reuse `Currency.<TRANSACTION_CURRENCY>` from TTP GATE 5 — do not re-prompt for a currency.

**Every `PaymentApplication.mposUi` in this file's samples means `MPOS_ACCESSOR`.** Gate 5 recorded
which of its three holder branches this project took; on the DI-owned branch there is no
`PaymentApplication` class and emitting that literal will not compile. Substitute, do not create.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context, `payment_entry_points`, TTP GATE 6 notes
2. `$SKILL_DIR/references/ttp/activities/act_TTP_06_implement-refund.md` — the activity definition
3. `$SKILL_DIR/references/ttp/activities/act_TTP_05_implement-charge.md` — the PaymentApplication and
   onActivityResult this gate extends
4. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — import-resolution procedure (import paths
   are NOT published — resolve, do not guess)
5. `$SKILL_DIR/references/ttp/constants/ttp-questions.md` — the verbatim text of `G5a`, the only question
   this gate may ask, and only when the target classes are ambiguous.

## Your task

Implement TTP GATE 6 using the activity file as your primary guide. Prefer the SDK built-in
refund path unless REFUND_APPROACH = programmatic.

Critical constraints:
1. ADD `SummaryFeature.REFUND_TRANSACTION` to the EXISTING `summaryFeatures` set. Never rebuild
   the set — dropping a previously-added feature is a regression, not a refactor.
2. NEVER hardcode a transaction identifier. Take it from the TTP GATE 5 result, persisted storage,
   or the summary screen. Validate null/empty before building parameters.
3. NEVER use a stand-alone credit when the original identifier is available.
3a. **If the stand-alone credit variant is in scope:** its `.customIdentifier(...)` value accepts only
    `^[a-zA-Z0-9_-]{0,256}$` and the builder THROWS `MposRuntimeException` otherwise — see
    `act_TTP_05` Critical Rule 10. That identifier is normally typed by the user, so validate it with
    `isValidTtpCustomIdentifier()` (`act_TTP_05` Step 1b) and reject invalid input with an inline
    error. `.trim()` is not validation: it leaves interior spaces and periods intact. Never rewrite
    the value silently — it is the merchant's reconciliation key.
4. Guard order is `isMposUiReady()` then `isDeviceEnrolled()`. Both show feedback and return.
5. EXTEND Gate 5's existing result site for your UI_TOOLKIT (views: the single `onActivityResult`;
   compose: the single launcher callback plus a `rememberSaveable` discriminator, and NO
   `onActivityResult`) — do not add a second one. Distinguish charge results
   from refund results; a refund's identifier must NOT overwrite the last sale identifier.
6. The refund trigger goes on the **transaction detail page** from Gate 4 (`act_TTP_04` Step 3's
   actions slot) — NOT on any payment screen. Refund targets a specific transaction, so the identifier
   is the selected transaction's. Do NOT wire refund into any file listed in `payment_entry_points`, and
   do NOT use a cached "last transaction" identifier. If Gate 4 was skipped, use the app's own
   transaction detail surface and name it in the report; never fall back to a POS-screen button.
7. Import `io.mpos.transactions.Currency` — never `java.util.Currency` or `com.visa.utils.Currency`.
7a. Take every FQN from `references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names*;
    several types have plausible decoys in `io.mpos.taptophone` or `com.visa.*`.

## Mandatory verification

Run every command below with the Bash tool. Do NOT report PASS until the build succeeds.

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
grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: REFUND_TRANSACTION missing"

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

grep -rn "\.refund(\"" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: hardcoded transaction identifier" || echo "OK"

# customIdentifier literals. Test for a disallowed CHARACTER — never write the SDK's own
# `{0,256}` into grep -E, because BSD grep rejects bounds above 255 and the syntax error looks
# exactly like a clean result (empty stdout, exit 2).
grep -rnoE '\.customIdentifier\("[^"]*"\)' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -E '\.customIdentifier\("[^"]*[^a-zA-Z0-9_"-]' \
  && echo "FAIL: literal above breaks ^[a-zA-Z0-9_-]{0,256}\$ — the builder will throw" \
  || echo "OK: no literal customIdentifier violates the SDK pattern"

# The stand-alone credit identifier is user input — it must be validated, not just trimmed.
if grep -rq 'STANDALONE_CREDIT' "$SOURCE_ROOT" --include="*.kt" --include="*.java"; then
  grep -rq 'isValidTtpCustomIdentifier' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
    && echo "OK: stand-alone credit identifier is validated" \
    || echo "FAIL: stand-alone credit path exists but isValidTtpCustomIdentifier() is missing"
fi

# Result site — branch on UI_TOOLKIT; the wrong check false-fails a correct project.
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -c 'onActivityResult\|startActivityForResult' "$SOURCE_ROOT/<path-to-screen>" | grep -qx 0 \
    && echo "OK: no deprecated result path" \
    || echo "FAIL: Compose screen must not use onActivityResult/startActivityForResult"
  grep -qE 'pendingOperation by rememberSaveable|SavedStateHandle' "$SOURCE_ROOT/<path-to-screen>" \
    && echo "OK: discriminator survives Activity recreation" \
    || echo "FAIL: operation discriminator uses plain remember"
else
  grep -c "onActivityResult" "$SOURCE_ROOT/<path-to-screen>"
  # more than one definition per Activity = FAIL (duplicated instead of extended)
fi
```

<!-- REC-02 -->
**Mandatory verification for the refund trigger (non-skippable):**

Check A — the trigger exists:
```bash
grep -rn "performRefund\|performStandaloneCredit\|btn_refund\|btnRefund" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java"
```
Zero matches = FAIL — refund was not wired.

Check B — it is NOT on a payment screen. Run over the `payment_entry_points` file list:
```bash
for f in $PAYMENT_ENTRY_POINT_FILES; do
  grep -qE 'performRefund|btn_refund|btnRefund' "$f" \
    && echo "FAIL: $f is a payment screen and carries refund wiring" \
    || echo "OK: $f has no refund wiring"
done
```

Check C — the identifier is the selected transaction, not a cached latest:
```bash
grep -rnE 'performRefund\(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -E 'lastTransactionIdentifier|latestTransaction' \
  && echo "FAIL: refund uses a cached latest identifier" || echo "OK"
```

Check D:
```bash
grep -rn "Toast.makeText\|makeText" "$SOURCE_ROOT" --include="*.kt" --include="*.java"
```
If an original handler survives inside a listener that now calls a refund method: HARD FAIL.

<!-- REC-01 -->
**Placement check:** confirm the refund trigger is on the transaction detail page and that **no** screen
from `payment_entry_points` carries refund wiring. The multi-screen requirement applies to *charge*
(Gate 5), which needs a trigger per payment screen — refund is the opposite shape: exactly one trigger,
on the detail page for the transaction being refunded.

If DEVICE_AVAILABLE = yes: install the APK, run a referenced refund against a real prior sale
(and a stand-alone credit if selected), and report the real results.
If DEVICE_AVAILABLE = no: complete AC 1–17, verify the build, and mark the on-device refund and
stand-alone credit DEFERRED → TTP Gate 10 (manual device validation). Do NOT fabricate an
approved refund.

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
TTP GATE 6 REPORT
Status: PASS | FAIL | PASS (on-device refund DEFERRED to TTP Gate 10)
Build: SUCCESS | FAILED
Refund approach: builtin | programmatic
Refund types REQUESTED (copy verbatim from REFUND_TYPES / project-plan.md refund_types): <list>
Refund types IMPLEMENTED, one line each — every requested type needs its own line:
  referenced, full amount:    IMPLEMENTED (<function/file>) | NOT REQUESTED
  referenced, partial amount: IMPLEMENTED (<function/file>) | NOT REQUESTED
  stand-alone credit:         IMPLEMENTED (<function/file>) | NOT REQUESTED
  Requested set fully covered: YES | NO (<which are missing — this is a FAIL, not a note>)
REFUND_TRANSACTION in summaryFeatures: YES | NO
summaryFeatures extended, not replaced: YES | NO (list the full set)
isMposUiReady guard before refund: YES | NO
isDeviceEnrolled guard before refund: YES | NO
No hardcoded transaction identifiers: YES | NO
Identifier validated (null/empty check): YES | NO
Result site extended, not duplicated: YES | NO   (toolkit: views onActivityResult | compose launcher)
Compose discriminator is saveable across Activity recreation: YES | NO | N/A (views)
Charge vs refund results distinguished: YES | NO
Refund trigger location: transaction detail page (<file>) | app's own detail surface (<file>, Gate 4 skipped)
  Any payment_entry_points file carrying refund wiring: NONE | <list — this is a FAIL>
  Refunded identifier source: selected transaction | cached latest (<this is a FAIL>)
Stand-alone credit placement: N/A | behind menu/confirmation (<where>) | sibling of pay button (<FAIL>)
REC-02 Check A (refund wired): PASS | FAIL
REC-02 Check B (not on a payment screen): PASS | FAIL
REC-02 Check C (identifier is the selected transaction): PASS | FAIL
REC-02 Check D (original handler removed): PASS | FAIL
On-device referenced refund: APPROVED | FAILED | DEFERRED (no device)
On-device stand-alone credit: APPROVED | FAILED | N/A | DEFERRED (no device)
Files modified: <list>
Acceptance criteria met: <list>
```
```
