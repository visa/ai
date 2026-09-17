# Activity TTP-9: Implement Account Verification

Implement **account verification** — a card-present check that a card is valid and the account is live,
taking no money. The typical use is card-on-file setup: verify the card at the counter, keep the result,
charge later through another channel.

This is a real Tap to Pay transaction type, not a variation on charge. `io.mpos.taptophone` publishes
exactly three types — `CHARGE`, `REFUND`, `VERIFICATION` — and this gate implements the third. It has its
own builder, reached through **`TransactionParameters.Builder().verification(currency)`**.

> **The industry calls this a "zero-amount" transaction, and that phrase is a trap when you write the
> code.** It describes the *outcome* — no money moves — and not the implementation. It does **not** mean
> "a charge whose amount is zero." `.charge(BigDecimal.ZERO, currency)` compiles and is then **rejected by
> the SDK** with `Amount should be bigger than zero`, because `ChargeBuilder` validates that amount > 0.
> The zero lives inside `VerificationBuilder`, which sets it for you and never takes it from you. See
> Critical Rule 1.

**Reference:** `references/ttp/constants/ttp-sdk-requirements.md` § *What the Tap to Pay path can
initiate — and what it cannot*, § *Builder chains switch type mid-chain*, § *Result handling*,
`references/ttp/troubleshooting.md#ttp-account-verification`

## Critical Rules (NEVER violate these)

1. **NEVER build a verification as a charge of zero. `TransactionParameters.Builder().verification(currency)`
   is the only way to start one.** `.charge(BigDecimal.ZERO, currency)` compiles, and `ChargeBuilder` then
   rejects it — **`Amount should be bigger than zero`** — before any reader screen appears. That is the SDK
   working correctly: a zero-amount charge is not a charge the SDK tolerates, it is an invalid charge.
   `VERIFICATION` is its own transaction type with its own builder, its own reader screens and its own
   result wording, and the SDK will not synthesise one from a charge. If you are writing `BigDecimal.ZERO`
   anywhere in this gate, you are on the wrong path.

   **`.verification(currency)` takes NO amount, and there is no `.amount(...)` to add.**
   `VerificationBuilder` sets `amount = BigDecimal.ZERO` in its own constructor — that is the SDK's job and
   never yours. Do not pass an amount, do not add an amount field to the UI, and do not reuse the charge
   screen's amount input for this. A verification that appears to accept an amount teaches the merchant
   something false about what it does.
2. **Every money-side guard in Gate 5 is inapplicable here, and copying it in is a bug.** No
   `require(amount.scale() == 2)`, no `setScale(2, HALF_UP)`, no `require(amount.signum() > 0)` — that
   last one would reject `BigDecimal.ZERO`, which is the *only* legal value. If you catch yourself
   converting `PAYMENT_AMOUNT_SOURCE` in this gate, stop: this gate has no amount input.
3. **`VerificationBuilder` has no `.subject(...)`, no `.autoCapture(...)`, no `.includedTipAmount(...)`
   and no `.tipAdjustable(...)`.** `ChargeBuilder` has all four; this builder does not. So a
   verification can never be a pre-auth and can never carry a tip — do not offer either on this path,
   and do not route this call through Gate 7's tipping argument.
4. **`.customIdentifier(...)` exists here and throws exactly as it does on charge.** It is validated
   on-device against `^[a-zA-Z0-9_-]{0,256}$` by `assertValidCustomIdentifier`, inside the builder,
   before any Activity launches. A space or a period is a crash, not a decline. Reuse
   `isValidTtpCustomIdentifier()` from `act_TTP_05` Step 1b — do **not** write a second copy of the regex.
5. **Both guards, in order: `isMposUiReady()` then `isDeviceEnrolled()`.** A verification is a
   card-present read on this platform, so an unenrolled phone cannot perform one. Same rule, same order,
   same visible feedback as every other transaction gate.
