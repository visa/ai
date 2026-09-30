# Activity TTP-7: Implement On-Reader Tipping

Add on-reader tipping to an existing Tap to Pay charge flow: before the card is presented, the
phone prompts the shopper for a tip. This activity **modifies the existing
`createTransactionIntent()` call site** from Activity TTP-5 — it does not create a new payment
flow. Write code directly to project files; do not just print code examples in the chat.

**Reference:** [Tap to Pay on Android Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-payment-txn-intro.md) (Sale with On-Reader Tipping section), [Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md), `references/ttp/troubleshooting.md#ttp-tipping`, `references/ttp/constants/ttp-sdk-requirements.md`

## Critical Rules (NEVER violate these)

1. **Tipping parameters NEVER go on `.charge()`.** They live in `TippingProcessStepParameters`, wrapped in `TransactionProcessParameters`, and are passed as the **second** argument to `createTransactionIntent(transactionParameters, processParameters)`. `TransactionParameters` stays exactly as Activity TTP-5 built it.
2. **Omitting the second argument silently disables tipping.** `createTransactionIntent(params)` still compiles and still takes a payment — there is no error, no warning, and no tip screen. This is the single most likely way for this activity to appear complete while doing nothing.
3. **On-receipt tipping / tip adjust is NOT part of the documented Tap to Pay on Android surface — but the symbols DO exist, so the compiler will not stop you.** The Payment Services documentation lists on-reader tipping only. However `ChargeBuilder.tipAdjustable(boolean)`, `TransactionParameters.Builder.adjustTip(String, BigDecimal, Currency)` (returning `TipAdjustBuilder`) and `SummaryFeature.ADJUST_TIP` are all published by the SDK and compile fine. Do **not** port them from a terminal-based integration on the assumption that a compile error would catch a mistake — it will not; the failure would surface at the gateway or not at all. If a tip must be added after the card is presented, that is a pre-authorization followed by a partial or increased capture — see `act_TTP_08`. If a developer specifically asks for tip adjust on Tap to Pay, say that it is outside the documented surface and unverified here, rather than that it is impossible.
4. **The tip amount is absent when the shopper declines.** Null-check before using it. A shopper who taps "no tip" is a normal, successful transaction, not an error.
5. **The transaction amount is the TOTAL, not the base.** With a tip added, the amount authorized is what the shopper approved — base + tip. To display or reconcile the base, subtract the tip. Reporting the transaction amount as the item price is a reconciliation bug that surfaces days later.
6. **`.maxTipAmount(...)` exists — but only on two of the five tipping builders.** It is published on `AskForTipAmountStepParametersBuilder` and `AskForTotalAmountStepParametersBuilder`, alongside `maxTipPercentage(...)`. It is **not** available on the percentage-choice, percentage-amount, or fixed-percentage builders — those bound a tip with `maxPercentage(...)` where they support it at all. So a tip ceiling is available when the shopper types an amount, and is expressed as a percentage when the shopper picks a percentage. See `references/ttp/constants/ttp-sdk-requirements.md` § *Tipping builders* for the full per-builder member list, verified against the SDK artifact.
7. **Edit the existing call site — never add a parallel payment method.** Two payment paths where one is tipped and one is not is how a shop ends up silently taking untipped payments from half its screens.

    **And there is no app-side tip control to reconcile it with — the reader already has one.** When
    tipping is enabled, **every** charge call site uses the two-argument overload, unconditionally. Do not
    add an in-app tip-mode selector, an "Add tip" toggle, or a `TipMode` parameter on `startCharge`.

    The reason is not style, it is duplication: the SDK's own tipping screen presents a **"No Tip"**
    option in every entry mode — the percentage-choice screen and the typed tip-amount / total-amount
    screens all carry it. Declining the tip is already a first-class choice *on the reader*, made by the
    person standing in front of it. An app-side control for the same decision is custom logic that can
    only drift from the screen it duplicates, and it moves the decision to the wrong moment (before the
    card is presented) and often the wrong person.

    ```kotlin
    // Tipping enabled -> ONE charge function, ONE builder, ONE launch site, and the tipped overload
    // every time. The shopper declines on the reader if they want to.
    fun startCharge(amount: BigDecimal, identifier: String) {
        val params = buildChargeParams(amount, identifier)
        launcher.launch(mposUi.createTransactionIntent(params, createTippingParams()))
    }
    ```

    > **Tipping is a configuration decision, taken once, at Step 0.** `Q8` decides whether this gate runs
    > at all and `Q8a` fixes the entry mode. Neither is a runtime choice, so neither belongs in the app's
    > UI. If the developer declines tipping, this gate does not run *and* any existing tip-mode control is
    > **removed** — see `act_TTP_05` Question D2. A control whose every state is either unsupported or
    > forced is not a control.