6. **Extend the existing result site — never add a second one.** Verification returns under the same
   `MposUi.REQUEST_CODE_PAYMENT` as charge and refund. On `views` extend the single `onActivityResult`;
   on `compose` extend Gate 5's single `rememberLauncherForActivityResult` callback and its **saveable**
   operation discriminator. See the constants file § *Result handling*.
7. **A verification result is not a payment result.** `RESULT_CODE_APPROVED` here means "the card is
   valid", **not** "you have been paid". Never render it with payment wording, never add it to a sales
   total, and never let it satisfy a flow that was supposed to take money. This is the most likely way
   this gate causes real damage.
8. **Never present verification as an alternative to charge on the same control.** It belongs on its own
   affordance with its own label, because the merchant-visible outcomes are different in kind. A radio
   group that offers `Charge` and `Account Verification` as peer options is acceptable **only** where the
   app already had one and Gate 5's Question D inventoried it.
9. **This gate is supported-but-thinly-exercised. Say so.** The API is verified against the artifact and
   the reader has its own localised strings for the whole verification flow, but this skill has less
   real-hardware evidence for it than for charge or refund. Report it as `PASS` on the code and defer the
   on-device criterion honestly — do not imply more confidence than the run earned.

## Prerequisites

- `act_TTP_01`, `act_TTP_02` — dependencies and real TEST credentials
- `act_TTP_03` — enrollment, and the durable `MposUi` holder with `mpos_accessor` recorded in
  `project-plan.md`
- `act_TTP_05` — a working charge flow, its result site, and `isValidTtpCustomIdentifier()` from Step 1b.
  This gate extends all three rather than duplicating them

> **If `gate_5_charge` was `skip`** because the project already had a charge flow, find that flow's result
> site and identifier validator and extend those. If no validator exists, add one following `act_TTP_05`
> Step 1b — one copy, shared.

## Workflow

### Step 1: Confirm the currency, and only the currency

Verification needs a `Currency` and nothing else. Reuse the one `act_TTP_05` Step 3 established:

```bash
cd "$GRADLE_ROOT" || exit 1
grep -rn "io\.mpos\.transactions\.Currency\|Currency\.$TRANSACTION_CURRENCY" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build
```

`io.mpos.transactions.Currency` — never `java.util.Currency`, never `com.visa.utils.Currency`. All three
resolve on the compile classpath and only the first satisfies `.verification(...)`. If the file you are
editing already imports `java.util.Currency`, alias or fully-qualify rather than adding a second import
of the same simple name — see `act_TTP_05` Critical Rule 2a.

> **There is no amount question for this gate, and none should be asked.** `TRANSACTION_AMOUNT`,
> `PAYMENT_AMOUNT_SOURCE` and `PAYMENT_AMOUNT_TYPE` are all irrelevant here. If the workflow injected
> them, ignore them; they belong to Gates 5 and 8.

### Step 2: Add `startAccountVerification(identifier)`

One method, in the same class that received `startCharge(...)`. It takes the reconciliation identifier
and nothing else.

`PROJECT_LANGUAGE = kotlin`:

```kotlin
import io.mpos.paybutton.MposUi
import io.mpos.transactions.Currency
import io.mpos.transactions.parameters.TransactionParameters

/**
 * Card-present check that the account is valid. Takes NO money.
 * Its own transaction type — never .charge(BigDecimal.ZERO, ...), which the SDK rejects with
 * "Amount should be bigger than zero". VerificationBuilder sets the zero itself; nothing to pass.
 */
private fun startAccountVerification(identifier: String) {
    // Guard order is fixed: SDK ready, THEN enrolled. Both show feedback and return.
    if (!PaymentApplication.isMposUiReady()) {
        showMessage("Tap to Pay is not ready yet")
        return
    }
    if (!PaymentApplication.isDeviceEnrolled()) {
        showMessage("This device is not enrolled for Tap to Pay")
        goToEnrollment()          // act_TTP_04's Device Status screen
        return
    }

    // Same validator as charge and refund — act_TTP_05 Step 1b. The builder THROWS on a bad value,
    // before any Activity exists, so this check must happen first.
    if (!isValidTtpCustomIdentifier(identifier)) {
        showMessage("Reference may contain only letters, digits, _ and -")
        return
    }

    val params = TransactionParameters.Builder()
        .verification(Currency.<TRANSACTION_CURRENCY>)   // no amount argument — by design
        .customIdentifier(identifier)
        .build()

    lastOperation = TtpOperation.VERIFICATION            // the saveable discriminator, see Step 3
    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    paymentLauncher.launch(intent)                      // Compose: Gate 5's single launcher
}
```

`PROJECT_LANGUAGE = java`:

```java
private void startAccountVerification(String identifier) {
    if (!PaymentApplication.isMposUiReady()) { showMessage("Tap to Pay is not ready yet"); return; }
    if (!PaymentApplication.isDeviceEnrolled()) { showMessage("This device is not enrolled"); goToEnrollment(); return; }
    if (!isValidTtpCustomIdentifier(identifier)) { showMessage("Reference may contain only letters, digits, _ and -"); return; }

    TransactionParameters params = new TransactionParameters.Builder()
            .verification(Currency.<TRANSACTION_CURRENCY>)
            .customIdentifier(identifier)
            .build();

    lastOperation = TtpOperation.VERIFICATION;
    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

> **`.verification(currency)` returns `VerificationBuilder`, not `TransactionParameters.Builder`.** If
> you break the chain into a local variable, declare it `VerificationBuilder` — declaring it as the outer
> `Builder` and then calling `.customIdentifier(...)` does not compile. This SDK switches type mid-chain
> throughout; see the constants file § *Builder chains switch type mid-chain*.

**The identifier's source decides how much of Step 2 is validation.** Where it is a literal you wrote,
the pattern is satisfied by construction. Where the merchant types it — the common case for card-on-file
setup, since it is usually a customer or account reference — the text field needs inline validation and a
disabled action button, exactly as `act_TTP_05` Step 1b describes.

### Step 3: Extend the result site — do not add one

Verification arrives under `MposUi.REQUEST_CODE_PAYMENT`, the same request code as charge and refund. The
discriminator is what tells the three apart.

`UI_TOOLKIT = compose` — extend Gate 5's launcher and its **saveable** discriminator:

```kotlin
// Gate 5 created this enum and this launcher. ADD a member; do not create a parallel launcher.
enum class TtpOperation { CHARGE, REFUND, VERIFICATION }

var lastOperation by rememberSaveable { mutableStateOf(TtpOperation.CHARGE) }

val paymentLauncher = rememberLauncherForActivityResult(StartActivityForResult()) { result ->
    when (result.resultCode) {
        MposUi.RESULT_CODE_APPROVED -> when (lastOperation) {
            TtpOperation.CHARGE       -> onChargeApproved(result.data)
            TtpOperation.REFUND       -> onRefundApproved(result.data)
            TtpOperation.VERIFICATION -> onVerificationApproved(result.data)
        }
        MposUi.RESULT_CODE_FAILED -> when (lastOperation) {
            /* ... */
            TtpOperation.VERIFICATION -> onVerificationFailed(result.data)
            else -> { /* existing branches */ }
        }
    }
}
```

`UI_TOOLKIT = views` — extend the single existing `onActivityResult`:

```kotlin
override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)      // never omit this
    if (requestCode != MposUi.REQUEST_CODE_PAYMENT) return

    when (resultCode) {
        MposUi.RESULT_CODE_APPROVED -> when (lastOperation) {
            TtpOperation.VERIFICATION -> onVerificationApproved(data)
            else -> { /* existing charge / refund branches, untouched */ }
        }
        MposUi.RESULT_CODE_FAILED -> when (lastOperation) {
            TtpOperation.VERIFICATION -> onVerificationFailed(data)
            else -> { /* existing branches, untouched */ }
        }
    }
}
```

**Never check `resultCode == Activity.RESULT_OK`.** The SDK uses `MposUi.RESULT_CODE_APPROVED` and
`MposUi.RESULT_CODE_FAILED`; `RESULT_OK` misses declines that still carry a transaction object.

### Step 4: Handle the result — in verification language, not payment language

This is Critical Rule 7 made concrete. Both handlers must exist and both must show something.

```kotlin
private fun onVerificationApproved(data: Intent?) {
    val identifier = data?.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)
    // "Card verified" — NOT "Payment approved", NOT "Paid". No money moved.
    showMessage("Card verified")
    identifier?.let { persistVerificationReference(it) }
}