8. **NEVER hardcode `app/`, `src/main/java/`, or `res/layout/`.** Use `$ANDROID_MODULE_DIR` and `$SOURCE_ROOT` from `project-plan.md`, and branch on `$UI_TOOLKIT` — a Compose project has no layout XML and no `findViewById`. A grep against a path that does not exist returns zero matches with exit status 1, which is indistinguishable from "checked and clean": that is how a verification step passes on a project it never read. Confirm each path exists before believing a zero-match result.

## Prerequisites

Before starting this activity, the developer must have completed:

- `act_TTP_05` — a working charge flow with `TransactionParameters` and a
  `createTransactionIntent()` call, plus `PaymentApplication` with `isMposUiReady()` and
  `isDeviceEnrolled()`

Reuse the currency and amount source established in `act_TTP_05`; only ask if none was established.

## Workflow

Follow these steps in order. **All code changes must be written directly to project files using
the Edit or Write tools.**

### Step 1: Verify the existing charge implementation

**Do NOT assume a charge flow exists.**

**If Gate 5 ran in this session, the answer is already known — do NOT ask.** Verify it from the code
instead (`grep -rn 'startCharge(' "$SOURCE_ROOT"`) and continue. Asking a developer to confirm
something you watched happen two gates ago is how this workflow ends up feeling like it lost track.

**Only when running standalone**, ask **`G6a`** from
`$SKILL_DIR/references/ttp/constants/ttp-questions.md` § *Gate-local questions*, verbatim.

If **No** or **Not sure**: route to `act_TTP_05` and **stop**. Tipping has nothing to attach to.

If **Yes**: continue.

### Step 2: Establish the tipping strategy

**If `TIP_ENTRY_MODE` was provided by the workflow, use it and do NOT ask.** Step 0 owns this
question (`Q8a`, with its follow-ups `Q8b` and `Q8c`) and injects the answer into this gate. The same
applies to `TIP_PERCENTAGES` and `TIP_MAX_AMOUNT`.

**Only when running standalone**, ask **`G6b`** from
`$SKILL_DIR/references/ttp/constants/ttp-questions.md` § *Gate-local questions* — which routes you to
`Q8a`/`Q8b`/`Q8c` in the same bank, so the standalone wording is identical to the workflow wording.

> **This step used to restate the question in its own words**, so a developer who answered `Q8a` in
> Step 0 met a differently-worded version of the same question here — same decision, different labels,
> no indication the two were related. That is the drift this bank exists to stop.

Store the answers for Step 4.

### Step 3: Locate the payment code

```bash
grep -rn "createTransactionIntent" "$SOURCE_ROOT" --include="*.kt" --include="*.java"
```

Read every matching file. **Every** call site that starts a charge must be updated — a call site
left at one argument keeps taking untipped payments. Note which are charges (they will be updated)
and which are refunds or captures (they must **not** get tipping parameters).

### Step 4: Add a `createTippingParams()` helper