private fun onVerificationFailed(data: Intent?) {
    // A decline here means the card or the account was refused, not that a payment failed.
    val status = PaymentApplication.mposUi.latestTransaction?.status
    showMessage("Card could not be verified" + (status?.let { " ($it)" } ?: ""))
}
```

Three specific things not to do, each of which has a plausible-looking wrong version:

| Wrong | Why it is wrong |
|-------|-----------------|
| `showMessage("Payment approved")` | no payment happened; the merchant will believe they were paid |
| adding the result to a running sales total | a zero-amount transaction has nothing to add, and the *count* is misleading in a payments report |
| treating `RESULT_CODE_APPROVED` as satisfying a checkout flow | the order is now marked paid and no funds exist |

**Persist the identifier.** A verification's identifier is the thing that makes it useful later — it is
what a card-on-file record refers to. Store it the same way Gate 5 stores a charge identifier
(`SharedPreferences` or the app's own store), and it will appear in Gate 4's Transactions list like any
other transaction.

### Step 5: The UI affordance

**Its own control, its own label, on the screen where the use case lives.** Card-on-file setup is
typically not the POS screen — it is a customer or account screen. Ask rather than assume:

```
Where should the Account Verification action go?
Options:
  - <the screen the probe found, e.g. CustomerDetailScreen> (recommended) — the card-on-file use
    case usually lives with the customer record, not the till
  - The payment screen (<name>), as a separate button next to Charge — pick this if the merchant
    verifies cards at the counter as part of taking an order
  - An entry in the Tap to Pay menu (act_TTP_04) — pick this if it is an occasional back-office action
```

Whichever is chosen, the label reads **`Verify card`** or **`Account verification`** — never `Pay`,
`Charge`, or an amount. If the app already had a verification control that Gate 5's Question D recorded
as `not-implemented`, **that control is now implemented**: wire it up, remove the disabled state and the
"not implemented in this integration" reason, and say so in the report.

> **Do not reuse the amount input.** If the chosen screen has one, the verification control must not read
> from it. A merchant who types `25.00` and taps `Verify card` has to end up with a zero-amount
> verification, and the screen should make that obvious rather than silently ignoring what they typed.

## Troubleshooting

Verification-specific failures are in `references/ttp/troubleshooting.md#ttp-account-verification`.
Shared setup, network, credential and enrollment failures are in
`references/ttp/troubleshooting.md#tap-to-pay`.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. `startAccountVerification(String)` exists and takes **no amount parameter**
2. The builder chain is `TransactionParameters.Builder().verification(Currency.<TRANSACTION_CURRENCY>)` —
   **no amount argument anywhere on the chain**, and no `setScale`, `signum` or scale `require` in this
   method (Critical Rule 2)
3. `io.mpos.transactions.Currency` is the type used; no `java.util.Currency` collision was introduced
4. Both guards are present in order — `isMposUiReady()` then `isDeviceEnrolled()` — each with visible
   feedback and a graceful `return`
5. The identifier passed to `.customIdentifier(...)` goes through `isValidTtpCustomIdentifier()` **before**
   the builder is constructed, and that function is the **same one** `act_TTP_05` Step 1b defined — no
   second copy of the regex exists in the project
6. The existing result site was **extended**: exactly one `onActivityResult` per Activity (`views`) or one
   `rememberLauncherForActivityResult` (`compose`), with `VERIFICATION` added to the operation
   discriminator, and that discriminator is `rememberSaveable` on Compose
7. `MposUi.RESULT_CODE_APPROVED` / `RESULT_CODE_FAILED` are used — never `Activity.RESULT_OK`
8. `onVerificationApproved` and `onVerificationFailed` both exist and both show user-visible feedback
9. **No approved verification is described with payment wording**, added to a sales total, or used to
   satisfy a checkout flow (Critical Rule 7). Grep the strings this gate added and confirm