Add a helper that returns `TransactionProcessParameters`. The verified fully-qualified names are in
`references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names* — use them rather than
guessing:

```kotlin
import io.mpos.transactionprovider.processparameters.TransactionProcessParameters
import io.mpos.transactionprovider.processparameters.steps.tipping.TippingProcessStepParameters
```

Map the strategy from Step 2 to exactly one `askFor*` call. **`TippingProcessStepParameters.Builder()`
is a selector, not a configurable builder** — each `askFor*` method returns a *different*
specialised builder, and the configuration methods live on that returned type:

| Strategy from Step 2 | Selector call | Returns | Ceiling option |
|---|---|---|---|
| Percentage choice | `.askForPercentageChoice()` | `AskForTipPercentageChoiceStepParametersBuilder` | none (`percentages(...)`, `custom(...)`) |
| Ask for tip amount | `.askForTipAmount()` | `AskForTipAmountStepParametersBuilder` | `maxTipAmount(...)` / `maxTipPercentage(...)` |
| Ask for total amount | `.askForTotalAmount()` | `AskForTotalAmountStepParametersBuilder` | `maxTipAmount(...)` / `maxTipPercentage(...)` |

Two more selectors exist and are available if a developer asks for them:
`.askForPercentageAmount()` → `AskForPercentageAmountStepParametersBuilder` (`minPercentage`,
`maxPercentage`) and `.askForFixedPercentageAmount()` → `AskForFixedPercentageStepParametersBuilder`
(`fixedPercentage`).

Each specialised builder's `.build()` returns `TippingProcessStepParameters`, which is then wrapped:
`TransactionProcessParameters.Builder().addStep(step).build()`. That builder has exactly two members,
`addStep(...)` and `build()`.

The unbroken chain below compiles. Extracting an intermediate variable typed as
`TippingProcessStepParameters.Builder` and then calling `.showTotalAmountConfirmationScreen(...)` on
it will not — the same mid-chain type switch as `TransactionParameters.Builder.charge()`. See
`references/ttp/constants/ttp-sdk-requirements.md` § *Builder chains switch type mid-chain*.

**Kotlin:**
```kotlin
private fun createTippingParams(): TransactionProcessParameters {
    val tipStep = TippingProcessStepParameters.Builder()
        // Use exactly ONE of the following, per Step 2:
        .askForPercentageChoice()
        //   .percentages(BigDecimal("10"), BigDecimal("20"), BigDecimal("30"))
        //   ↑ include ONLY if the developer chose custom percentages in Step 2.
        //     Omit the call entirely to accept the SDK defaults.
        // .askForTipAmount()
        // .askForTotalAmount()
        .showTotalAmountConfirmationScreen(true)
        .build()

    return TransactionProcessParameters.Builder()
        .addStep(tipStep)
        .build()
}
```

**Java:**
```java
private TransactionProcessParameters createTippingParams() {
    TippingProcessStepParameters tipStep = new TippingProcessStepParameters.Builder()
            // Use exactly ONE of the following, per Step 2:
            .askForPercentageChoice()
            //   .percentages(new BigDecimal("10"), new BigDecimal("20"), new BigDecimal("30"))
            //   ↑ include ONLY for custom percentages; omit for SDK defaults.
            // .askForTipAmount()
            // .askForTotalAmount()
            .showTotalAmountConfirmationScreen(true)
            .build();

    return new TransactionProcessParameters.Builder()
            .addStep(tipStep)
            .build();
}
```

Add `.maxTipAmount(BigDecimal("<TIP_MAX_AMOUNT>"))` **only** when `TIP_MAX_AMOUNT` is non-null **and**
the strategy is tip-amount or total-amount. It does not exist on the percentage-choice builder — see
Critical Rule 6.

### Step 5: Change `createTransactionIntent()` from one argument to two

Use the **`Edit`** tool on the existing call site inside `startCharge()`. Do not create a second
payment method.

**Before:**
```kotlin
val intent = PaymentApplication.mposUi.createTransactionIntent(params)
```

**After (Kotlin):**
```kotlin
val intent = PaymentApplication.mposUi.createTransactionIntent(
    params,
    createTippingParams()
)
```

**After (Java):**
```java
Intent intent = PaymentApplication.getMposUi().createTransactionIntent(
        params,
        createTippingParams()
);
```

`params` is unchanged — still `.charge(amount, Currency.<CODE>).customIdentifier(...)` from
`act_TTP_05`. Apply this to every **charge** call site found in Step 3, and to none of the refund
or capture call sites.

### Step 6: Extend the result handler to read the tip

The tip travels back on the approved transaction, alongside the total amount.

> **The tip accessor is confirmed.** `io.mpos.transactions.Transaction.getDetails()` returns
> `io.mpos.transactions.TransactionDetails`, which publishes
> `getIncludedTipAmount(): BigDecimal` — so `transaction.details.includedTipAmount` is correct, and
> nullable when the shopper declined. (`TransactionDetails` also exposes `getCashbackAmount()` and
> `getTipAdjustStatus()`.) Verified against the SDK version recorded in
> `references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names*.
>
> If the project resolves a different SDK version, re-confirm before trusting it:
>
> ```bash
> javap -cp "$CP" io.mpos.transactions.TransactionDetails | grep -i "tip\|amount"
> ```
>
> Keep the `?.` on `mposUi.latestTransaction` — `getLatestTransaction()` is `@Nullable`.

**Kotlin:**
```kotlin
private fun onChargeApproved(transaction: Transaction?) {
    Toast.makeText(this, "Payment approved", Toast.LENGTH_SHORT).show()
    transaction ?: return

    val totalAmount = transaction.amount                       // base + tip
    val tipAmount = transaction.details.includedTipAmount      // null when the shopper declined

    val baseAmount = if (tipAmount != null) totalAmount.subtract(tipAmount) else totalAmount

    // Display/reconcile with baseAmount and tipAmount — never treat totalAmount as the item price.
}
```

**Java:**
```java
private void onChargeApproved(Transaction transaction) {
    Toast.makeText(this, "Payment approved", Toast.LENGTH_SHORT).show();
    if (transaction == null) {
        return;
    }

    BigDecimal totalAmount = transaction.getAmount();                        // base + tip
    BigDecimal tipAmount = transaction.getDetails().getIncludedTipAmount();  // null if declined

    BigDecimal baseAmount =
            (tipAmount != null) ? totalAmount.subtract(tipAmount) : totalAmount;
}
```

A declined tip is a successful transaction. Do not show an error and do not retry.

### Step 7: Build and verify

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

A passing build is the acceptance signal for the imports and for the tip accessor resolved in
Step 6.

```bash
# The tipping step must exist
grep -rn "TippingProcessStepParameters" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: tipping parameters missing"

# The two-argument intent — this is the check that catches a silently untipped flow
grep -rn "createTransactionIntent" "$SOURCE_ROOT" --include="*.kt" --include="*.java"
# When tipping is enabled there is exactly ONE legitimate shape: every charge call site passes TWO
# arguments. There is no app-side tip control to branch on — the reader's own screen carries "No Tip"
# in every entry mode, so declining a tip is the shopper's choice at the reader, not the app's.
# ANY remaining one-argument createTransactionIntent on a charge path = FAIL.

# Exactly one askFor* strategy per tipping step
grep -rn "askForPercentageChoice\|askForTipAmount\|askForTotalAmount" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java"

# On-receipt tipping must NOT have been ported
grep -rn "tipAdjustable\|adjustTip\|ADJUST_TIP" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: on-receipt tipping is not supported on Tap to Pay" || echo "OK"

# The tip must be read and null-checked
grep -rn "includedTipAmount\|IncludedTipAmount" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: tip amount never read"
```

## Troubleshooting