10. The verification identifier is persisted where a later lookup can find it
11. The affordance is a distinct control with a verification label, on a screen the developer chose — not
    an unlabelled peer of the pay button, and not wired to an amount input
12. If a previously disabled verification control existed (`unavailable_reason: not-implemented`), it is
    now enabled and its "not implemented" reason string is gone
13. `VerificationBuilder` was not asked for `.subject(...)`, `.autoCapture(...)`,
    `.includedTipAmount(...)` or `.tipAdjustable(...)` — none of those exist on it (Critical Rule 3)
14. The project builds successfully (`$GRADLE_MODULE_PATH:assembleDebug`)
15. On a compatible enrolled device, a real card tap returns `RESULT_CODE_APPROVED` and the app shows
    verification wording

> **Device-dependent criterion:** AC 15 needs real hardware and a real card. When
> `DEVICE_AVAILABLE = no`, implement AC 1–14 and report AC 15 as
> `DEFERRED → TTP Gate 10 (manual device validation)`. Do **not** report a verified card you did not
> verify — and per Critical Rule 9, state plainly that this path has less hardware evidence behind it
> than charge and refund.

---

## Agent Prompt Template

```
You are implementing account verification — a card-present check that takes no money — in an existing
Android app that already takes Tap to Pay payments. It is its own SDK transaction type, built with
`TransactionParameters.Builder().verification(currency)`, and it is NOT a charge of zero.
Read the activity file in full before writing code.

Activity file: "$SKILL_DIR/references/ttp/activities/act_TTP_09_implement-account-verification.md"

## Inputs injected by the workflow

SKILL_DIR=<SKILL_DIR>                        (ABSOLUTE path to this skill. EVERY `references/...`
                                             path is relative to it, NOT to the project.)
GRADLE_ROOT=<GRADLE_ROOT>                    (ABSOLUTE)
GRADLE_MODULE_PATH=<GRADLE_MODULE_PATH>      (e.g. :app — may be empty)
GRADLE_ARGS=<GRADLE_ARGS>                    (extra args EVERY build command must carry, or "")
ANDROID_MODULE_DIR=<ANDROID_MODULE_DIR>      (NOT necessarily "app")
SOURCE_ROOT=<SOURCE_ROOT>                    (may be src/main/kotlin, not src/main/java)
PROJECT_LANGUAGE=<PROJECT_LANGUAGE>          (java | kotlin)
UI_TOOLKIT=<UI_TOOLKIT>                      (views | compose | mixed)
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>  (the ONLY transaction parameter this gate needs)
DEVICE_AVAILABLE=<DEVICE_AVAILABLE>          (yes | no)
MPOS_ACCESSOR=<mpos_accessor>                (from project-plan.md, written by TTP GATE 3. Substitute
                                             it for every literal PaymentApplication.mposUi below.)
PAYMENT_ENTRY_POINTS=<PAYMENT_ENTRY_POINTS>  (context for Step 5's placement question — NOT a
                                             list of screens to add a verification button to)
BASELINE_QUALITY_TASK=<BASELINE_QUALITY_TASK>            (the KOTLIN tool, from Gate 0)
BASELINE_QUALITY_FINDINGS=<BASELINE_QUALITY_FINDINGS>    (count + rule types at HEAD)
BASELINE_QUALITY_TASK_2=<BASELINE_QUALITY_TASK_2>        (the ANDROID tool, from Gate 0)
BASELINE_QUALITY_FINDINGS_2=<BASELINE_QUALITY_FINDINGS_2>  (count + rule types at HEAD)

There is deliberately NO amount variable here. `.verification(currency)` takes no amount and
`VerificationBuilder` sets BigDecimal.ZERO itself. If you find yourself reaching for
TRANSACTION_AMOUNT or PAYMENT_AMOUNT_SOURCE, re-read Critical Rules 1 and 2.

## Your task

Implement TTP GATE 9 using the activity file as your primary guide.

Critical constraints:
1. `.verification(Currency.<TRANSACTION_CURRENCY>)` — no amount argument, no `.amount(...)` call, and
   no amount-scaling or positive-amount guard anywhere in this gate's code.
1a. NEVER implement this as `.charge(BigDecimal.ZERO, currency)`. It compiles and the SDK rejects it
   with "Amount should be bigger than zero" — ChargeBuilder validates amount > 0. "Zero-amount" names
   the outcome, not the call: VERIFICATION is a separate transaction type with its own builder, and
   `.verification(...)` sets the zero internally. `BigDecimal.ZERO` should not appear in your code at
   all in this gate.
2. `.verification(...)` returns `VerificationBuilder`. It has `customIdentifier`, `metadata`,
   `workflow`, `partnerSolutionId`, `merchantDetails`, `build()` — and NOT `subject`, `autoCapture`,
   `includedTipAmount` or `tipAdjustable`. Do not call what is not there, and do not route this
   through tipping or pre-auth.
3. Validate the identifier with the EXISTING `isValidTtpCustomIdentifier()` from act_TTP_05 Step 1b,
   before constructing the builder. The builder throws on a bad value — that is a crash, not a
   decline. Never write a second copy of the regex.
4. Guard order `isMposUiReady()` then `isDeviceEnrolled()`, both with visible feedback and a return.
5. EXTEND the existing result site; add `VERIFICATION` to the operation discriminator. On compose the
   discriminator must be `rememberSaveable`, and do NOT reintroduce `onActivityResult`.
6. Result wording is verification wording. "Card verified", never "Payment approved". Do not add the
   result to any sales total and do not let it satisfy a checkout flow. This is the rule whose
   violation does real damage.
7. Persist the returned transaction identifier.
8. Ask the Step 5 placement question before writing UI. Do not assume the payment screen, and do not
   wire the control to an amount input.
9. If a disabled "Account Verification" control already exists from Gate 5's Question D inventory,
   enable it and delete its "not implemented in this integration" reason.
10. All paths from ANDROID_MODULE_DIR / SOURCE_ROOT. Never hardcode `app/`.
11. Resolve every API name from
    "$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md". Do not invent members.
```