See `references/ttp/troubleshooting.md#ttp-tipping` for tipping-specific failures: missing
`TippingProcessStepParameters` import, `createTransactionIntent` called with one argument instead
of two, the tip screen never appearing, a null tip when the shopper declined, a base amount
computed from the total, and `cannot find symbol adjustTip` from porting on-receipt tipping.
Shared setup failures are in `references/ttp/troubleshooting.md#tap-to-pay`; charge-flow failures
are in `references/ttp/troubleshooting.md#ttp-charge`.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. The existing charge implementation was confirmed with the developer before any code was written
2. A tipping strategy was selected via `AskUserQuestion` (percentage choice / tip amount / total amount)
3. A `createTippingParams()` helper exists and returns `TransactionProcessParameters` built from a `TippingProcessStepParameters` step via `.addStep(...)`
4. Exactly **one** of `.askForPercentageChoice()`, `.askForTipAmount()`, `.askForTotalAmount()` is used
5. `.percentages(...)` is present **only** if the developer chose custom percentages; otherwise it is omitted so the SDK defaults apply
6. `.maxTipAmount(...)` is absent unless it was confirmed to exist on the artifact's builder
7. **Every charge call site passes two arguments** — `createTransactionIntent(params, processParams)` —
   with **no** one-argument call left on any charge path, and no second parallel charge function
7a. **No app-side tip control exists.** No tip-mode selector, no "Add tip" toggle, and no `tipMode`
   parameter threaded into the charge function. The SDK's tipping screen presents "No Tip" itself in every
   entry mode, so an in-app equivalent duplicates a reader-side choice, can drift from it, and asks the
   wrong person at the wrong moment. Any pre-existing tip-mode control was **removed**, not guarded — see
   `act_TTP_05` Question D2
8. Refund and capture call sites did **not** receive tipping parameters
9. `TransactionParameters` was left unchanged — no tipping method was added to `.charge(...)`
10. All required imports resolve and the code compiles
11. The result handler reads the tip from the transaction's details and the total from the transaction amount
12. The tip is **null-checked** before use, and a declined tip is treated as a successful transaction
13. The base amount is derived as total − tip; the total is never presented as the item price
14. No `.tipAdjustable(...)`, `.adjustTip(...)` or `ADJUST_TIP` appears anywhere — on-receipt tipping is not part of this platform's surface
15. The existing call site was **edited**, not duplicated — there is no parallel untipped payment method
16. **Build was executed and passes** — `$GRADLE_MODULE_PATH:assembleDebug` was actually run with the Bash tool and succeeded
17. On a compatible enrolled physical device, the tip prompt displays during the NFC flow and the selected/entered tip is included in the approved amount

> **Device-dependent criteria:** AC 17 requires a compatible enrolled physical Android device. If
> no such device is available in this environment, implement AC 1–16 and mark AC 17
> `DEFERRED → TTP Gate 10 (manual device validation)`. Do **not** report PASS on AC 17 without
> seeing the tip screen on a real device.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 7 of the Tap to Pay on Android integration: on-reader tipping.

Working directory: <project root>

## Tipping configuration (from Step 0 — do NOT ask for these again)

TIP_ENTRY_MODE=<TIP_ENTRY_MODE>              (percentage | tip_amount | total_amount)
TIP_PERCENTAGES=<TIP_PERCENTAGES>            (three values, or null for SDK defaults)
TIP_MAX_AMOUNT=<TIP_MAX_AMOUNT>              (value, or null — see the constraint below)
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

**Every `PaymentApplication.mposUi` in this file's samples means `MPOS_ACCESSOR`.** Gate 5 recorded
which of its three holder branches this project took; on the DI-owned branch there is no
`PaymentApplication` class and emitting that literal will not compile. Substitute, do not create.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context and TTP GATE 7 notes
2. `$SKILL_DIR/references/ttp/activities/act_TTP_07_implement-tipping.md` — the activity definition
3. `$SKILL_DIR/references/ttp/activities/act_TTP_05_implement-charge.md` — the charge flow this gate modifies
4. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — import-resolution procedure (import paths
   are NOT published — resolve, do not guess)
5. `$SKILL_DIR/references/ttp/constants/ttp-questions.md` — the verbatim text of `G6a` and `G6b`. Both
   are **standalone-only**: when `TIP_ENTRY_MODE` was injected, or Gate 5 ran in this session, do not ask.

## Your task

Implement TTP GATE 7 using the activity file as your primary guide. This gate MODIFIES the
existing charge call site — it does not add a new payment flow.

Critical constraints:
1. Add a `createTippingParams()` helper returning `TransactionProcessParameters` with a
   `TippingProcessStepParameters` step. Map TIP_ENTRY_MODE to exactly one builder call:
     percentage    → .askForPercentageChoice()
     tip_amount    → .askForTipAmount()
     total_amount  → .askForTotalAmount()
2. If TIP_ENTRY_MODE = percentage AND TIP_PERCENTAGES is not null, add
   `.percentages(BigDecimal("<p1>"), BigDecimal("<p2>"), BigDecimal("<p3>"))` immediately after
   `.askForPercentageChoice()`. If TIP_PERCENTAGES is null, OMIT `.percentages(...)` so the SDK
   defaults apply.
3. Add `.showTotalAmountConfirmationScreen(true)` before `.build()`.
4. TIP_MAX_AMOUNT: `.maxTipAmount(...)` is NOT documented for Tap to Pay on Android. Do not write
   it on the assumption it exists. If TIP_MAX_AMOUNT is not null, first confirm the method is
   published by the artifact; if it is not, enforce the ceiling in app code before starting the
   transaction and say so in the report.
5. Use `Edit` to change EVERY charge `createTransactionIntent(params)` call to
   `createTransactionIntent(params, createTippingParams())`. Do NOT add a parallel payment method,
   and do NOT add tipping parameters to refund or capture call sites.
6. Leave `TransactionParameters` untouched — no tipping method goes on `.charge(...)`.
7. NEVER write `.tipAdjustable(...)`, `.adjustTip(...)` or `SummaryFeature.ADJUST_TIP`. On-receipt
   tipping is not part of this platform's documented surface.
8. Read the tip from the transaction details and NULL-CHECK it — a declined tip is a success.
   Derive base = total − tip. Resolve the exact accessor from the artifact; report the name used.

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
grep -rn "TippingProcessStepParameters" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: tipping parameters missing"

grep -rn "createTransactionIntent" "$SOURCE_ROOT" --include="*.kt" --include="*.java"
# every CHARGE call site must account for tipping — see the two legitimate shapes above.
# A one-argument call reachable without an explicit no-tip selection is a FAIL.

grep -rn "askForPercentageChoice\|askForTipAmount\|askForTotalAmount" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java"
# exactly one strategy per tipping step

grep -rn "tipAdjustable\|adjustTip\|ADJUST_TIP" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: on-receipt tipping is not supported" || echo "OK"

grep -rn "includedTipAmount\|IncludedTipAmount" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: tip amount never read"
```

If DEVICE_AVAILABLE = yes: install the APK, run a tap, and confirm the tip prompt appears and the
tip is included in the approved amount. Report the real result.
If DEVICE_AVAILABLE = no: complete AC 1–16, verify the build, and mark the on-device tip screen
DEFERRED → TTP Gate 10 (manual device validation). Do NOT fabricate a tip prompt.

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
TTP GATE 7 REPORT
Status: PASS | FAIL | PASS (on-device tip screen DEFERRED to TTP Gate 10)
Build: SUCCESS | FAILED
Tip entry mode used: percentage | tip_amount | total_amount
Custom percentages applied: YES (<p1>,<p2>,<p3>) | NO (SDK defaults)
maxTipAmount: applied (confirmed on artifact) | not applied (not published) | N/A
showTotalAmountConfirmationScreen(true) present: YES | NO
Charge call sites: <m> total
  passing tipping process params (2-arg): <n>
  still 1-arg (MUST be 0): <m - n>
App-side tip control: NONE | REMOVED (<what was removed, from where>)
Refund/capture call sites left untipped: YES | NO
TransactionParameters left unchanged: YES | NO
Tip accessor used: <exact accessor resolved from the artifact>
Tip retrieval null-checked: YES | NO
Base = total − tip implemented: YES | NO
On-receipt tipping absent (no adjustTip/tipAdjustable): YES | NO
Call site edited, not duplicated: YES | NO
On-device tip screen result: SHOWN (tip <value>) | NOT SHOWN | DEFERRED (no device)
Files modified: <list>
Acceptance criteria met: <list>
```
```