---

## Mandatory verification

Run every check. Report each result verbatim; a check you did not run is a `FAIL`.

```bash
# Path preamble — see references/ttp/constants/ttp-sdk-requirements.md § Project Path Variables
cd "$GRADLE_ROOT" || exit 1
[ -n "$SOURCE_ROOT" ] && [ -d "$SOURCE_ROOT" ] \
  || { echo "FAIL: SOURCE_ROOT unset or missing — re-read project-plan.md"; exit 1; }

# 1. The builder entry point exists and is reached.
grep -rn '\.verification(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  && echo "OK: .verification( present" \
  || echo "FAIL: no .verification( call — this gate wrote nothing, or it was built as a zero charge (check 1a)"

# 1a. The zero-amount-charge mistake. Critical Rule 1. This one is GREEN at build time and the SDK
#     rejects it at runtime with "Amount should be bigger than zero", so grep is the earliest signal.
grep -rnE '\.charge\([[:space:]]*(BigDecimal\.ZERO|BigDecimal\.valueOf\([[:space:]]*0[[:space:]]*\)|new BigDecimal\([[:space:]]*"?0(\.0+)?"?[[:space:]]*\))' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  && echo "FAIL: a zero-amount .charge( — the SDK rejects this with 'Amount should be bigger than zero'. Use .verification(currency), Critical Rule 1" \
  || echo "OK: no zero-amount charge"

# 1b. BigDecimal.ZERO has no legitimate use in this gate at all — the builder supplies it.
grep -rn 'BigDecimal\.ZERO' "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  | grep -viE 'startCharge|preAuth|preauthor|capture|refund' \
  && echo "CHECK: BigDecimal.ZERO appears — if it is on the verification path, delete it (Critical Rule 1)" \
  || echo "OK: no stray BigDecimal.ZERO on this path"

# 2. NO amount reached the verification chain. Critical Rules 1 and 2.
#    Check the verification call itself and the three lines after it.
grep -rn -A3 '\.verification(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  | grep -E 'setScale|signum|BigDecimal\(|amount' \
  && echo "FAIL: an amount or an amount guard appears on the verification path" \
  || echo "OK: no amount on the verification path"

# 3. The verification method takes no amount parameter.
grep -rn 'fun startAccountVerification\|void startAccountVerification' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  | grep -E 'BigDecimal|Double|Float|amount' \
  && echo "FAIL: startAccountVerification takes an amount — it must not" \
  || echo "OK: startAccountVerification takes no amount"
```

```bash
# 4. Members that do NOT exist on VerificationBuilder. Critical Rule 3.
#    A hit here is a compile error waiting on the next build, or a wrong-type chain.
for M in subject autoCapture includedTipAmount tipAdjustable; do
  grep -rn -A4 '\.verification(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
    --exclude-dir=build | grep -q "\.$M(" \
    && echo "FAIL: .$M( on a verification chain — VerificationBuilder has no such member" \
    || echo "OK: no .$M( on the verification chain"
done

# 5. ONE identifier validator in the whole project — not a second copy of the regex.
VALIDATORS=$(grep -rn 'a-zA-Z0-9_-\]{0,256}' "$SOURCE_ROOT" \
  --include="*.kt" --include="*.java" --exclude-dir=build | wc -l | tr -d ' ')
echo "customIdentifier regex definitions: $VALIDATORS"
[ "$VALIDATORS" = "1" ] \
  || echo "FAIL: expected exactly 1 (act_TTP_05 Step 1b's) — a second copy is a second thing to drift"

# 6. The validator is actually CALLED before the builder on this path.
grep -rn -B6 '\.verification(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  --exclude-dir=build | grep -q 'isValidTtpCustomIdentifier' \
  && echo "OK: the identifier is validated before the builder" \
  || echo "CHECK: no isValidTtpCustomIdentifier above the builder — a FAIL unless the identifier is a literal in this gate's own code"
```

```bash
# 7. The result site was EXTENDED, not duplicated.
echo "onActivityResult overrides: $(grep -rc 'override fun onActivityResult\|public void onActivityResult' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')"
echo "rememberLauncherForActivityResult sites: $(grep -rc 'rememberLauncherForActivityResult' \
  "$SOURCE_ROOT" --include="*.kt" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')"
echo "  -> compare against the count BEFORE this gate. Any increase is a duplicate result site, not an extension."

if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -rn 'onActivityResult\|startActivityForResult' "$SOURCE_ROOT" --include="*.kt" \
    --exclude-dir=build \
    && echo "FAIL: deprecated result API reintroduced on a Compose project" \
    || echo "OK: no deprecated result API"
  grep -rn 'rememberSaveable' "$SOURCE_ROOT" --include="*.kt" --exclude-dir=build \
    && echo "OK: a saveable discriminator exists" \
    || echo "FAIL: the operation discriminator is not rememberSaveable — it is lost on process death"
fi

# 8. RESULT_OK must not be used as the approval test.
grep -rn 'RESULT_OK' "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  && echo "FAIL: use MposUi.RESULT_CODE_APPROVED / RESULT_CODE_FAILED" \
  || echo "OK: no RESULT_OK"
```

```bash
# 9. Critical Rule 7 — no payment wording on the verification path. The damaging failure mode.
grep -rn -A6 'onVerificationApproved' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  --exclude-dir=build | grep -iE 'paid|payment (approved|complete|success)|purchase (complete|approved)|charged' \
  && echo "FAIL: payment wording on an approved verification — no money moved" \
  || echo "OK: verification wording only"

# Both handlers exist and neither is an empty stub.
for H in onVerificationApproved onVerificationFailed; do
  grep -rq "$H" "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
    && echo "OK: $H exists" || echo "FAIL: $H missing"
done

# 10. A previously disabled verification control must no longer advertise itself as unimplemented.
grep -rniE 'not implemented in this integration' "$SOURCE_ROOT" \
  "$ANDROID_MODULE_DIR/src/main/res" 2>/dev/null \
  | grep -i 'verif' \
  && echo "FAIL: a verification control still carries its not-implemented reason — AC 12" \
  || echo "OK: no stale not-implemented reason on a verification control"
```

```bash
# 11. Build. Redirect, capture, then read — never pipe.
# See references/ttp/constants/ttp-sdk-requirements.md § CRITICAL — never pipe the build command
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
  > /tmp/ttp-g9-build.log 2>&1
BUILD_EXIT=$?
tail -30 /tmp/ttp-g9-build.log
[ "$BUILD_EXIT" -eq 0 ] \
  && echo "BUILD OK (exit 0)" \
  || echo "BUILD FAILED (exit $BUILD_EXIT) — this gate is FAIL"
```

### Quality-gate diff (mandatory when the project has one)

This gate writes only Kotlin/Java, so re-run the **Kotlin** baseline task. Skip the Android `lint` task
unless Step 5's placement added a resource file.

```bash
[ -n "$BASELINE_QUALITY_TASK" ] && [ "$BASELINE_QUALITY_TASK" != "none" ] && {
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:$BASELINE_QUALITY_TASK" \
    > /tmp/ttp-g9-quality.log 2>&1
  echo "$BASELINE_QUALITY_TASK exit $?"
  tail -40 /tmp/ttp-g9-quality.log
}
```

The pass condition is **no new rule types and no findings in files this gate created** — never an
absolute pass. Name which task you re-ran; "quality gate: no new findings" without the task name is
unfalsifiable.

---

## Required report

```
TTP GATE 9 REPORT (account verification)
Status: PASS | FAIL | PASS (on-device verification DEFERRED to TTP Gate 10) | SKIP | DECLINED
Confidence note: this path is API-verified but thinly exercised on hardware (Critical Rule 9) — stated: YES
Method added: startAccountVerification(<params>) in <file>
  Takes an amount: NO (any other answer is a FAIL)
Builder chain: TransactionParameters.Builder().verification(Currency.<CUR>)<other members>
  Built via .verification(...), NOT .charge(BigDecimal.ZERO, ...): YES (any other answer is a FAIL)
  Amount or amount guard anywhere on the chain: NO | YES (FAIL)
  Members called that VerificationBuilder does not have: none | <list> (FAIL)
Currency type: io.mpos.transactions.Currency | OTHER (FAIL)
  java.util.Currency collision handled by: alias | fully-qualified | N/A (no collision)
Guards: isMposUiReady() then isDeviceEnrolled(), in that order — YES | NO
Identifier validation: isValidTtpCustomIdentifier() called before the builder — YES | N/A (literal only)
  Regex definitions in the project: 1 (any other number is a FAIL)
Result site: EXTENDED <file> (views onActivityResult | compose launcher) | ADDED A SECOND ONE (FAIL)
  Discriminator: <enum name>, VERIFICATION added — rememberSaveable: YES | N/A (views)
  RESULT_CODE_APPROVED / RESULT_CODE_FAILED used, not RESULT_OK: YES | NO
Handlers: onVerificationApproved <feedback text> / onVerificationFailed <feedback text>
  Payment wording used anywhere on this path: NO | YES (FAIL — no money moved)
  Result added to a sales total or used to satisfy a checkout: NO | YES (FAIL)
Identifier persisted to: <location>
UI affordance: <control> on <screen> — placement chosen by the developer at Step 5: YES
  Label: <text> (must not read Pay / Charge / an amount)
  Wired to an amount input: NO | YES (FAIL)
Pre-existing disabled verification control: NONE | ENABLED (<file>, not-implemented reason removed)
Build: SUCCESS | FAILED
Quality diff vs Gate 0 baseline: <task>: <n> vs <baseline n> — new rule types: <n — must be 0>
On-device verification: APPROVED | DECLINED (<status>) | DEFERRED (no device) | BLOCKED (placeholder credentials)
Files created/modified: <list>
Acceptance criteria met: <list>
```
