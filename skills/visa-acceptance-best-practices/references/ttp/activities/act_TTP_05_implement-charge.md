# Activity TTP-5: Implement Charge Transaction

Implement a charge (sale) transaction so the app can take a contactless payment by tapping a card
or wallet against the enrolled Android phone.

> **The long-lived `MposUi` holder is `act_TTP_03`'s, not this gate's.** Enrollment needed it first and
> `act_TTP_04` already queries `transactionModule` through it, so by the time this gate runs the holder
> exists and `mpos_accessor` is recorded in `project-plan.md`. Step 1 here *verifies* it and extends its
> configuration. The one exception — Gate 3 was skipped and the project has no durable holder — is
> Step 1.1a. The canonical recipe lives in
> `references/ttp/constants/ttp-sdk-requirements.md` § *The `MposUi` holder — one instance, one owner,
> created by Gate 3*.
Write code directly to project files; do not just print code examples in the chat.

**Reference:** [Tap to Pay on Android Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-payment-txn-intro.md) (Sale section), [Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) (`MposUi` / `UiConfiguration`), `references/ttp/troubleshooting.md#ttp-charge`, `references/ttp/constants/ttp-sdk-requirements.md`

## Critical Rules (NEVER violate these)

1. **Use `AccessoryFamily.TAP_TO_PHONE`** in `AccessoryParameters` — never `AccessoryFamily.MOCK` and never a card-reader family. A wrong accessory family makes the SDK negotiate for hardware that is not there; the transaction fails at the gateway rather than at compile time.
2. **The Currency type is `io.mpos.transactions.Currency` — and there are TWO decoys, not one.** All three are real and resolvable on the compile classpath, so none of them fails at the import line; the wrong one produces a confusing type error at the `.charge(BigDecimal, Currency)` call site instead.
   - `io.mpos.transactions.Currency` ← correct (an enum: `Currency.EUR`, `Currency.USD`, …)
   - `java.util.Currency` ← the JDK reflex
   - `com.visa.utils.Currency` ← shipped in `io.payworks:utils`; a `com.visa.*` name looks authoritative on a Visa integration and is the more dangerous of the two
2a. **If the file you are editing already imports `java.util.Currency`, do NOT add a bare `import io.mpos.transactions.Currency` to it.** Two imports of the same simple name in one Kotlin file is a *conflicting-import error* — the build breaks in code this gate never wrote, on the app's own existing screen. Check `currency_import_collision` in `project-plan.md`; if that file is listed, or if the grep below finds an existing import, pick one of two forms:
   ```kotlin
   // Option A — alias the SDK type (preferred when the SDK Currency appears more than once)
   import io.mpos.transactions.Currency as MposCurrency
   // ... .charge(amount, MposCurrency.<TRANSACTION_CURRENCY>)

   // Option B — fully-qualify at the use site and add no import at all
   // ... .charge(amount, io.mpos.transactions.Currency.<TRANSACTION_CURRENCY>)
   ```
   ```bash
   # Run this on every file you are about to add the SDK Currency import to.
   grep -n 'import java\.util\.Currency' "$SOURCE_ROOT/<path-to-screen>" \
     && echo "COLLISION: alias or fully-qualify the SDK Currency in this file — do NOT add a bare import" \
     || echo "OK: no java.util.Currency import here, a bare SDK import is safe"
   ```
   **Never "fix" the existing `java.util.Currency` import.** It belongs to the app — it is formatting prices or listing locales, and removing it breaks working code that has nothing to do with Tap to Pay. The cleanest structural alternative is to keep every SDK `Currency` reference in a separate file (a transactions helper) so no file ever has both types in scope; prefer that when you are creating new files anyway.
3. **NEVER start a transaction without BOTH guards, in this order:** `isMposUiReady()` **then** `isDeviceEnrolled()`. The first prevents a crash on an uninitialized SDK; the second prevents a guaranteed-failing transaction on an unenrolled phone. This second guard has no equivalent on terminal-based integrations — an unenrolled device is the single most common cause of a failed first tap.
4. **Both guards must show user-visible feedback and `return`** — never throw, never fail silently. On the `isDeviceEnrolled()` failure path, route the user to enrollment (`act_TTP_03`), do not start a transaction.
5. **NEVER check `resultCode == Activity.RESULT_OK`.** The SDK uses `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED`. `RESULT_OK` misses declined transactions that still carry a transaction object.
6. **NEVER skip calling `super.onActivityResult()` first.** Omitting it breaks back-stack and fragment result propagation.
7. **NEVER leave `onChargeApproved` or `onChargeFailed` as empty stubs.** Both must show user-visible feedback (Toast or Snackbar at minimum).
8. **NEVER discard the transaction identifier on approval.** Activity TTP-6 needs it for a referenced refund and Activity TTP-8 needs it for capture. Persist it as it arrives. **This means one `String`, and only that.** The transaction record itself lives on the Visa Acceptance platform and is read back with `transactionModule` — this app has no transaction table, no local database of sales, and no reason to build one. See `ttp-sdk-requirements.md` § *Finding a past transaction — `transactionModule`*. Do not raise storing transactions as a design question.
9. **NEVER hardcode the amount** in the transaction parameters. Accept it as a method parameter. Hardcoded amounts are unreviewable and untestable.
10. **`.customIdentifier(...)` accepts `^[a-zA-Z0-9_-]{0,256}$` and nothing else** — letters, digits, underscore, hyphen. **No spaces. No periods. No currency symbols.** The SDK enforces this itself, on the device, inside the builder method, and it **throws**:

    ```
    io.mpos.errors.MposRuntimeException: custom identifier 'Pizza order' needs to follow the
    pattern '^[a-zA-Z0-9_-]{0,256}$'
        at io.mpos.utils.UtilsKt.assertValidCustomIdentifier(Unknown Source:69)
        at io.mpos.transactions.parameters.ChargeBuilder.customIdentifier(Unknown Source:0)
    ```

    Use `"Pizza_order"` or `"fox-donation-100"`. `"Pizza order"` and `"Fox donation 1.00"` both crash the app.

    > **Two validators guard free text, and the stricter one fires first.** The backend `@SecureText`
    > validator rejects `$`, `€`, `£` and similar in free-text fields generally, failing the
    > transaction with HTTP 400 `TRANSACTION_ERROR_INVALID_TRANSACTION_REQUEST`. That is the
    > constraint on `.subject(...)` and `.metadata(...)`, and it does permit spaces and punctuation.
    > `customIdentifier` never reaches it — `assertValidCustomIdentifier` rejects the value on-device
    > first. Any guidance phrased as "alphanumerics, spaces and standard punctuation" is the backend
    > rule, and it is **too permissive for this field**: a space is fine for `@SecureText` and fatal
    > here. The pattern above came from the SDK's own thrown exception on real hardware, so it is the
    > authority; do not soften it back toward the backend wording.

    > **The builder is a crash site, not an error path.** Rules 4 and 7 build a careful story about
    > failure: the guards return with user-visible feedback, `onChargeFailed` reports declines. None
    > of it applies here. The throw happens while *building* `TransactionParameters` — before
    > `createTransactionIntent()`, before any Activity is launched, before any result callback
    > exists. So an identifier that comes from user input, an order number, or a database column must
    > be checked **before** it is passed in. See Step 1b.
11. **`ProviderMode.TEST` only.** Never `ProviderMode.LIVE` in an integration built by this skill.
12. **Add to the `summaryFeatures` set — never replace it.** Activities TTP-6 and TTP-8 each add entries to the same set. Rebuilding the set from scratch in a later activity silently deletes the earlier features and is the highest-risk regression in this integration path.
13. **`SummaryFeature` is NESTED inside `UiConfiguration`.** The correct name is `io.mpos.paybutton.UiConfiguration.SummaryFeature`; there is **no** top-level `SummaryFeature`. Every code sample in the official documentation writes the bare name, which does not resolve without a nested import — see Step 1.2.
14. **NEVER create a second `MposUi`.** `act_TTP_03` created the holder and recorded `mpos_accessor`; this gate reads it. A second `MposUi.create()` gives the app two competing owners of the same SDK object, the one reached first wins, and which that is depends on screen order — so it builds cleanly and fails on hardware. Step 1.1's `CREATE_SITES` check is how you find out; more than one is a `FAIL` you report rather than route around.
14a. **NEVER let `MposUi.create()` take the process down** — applies only on Step 1.1a, the Gate-3-skipped fallback where this gate does build the holder. In the `Application` branches `create()` runs in `onCreate()`, so an exception there kills the app before any UI renders, and `isMposUiReady()` never gets to run. **Guard the line where `create()` actually executes, not the line where the holder is declared** — on the DI-owned branch a lazy provider moves that moment to first injection, and a guard left behind at the declaration catches nothing. See `act_TTP_03` Critical Rule 8 for the full rule, including the detekt collision.

    **The broad catch is deliberate, and it collides with a standard linter rule.** `catch (t: Throwable)` trips detekt's `TooGenericExceptionCaught`, which is enabled by default and certain to fire on any project running `allRules = true`. This is the one place in the integration where the lint rule and the safety requirement point in opposite directions:

    - **Suppress the rule at the function**, with a comment saying why — the `@Suppress("TooGenericExceptionCaught")` in the constants file's worked example is not decoration, ship it.
    - **Do NOT narrow the catch to `Exception`.** An `Error` — native library load failure, hardware keystore unavailable — is a realistic failure mode for this specific call, and `Exception` does not catch it. Narrowing satisfies the linter by restoring the launch crash.
    - **Do NOT edit the project's detekt/ktlint configuration** to make the warning go away globally. A targeted, explained suppression is the correct scope; disabling a rule repo-wide to accommodate one call site is not.

    If the quality-gate diff reports `TooGenericExceptionCaught` as a *new* finding, the suppression is missing — add it, rather than changing the catch.
15. **NEVER create a new `Application` subclass when one already exists, and never create one just to hold `MposUi` on a project whose DI framework already owns object construction.** Extend the existing class, or add a singleton-scoped provider — the holder recipe has three branches and only one of them writes a new class. Changing `android:name` on an app whose `Application` is owned by DI (Hilt, Koin, Dagger) is a breaking edit that will not always fail loudly. This is `act_TTP_03`'s Critical Rule 7; it reaches this gate only on the Step 1.1a fallback.
16. **NEVER hardcode `app/`, `src/main/java/`, or `res/layout/`.** Use `$ANDROID_MODULE_DIR` and `$SOURCE_ROOT` from `project-plan.md`, and branch on `$UI_TOOLKIT`. A Compose project has no layout XML at all, and a grep against a path that does not exist returns zero matches with exit status 1 — identical to "checked and clean".

## Prerequisites

Before starting this activity, the developer must have completed:

- `act_TTP_01` — SDK dependencies configured, project builds
- `act_TTP_02` — real TEST MID + secret key exposed as `BuildConfig.TTP_MERCHANT_ID` / `BuildConfig.TTP_MERCHANT_SECRET`
- `act_TTP_03` — device enrollment implemented, including `isDeviceEnrolled()`, **and the durable
  `MposUi` holder created with `mpos_accessor` recorded in `project-plan.md`**
- `act_TTP_04` — the operator menu and the transaction detail page. Gates 6 and 8 attach their actions
  to it; this gate does not, but a charge with no way to look the transaction up afterwards is what
  Gate 4 exists to prevent

## Workflow

Follow these steps in order. **All code changes must be written directly to project files using
the Edit or Write tools — do not just output code in the chat.**

### Step 1: Verify the `MposUi` holder, then extend its configuration

**`act_TTP_03` created the holder; this gate does not create it.** Enrollment was the first gate that
needed an `MposUi`, and Gate 4 has already queried `transactionModule` through the same instance. Your
job here is to confirm it exists, confirm the accessor resolves, and add the transaction-side
configuration on top of it.

> **Creating a second `MposUi` here is the failure this step exists to prevent.** Two instances means
> two owners of the same SDK object's lifetime; the one reached first wins, and which that is depends on
> screen order. It builds cleanly and fails on hardware.

#### 1.1 Confirm the accessor

```bash
cd "$GRADLE_ROOT" || exit 1
MPOS_ACCESSOR=$(grep -E '^mpos_accessor:' "$GRADLE_ROOT/project-plan.md" 2>/dev/null \
  | sed -E 's/^mpos_accessor:[[:space:]]*//; s/[[:space:]]*#.*$//')
echo "mpos_accessor=${MPOS_ACCESSOR:-<empty>}"

CREATE_SITES=$(grep -rn 'MposUi\.create(' "$SOURCE_ROOT" \
  --include="*.kt" --include="*.java" --exclude-dir=build | wc -l | tr -d ' ')
echo "MposUi.create() call sites: $CREATE_SITES"
```

| What you find | What it means | What to do |
|---------------|---------------|------------|
| `mpos_accessor` set, `CREATE_SITES = 1` | the normal path — Gate 3 did its job | go to 1.2. **Do not touch the construction** |
| `mpos_accessor` set, `CREATE_SITES > 1` | a second holder exists | **FAIL.** Report it; the duplicate is Gate 3's to remove, not yours to work around |
| `mpos_accessor` empty, `CREATE_SITES = 1` | the holder exists but was never recorded | resolve the accessor from the code, write it to `project-plan.md`, and say in the report that you recovered a value Gate 3 should have written |
| `mpos_accessor` empty, `CREATE_SITES = 0` | **Gate 3 was `skip`** — the project's own enrollment predates this run | this is the only branch where *you* create the holder. See 1.1a |

##### 1.1a Fallback — Gate 3 was skipped and no holder exists

An app that already had enrollment does not necessarily have a durable holder; it may construct
`MposUi` inside a screen. Build one now, following
`references/ttp/constants/ttp-sdk-requirements.md` § *The `MposUi` holder — one instance, one owner,
created by Gate 3*, and take the same three-branch decision it describes. Then:

- Record `mpos_accessor` in `project-plan.md` exactly as Gate 3 would have.
- **Repoint the app's existing construction at the holder rather than leaving both.** If the existing
  site is inside an Activity or composable, replace it with a read of the accessor.
- Say in the report that this gate created the holder and why (`gate_3_enrollment = skip`).

#### 1.2 Extend `summaryFeatures` — add, never replace

The holder already sets `configuration = UiConfiguration(summaryFeatures = setOf(REFUND_TRANSACTION))`.
Charge needs nothing added to that set, so **on most projects this step changes no code at all** — which
is the correct outcome, not a skipped step.

Where a later gate does need an entry (`act_TTP_06` adds refund controls to the summary screen,
`act_TTP_08` adds capture), it **adds to the existing set**:

```kotlin
// Correct — read the current set, add to it.
mposUi.configuration = mposUi.configuration.copy(
    summaryFeatures = mposUi.configuration.summaryFeatures + SummaryFeature.CAPTURE_TRANSACTION
)

// WRONG — silently deletes every feature an earlier gate added.
mposUi.configuration = UiConfiguration(summaryFeatures = setOf(SummaryFeature.CAPTURE_TRANSACTION))
```

See Critical Rule 12. `SummaryFeature` is **nested** inside `UiConfiguration`
(`io.mpos.paybutton.UiConfiguration.SummaryFeature`) — Critical Rule 13; there is no top-level name,
and every code sample in the official documentation writes the bare one.

#### 1.3 The guards this gate depends on

Critical Rule 3 requires `isMposUiReady()` **then** `isDeviceEnrolled()`, in that order, before any
transaction starts. Both were established by Gate 3's holder. On the DI-owned branch they are spelled
differently — `mposUi == null` and `mposUi?.tapToPhone?.isDeviceEnrolled() == true` — and the constants
file § *The DI-owned branch* explains why. Use whichever form the project actually has; do not add a
second pair.

**Every sample in this file spells the holder `PaymentApplication.mposUi`. Read all of them as
`MPOS_ACCESSOR`.** On the extend-existing or DI branch, emitting the literal breaks the build on a class
this project does not have.

### Step 1b: Add the `customIdentifier` validator

Critical Rule 10 gives the SDK's pattern. Write it down **once**, next to the holder,
because Gates 6 and 8 pass identifiers to the same validator and a second copy of a regex
is a second thing to drift:

**Kotlin:**
```kotlin
// The SDK's own constraint, taken from the MposRuntimeException it throws
// (io.mpos.utils.UtilsKt.assertValidCustomIdentifier). Letters, digits, underscore, hyphen — the
// hyphen is last in the class on purpose, anywhere else it would open a character range.
private val TTP_CUSTOM_IDENTIFIER = Regex("^[a-zA-Z0-9_-]{0,256}$")

fun isValidTtpCustomIdentifier(value: String): Boolean = TTP_CUSTOM_IDENTIFIER.matches(value)
```

**Java:**
```java
private static final java.util.regex.Pattern TTP_CUSTOM_IDENTIFIER =
        java.util.regex.Pattern.compile("^[a-zA-Z0-9_-]{0,256}$");

public static boolean isValidTtpCustomIdentifier(String value) {
    return value != null && TTP_CUSTOM_IDENTIFIER.matcher(value).matches();
}
```

**Where it must be called.** Every identifier that is not a literal you wrote yourself:

| Identifier source | Required treatment |
|-------------------|--------------------|
| A literal in the gate's own code (`"Pizza_order"`) | None — but it must satisfy the pattern as written |
| A text field the user types into | Validate on input; show an inline error and keep the pay button disabled |
| An order number, invoice ID, or database column | Validate before building parameters; surface the failure rather than starting a transaction |

**Reject invalid input — never silently rewrite it.** Mapping `/` and spaces to `_` would make every
call succeed, and it is the wrong answer: `customIdentifier` is the merchant's reconciliation key, so
two distinct orders (`INV/2024-1` and `INV_2024-1`) can collapse onto the same value, and the
transaction the merchant later cannot match is a worse outcome than a validation message they can
read. If a project's identifiers genuinely cannot fit the pattern, that is a mapping the **developer**
owns — report it and ask; do not invent an encoding on their behalf.

### Step 2: Discover ALL payment entry points

<!-- REC-01 -->
**Do NOT assume a single screen has the payment button.** Search the project for every payment
entry point, then confirm with the developer. Integrating only the primary screen and leaving
others untouched is a documented failure mode.

`project-plan.md` already lists `payment_entry_points`. If it is populated, **use it and skip to
`G4b`** — do not re-prompt for screens the workflow already confirmed. Run the searches below
only when running this activity standalone, or to double-check for a screen the plan missed.

> **When the plan does *not* list them, confirming the screens is an always-fires decision**
> (`workflow.md` § *Always-fires decisions*) and it has **no safe default**: writing a payment
> trigger into the wrong screen is not undone by deleting the code, because the developer has to
> re-audit which screens now take money. Ask, even under `CHECKPOINT_MODE = autonomous`, and say why
> the run stopped.

**Every path comes from `$SOURCE_ROOT` / `$ANDROID_MODULE_DIR`, and the searches differ by toolkit.
A Compose project has no layout XML and no `findViewById` to find** — running only the Views
searches against it returns nothing and looks like a clean result.

```bash
# --- Views projects: click handlers and layout affordances
grep -rn "setOnClickListener\|OnClickListener\|android:onClick" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rni "price\|amount\|total\|btn_pay\|btn_buy\|btn_donate\|btn_tap\|btnPay\|btnBuy" \
  "$ANDROID_MODULE_DIR/src/main/res/layout" --include="*.xml" 2>/dev/null

# --- Compose projects: the trigger is a composable, not a view id
grep -rn "Button(\|OutlinedButton(\|TextButton(\|Modifier.clickable\|onClick *=" \
  "$SOURCE_ROOT" --include="*.kt" 2>/dev/null

# --- Either toolkit: unfinished payment intentions
grep -rni "TODO.*pay\|TODO.*charge\|TODO.*purchase\|TODO.*donat\|TODO.*checkout\|TODO.*tap" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
```

> **If a search path does not exist, say so — do not record "no matches".** Those two outcomes are
> indistinguishable in a grep exit code, and only one of them is trustworthy. Confirm the path first:
> `[ -d "$SOURCE_ROOT" ] || echo "SOURCE_ROOT does not exist — stop and re-resolve it"`.

Compile the results into a candidate list, then ask **`G4a`** and **`G4b`** from
`$SKILL_DIR/references/ttp/constants/ttp-questions.md` § *Gate-local questions* — verbatim, including
each option's description. `G4a` selects the screens (multi-select); `G4b` is asked **once per
confirmed screen**.

**Do NOT ask about one screen and stop.**

> **Do not add an "Other (describe)" option to `G4b`.** `AskUserQuestion` appends free-text `Other`
> to every question by itself, so a hand-written one produces two.

**Question C — amount source (per screen, only if FAB or standalone Button was chosen in B):**
```
What amount should be charged on <ScreenName>?

Options:
  - Fixed amount (type the value, e.g. 9.99)
  - User-entered at runtime (add an EditText for the user to type the amount)
```

If "Button on each list item" was chosen the amount always comes from the item's price field —
do **not** ask Question C for that screen.

Also confirm the project language (`PROJECT_LANGUAGE`) and toolkit (`UI_TOOLKIT`) from
`project-plan.md`. From this point forward, write application code only in the detected language and
toolkit.

#### Question D — controls whose value the new payment path silently drops (mandatory)

This exists because of a specific, silent, money-moving failure. POS-style screens frequently ship
controls the developer has not asked you to implement. If you wire the pay button to `startCharge()`
and leave those controls inert, the UI says one thing and the money does another — and nothing in the
build or the greps will tell you.

**The general rule, which matters more than either list below:**

> Any control whose value is read by the payment path you are **replacing**, but not by the one you
> are **adding**, is silently dropped. Enumerate the inputs of the old call site and account for every
> one of them.

Do that literally. Find the call site you are replacing and list every value it consumed:

```bash
# The old payment call and everything it read
grep -rn -B15 'startTransaction\|\.send(\|sendTransaction\|createTransactionIntent' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
```

A real screen's old call site consumed six inputs — transaction type, tipping mode, workflow type,
protocol type, a token, and an original transaction id — where the new Tap to Pay path consumes
exactly one: the amount. **That asymmetry is the thing to check.** Every dropped input is a control
the shopper can still change and the transaction will still ignore.

`project-plan.md` records these as `unimplemented_controls`. There are **two kinds**, and they fail
differently:

##### D1 — transaction-*type* controls → the WRONG TYPE goes through

A Refund / Pre-Auth / Account-Verification / Capture selector. With only charge implemented,
selecting "Refund" and pressing pay **puts a charge through**.

```bash
grep -rniE 'refund|credit|pre-?auth|preauthor|verification|account.?verif|capture|increment|reversal|void' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
# Views projects — also the layouts:
grep -rniE 'refund|credit|pre-?auth|verification|capture|reversal|void' \
  "$ANDROID_MODULE_DIR/src/main/res/layout" --include="*.xml" 2>/dev/null
```

```
<ScreenName> has a control labelled "<label>" that implies a <type> transaction, which is not
being implemented in this integration. With only charge implemented, selecting it and pressing
pay would put a CHARGE through.

How should it behave?
Options:
  - Disable it (recommended) — greyed out until that transaction type is implemented
  - Hide it — removed from the layout for now
  - Show an explicit "not implemented" message when selected
  - Implement that transaction type too (routes to the relevant gate: refund = act_TTP_06,
    pre-auth/capture = act_TTP_08, tipping = act_TTP_07)
```

> **Check `unavailable_reason` before asking.** The options above are for
> `unavailable_reason: not-implemented` — Tap to Pay *can* perform the operation and no gate in this run
> does. For `unavailable_reason: unsupported` the platform can never perform it, so "until that
> transaction type is implemented" is a false promise and the only correct action is to remove the
> control and keep an exhaustive `else`. Read the reason from `project-plan.md`; if it is missing,
> resolve it against `references/ttp/constants/ttp-sdk-requirements.md` § *What the Tap to Pay path can
> initiate — and what it cannot* rather than inferring it from the gate roster. Removing a control is a
> change to the app's feature surface — report what was removed.

##### D2 — transaction-*modifier* controls → the WRONG AMOUNT goes through, and it reports success

Tipping mode, cashback, surcharge, installments, currency selection. These are **orthogonal to
transaction type**, so a type-based check misses them entirely.

**This is the more dangerous of the two.** With tipping declined, selecting "Ask for Tip on Device"
and pressing pay charges the base amount: the transaction *succeeds*, the shopper is never prompted,
the merchant is never told, and nothing in the UI, the build, or the logs reveals that the selected
mode was discarded. A wrong-*type* transaction at least fails or looks obviously wrong; a
wrong-*amount* transaction that reports success can go unnoticed indefinitely.

```bash
grep -rniE 'tip|gratuity|cashback|cash.?back|surcharge|installment|instalment|convenience.?fee|currency.?select' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rniE 'tip|gratuity|cashback|surcharge|installment|instalment|convenience.?fee' \
  "$ANDROID_MODULE_DIR/src/main/res/layout" --include="*.xml" 2>/dev/null
```

```
<ScreenName> has a control labelled "<label>" that modifies the transaction AMOUNT
(<what it does>), which is not being implemented in this integration. Selecting it and pressing
pay would charge the unmodified amount — and the transaction would report SUCCESS. Neither the
shopper nor the merchant would be told the setting was ignored.

How should it behave?
Options:
  - Disable it (recommended) — greyed out, with the reason shown
  - Hide it — removed for now
  - Force it to its no-op value and disable it
  - Implement it too (tipping = act_TTP_07)
```

> **A tip-mode control is the exception: remove it, do not ask.** Tipping has no in-app control in
> either outcome, so none of the options above applies to it.
>
> | Tipping at `Q8` | What happens to a tip-mode control |
> |---|---|
> | declined | **removed** — every state of the control is unreachable, because nothing wires tipping |
> | enabled (`act_TTP_07` runs) | **removed** — on-device is the only supported mode, so the control has exactly one valid state, and the SDK's own tip screen already offers **"No Tip"** to the shopper |
>
> **A control whose every state is either unsupported or forced is not a control.** Keeping it produces
> either permanently dead UI or a duplicate of a decision the reader already presents — and a duplicate
> can drift from the screen it mirrors, ask the wrong person, and ask before the card is even presented.
> This is a change to the app's feature surface: name what you removed in the gate report.
>
> Contrast this with a *transaction-type* control such as account verification, where one option is
> unavailable among several that work — there, disable the option and keep the control. See
> `act_TTP_00_planning.md` § *Record why a control is unavailable*.

> A control matching only `tip` is **not** covered by D1's framing. "Tipping is not a transaction
> type, so this control is fine" is the wrong conclusion — it is a D2 control, and it is exactly the
> case where the failure reports success.

Whatever the answer, **no control may fall through to an unmodified charge**. Record every decision
and apply it in Step 6.

**Proceed to Step 3 only after all screens, UI elements, and both D1 and D2 decisions are
confirmed.**

### Step 3: Establish the currency

**If `TRANSACTION_CURRENCY` was provided by the workflow, use it and do NOT ask.** The workflow's
Step 0 owns this question and injects the answer into every transaction gate.

Only when running standalone, ask **`G4c`** from
`$SKILL_DIR/references/ttp/constants/ttp-questions.md` § *Gate-local questions* — which is `Q9a`,
asked verbatim from the same bank so the standalone wording matches the workflow wording exactly.

The value becomes `Currency.<CODE>` on `io.mpos.transactions.Currency`, which is an **enum** — not
`java.util.Currency` and not `com.visa.utils.Currency` (see Critical Rule 2).

**Record the answer.** Activities TTP-6, TTP-7 and TTP-8 reuse this currency and must not
re-prompt for it.

### Step 4: Add `startCharge(amount, identifier)`

Guards first, in order, each with visible feedback and a `return`. Replace `<CURRENCY_CODE>` with
the value from Step 3.

**Kotlin:**
```kotlin
private fun startCharge(amount: BigDecimal, identifier: String) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show()
        return
    }

    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show()
        routeToEnrollment()   // enrollDevice() / reEnrollDevice() from act_TTP_03 — NOT a transaction
        return
    }

    val params = TransactionParameters.Builder()
        .charge(amount, Currency.<CURRENCY_CODE>)
        // `identifier` MUST already satisfy ^[a-zA-Z0-9_-]{0,256}$ — this call THROWS otherwise.
        // Validate at the source (Step 1b), not here. See Critical Rule 10.
        .customIdentifier(identifier)
        .build()

    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Java:**
```java
private void startCharge(BigDecimal amount, String identifier) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }

    if (!PaymentApplication.isDeviceEnrolled()) {
        Toast.makeText(this, "This device is not enrolled for Tap to Pay.", Toast.LENGTH_LONG).show();
        routeToEnrollment();   // enrollDevice() / reEnrollDevice() from act_TTP_03
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .charge(amount, Currency.<CURRENCY_CODE>)
            .customIdentifier(identifier)
            .build();

    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

There is no terminal to connect to and no pairing state to wait on — payment capture happens in
the separate Tap to Pay Ready app (`com.visa.kic.app.kernel`) behind a transparent overlay.
`isDeviceEnrolled()` is the whole readiness check.

> **The builder chain switches type at `.charge()`.** `TransactionParameters.Builder()` returns a
> `Builder`, but `.charge(amount, currency)` returns an
> `io.mpos.transactions.parameters.ChargeBuilder` — and `customIdentifier`, `subject`, `autoCapture`,
> `includedTipAmount`, `tipAdjustable`, `withCashback`, `metadata`, `workflow`, `scheme` and
> `build()` all live on `ChargeBuilder`, **not** on `Builder`. The unbroken chain above compiles
> fine. It stops compiling the moment anyone reorders it or extracts an intermediate variable typed
> as `TransactionParameters.Builder`. `build()` returns the `TransactionParameters` **interface**.
>
> This is the SDK's house style, not a quirk of `charge()` — `.refund()`, `.capture()`,
> `.incrementalAuthorization()` and `AccessoryParameters.Builder(...).integrated()` all do the same.
> See `references/ttp/constants/ttp-sdk-requirements.md` § *Builder chains switch type mid-chain*.

### Step 5: Handle the result in `onActivityResult`

Persist the identifier as it arrives. Distinguish **declined** (a transaction object exists) from
**failed** (none does).

> **This gate builds the result site that Gates 6–9 extend** — read
> `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` § *Result handling* before writing it.
> Every transaction the SDK runs returns through the same `MposUi.REQUEST_CODE_PAYMENT` channel, so the
> shape chosen here is the shape a refund, pre-auth, capture and verification all inherit — getting it
> right once avoids the same bug in four later gates.

**Kotlin:**
```kotlin
private var lastTransactionIdentifier: String? = null   // needed by TTP-6 (refund) and TTP-8 (capture)

override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)   // ALWAYS first

    if (requestCode != MposUi.REQUEST_CODE_PAYMENT) return

    val transaction = PaymentApplication.mposUi.latestTransaction

    when (resultCode) {
        MposUi.RESULT_CODE_APPROVED -> {
            lastTransactionIdentifier =
                data?.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)
            onChargeApproved(transaction)
        }
        MposUi.RESULT_CODE_FAILED -> onChargeFailed(transaction)
        // Any other result code = the shopper backed out before the tap. Nothing to report.
    }
}

private fun onChargeApproved(transaction: Transaction?) {
    Toast.makeText(this, "Payment approved", Toast.LENGTH_SHORT).show()
    // lastTransactionIdentifier → referenced refund (TTP-6), capture (TTP-8)
    // transaction?.amount       → charged amount
    // TODO: navigate to a receipt screen and pass the transaction details
}

private fun onChargeFailed(transaction: Transaction?) {
    val message = if (transaction != null) "Payment declined" else "Payment failed"
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    // TODO: show a detailed error dialog or offer a retry
}
```

**Java:**
```java
private String lastTransactionIdentifier;   // needed by TTP-6 (refund) and TTP-8 (capture)

@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);   // ALWAYS first

    if (requestCode != MposUi.REQUEST_CODE_PAYMENT) {
        return;
    }

    Transaction transaction = PaymentApplication.getMposUi().getLatestTransaction();

    if (resultCode == MposUi.RESULT_CODE_APPROVED) {
        lastTransactionIdentifier =
                data != null ? data.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER) : null;
        onChargeApproved(transaction);
    } else if (resultCode == MposUi.RESULT_CODE_FAILED) {
        onChargeFailed(transaction);
    }
    // Any other result code = the shopper backed out before the tap.
}

private void onChargeApproved(Transaction transaction) {
    Toast.makeText(this, "Payment approved", Toast.LENGTH_SHORT).show();
}

private void onChargeFailed(Transaction transaction) {
    String message = (transaction != null) ? "Payment declined" : "Payment failed";
    Toast.makeText(this, message, Toast.LENGTH_LONG).show();
}
```

A member field is the minimum. If the identifier must survive process death — and for a
pre-auth/capture flow (TTP-8) it should — persist it to `SharedPreferences` instead.

> **`mposUi.latestTransaction` is genuinely nullable — keep the `?.`.** `MposUi.getLatestTransaction()`
> carries `@org.jetbrains.annotations.Nullable`, so `Transaction?` is the correct Kotlin type and
> `transaction?.amount` is right, not a redundant safe call. (Every other `MposUi` member is
> `@NotNull`; `getLastExecution()` is the only other nullable one.) `io.mpos.transactions.Transaction`
> itself is a `final class`, not an interface — irrelevant to use, but worth knowing before someone
> tries to mock it.
>
> For decline messaging, `transaction.status` is an `io.mpos.transactions.TransactionStatus` with
> these values, none of which the documentation publishes: `UNKNOWN`, `INITIALIZED`, `PENDING`,
> `ACCEPTED`, `APPROVED`, `DECLINED`, `ERROR`, `ABORTED`, `INCONCLUSIVE`. The enum also exposes
> `isFinal()` and `isFinalAndNotApprovedOrAccepted()`, which are more robust than comparing values
> by hand.

### Step 6: Wire the UI element on every confirmed screen

Connect the element chosen in Step 2 Question B to `startCharge()`, on **every** screen confirmed
in Question A. Use the branch matching `$UI_TOOLKIT`.

#### Views projects (`UI_TOOLKIT = views`)

**Kotlin:**
```kotlin
findViewById<Button>(R.id.btn_pay).setOnClickListener {
    startCharge(amount, "Order_1234")     // underscore, NOT a space — see Critical Rule 10
}
```

**Java:**
```java
findViewById(R.id.btn_pay).setOnClickListener(v -> startCharge(amount, "Order_1234"));
```

> **`"Order 1234"` would crash here.** The identifier flows straight into `.customIdentifier(...)`,
> which rejects spaces by throwing. This is the sample most likely to be copied verbatim, so the
> separator matters: `Order_1234` or `Order-1234`, never `Order 1234`.

For item taps in a `RecyclerView`, call `startCharge()` from the adapter's click callback, passing
the item's price as a `BigDecimal`.

#### Compose projects (`UI_TOOLKIT = compose`)

There is no `R.id`, no layout XML, and no `findViewById`. The entry point is an `onClick` lambda,
and the payment call belongs behind a callback rather than reaching for the Activity from inside a
composable:

```kotlin
@Composable
fun PosScreen(
    amount: BigDecimal,
    onCharge: (BigDecimal, String) -> Unit,   // hoist the payment call out of the composable
) {
    Button(onClick = { onCharge(amount, "Order_1234") }) {   // no spaces — Critical Rule 10
        Text("Charge")
    }
}

// In the Activity that hosts it:
setContent {
    PosScreen(amount = amount, onCharge = ::startCharge)
}
```

Two Compose-specific consequences:

- **Use the Activity Result API, not `onActivityResult`.** Step 5's `onActivityResult` override is
  the Views pattern. In Compose, register a launcher and read the result there:

  ```kotlin
  val paymentLauncher = rememberLauncherForActivityResult(
      ActivityResultContracts.StartActivityForResult()
  ) { result ->
      val transaction = PaymentApplication.mposUi.latestTransaction
      when (result.resultCode) {
          MposUi.RESULT_CODE_APPROVED -> {
              lastTransactionIdentifier =
                  result.data?.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)
              onChargeApproved(transaction)
          }
          MposUi.RESULT_CODE_FAILED -> onChargeFailed(transaction)
          // any other code = the shopper backed out before the tap
      }
  }
  ```

  `MposUi.RESULT_CODE_APPROVED` / `RESULT_CODE_FAILED` and
  `MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER` still apply unchanged — Critical Rule 5 holds in both
  toolkits: never test `Activity.RESULT_OK`.
- **Hold `lastTransactionIdentifier` in a ViewModel or `rememberSaveable`, not a plain local** —
  a composable's locals do not survive recomposition or configuration change, and TTP-6/TTP-8 need
  that identifier.

For `mixed` projects, apply the branch matching each individual screen.

#### Guard the controls from Step 2 Question D

Apply the decisions recorded there. **Both kinds** must be guarded: a control implying an
unimplemented transaction *type* (D1) and one modifying the *amount* (D2) must each be prevented from
reaching `startCharge()` with a value the Tap to Pay path will ignore.

Compute one reason string covering every dimension, and use it to disable the pay control. This scales
to any number of dimensions and makes the guard impossible to half-apply:

```kotlin
// null == safe to charge. Anything else is a user-facing reason the pay button is disabled.
val blockedReason: String? = when {
    !isMposUiReady() ->
        "The Tap to Pay SDK failed to initialise. Restart the app."
    !isDeviceEnrolled() ->
        "This device is not enrolled for Tap to Pay yet."

    // D1 — transaction TYPE not implemented this run
    selectedType != TransactionType.CHARGE ->
        "${selectedType.label} is not implemented for Tap to Pay — only Charge is."

    // D2 — transaction MODIFIER not implemented this run. Without this branch the charge
    // succeeds for the WRONG AMOUNT and reports success. Cashback and surcharge are the shapes
    // that belong here; a TIP-mode control is not, because it is removed rather than guarded.
    selectedCashback != Cashback.NONE ->
        "Cashback is not implemented for Tap to Pay."

    else -> null
}

// The pay control is disabled while a reason exists, and the reason is shown.
payButton.isEnabled = blockedReason == null
blockedReason?.let { payButton.contentDescription = it }
```

Compose equivalent: hoist `blockedReason` into the composable, pass
`enabled = blockedReason == null` to the `Button`, and render the reason as supporting text.

> **Render the reason next to the control it blocks.** "Shown somewhere on the screen" is not enough: a
> reason placed in a section further down is off-screen at the scroll position where the developer meets
> the greyed-out button, and a tester then reads a correct build as broken. That is an observed failure,
> not a hypothetical — see `act_TTP_03` § *Where the status and the enroll action go — owned by Gate 4* for
> the enrollment case, which is the reason that fires most often.

**A `when` without an `else`, or an `if` whose failing branch does nothing, is how the fall-through
gets reintroduced.** Make the non-charge path explicit, and prefer disabling the control over relying
on a runtime check — a disabled control cannot be pressed, whereas a check can be bypassed by the next
edit to that call site.

### Step 6b: Verify click-listener wiring (mandatory — non-skippable) <!-- REC-02 -->

Run both checks for **each** modified file. Both must pass before Step 7.

> **Confirm the path exists before trusting a zero-match result.** `grep` returns exit status 1 both
> when a file is clean and when it does not exist, so a wrong path reads as a pass:
> ```bash
> F="$SOURCE_ROOT/<path-to-screen>"
> [ -f "$F" ] || { echo "FAIL: $F does not exist — re-resolve SOURCE_ROOT"; exit 1; }
> ```

**Check A — `startCharge(` IS present in the file:**
```bash
grep -n "startCharge(" "$F"
```
Zero matches = **FAIL**. Fix the wiring before continuing.

**Check B — no original handler survives on the same button:**
```bash
grep -n "Toast.makeText\|makeText" "$F"
```
Read the output. If `Toast.makeText` (or any other original booking/confirmation handler) appears
**inside a `setOnClickListener` block that now calls `startCharge()`**, that is a **HARD FAIL**.
The original handler must be removed entirely, not left alongside the payment call.

This check is binary. Do NOT report success and move on — fix the wiring, then re-run both checks.

### Step 7: Build and verify

**You MUST actually run these commands with the Bash tool** — do not tell the developer to run
them. Read the output and fix any errors before finishing.

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

A passing build is also the acceptance signal for the import paths (see the constants file) — but
only a build whose **exit status you actually observed**. Never pipe it into `tail`.

```bash
# Sanity-check the paths first. A grep against a non-existent path returns zero matches and
# exit status 1 — identical to "checked and clean". Every check below is worthless without this.
[ -d "$SOURCE_ROOT" ] || { echo "FAIL: SOURCE_ROOT ($SOURCE_ROOT) does not exist"; exit 1; }
MANIFEST="$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml"
[ -f "$MANIFEST" ] || { echo "FAIL: manifest not found at $MANIFEST"; exit 1; }
```

```bash
# The Currency trap — scoped to the CALL SITE, not the file.
#
# Neither a repo-wide grep nor a file-level one works. java.util.Currency is legitimately used for
# locale currency lists, display formatting and unrelated legacy code — and it can live in the SAME
# file as a perfectly correct TTP builder. Classifying a whole file by its presence fails correct
# integrations, which is exactly what a file-level check does on any real POS screen.
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

# The second, undocumented Currency decoy — this one is never legitimate here
# Forbidden-token check: strip comments before judging. This skill recommends comments that NAME the
# forbidden type ("never java.util.Currency or com.visa.utils.Currency"), so an unfiltered grep flags a
# violation the guidance itself introduced — and the tempting "fix" is deleting a useful comment.
grep -rn 'com\.visa\.utils\.Currency' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -vE ':\s*(//|\*|/\*)' | grep -v '//.*com\.visa\.utils\.Currency' \
  | grep -q . \
  && echo "FAIL: com.visa.utils.Currency is used in code — not the SDK Currency type" \
  || echo "OK: no com.visa.utils.Currency outside comments"

# The amount must already be at the currency's scale when it reaches the builder. There is NO
# builder-time assertion on the amount: the gateway applies setScale(<exponent>, HALF_UP) itself when
# it serialises, so an unrounded total is charged as a DIFFERENT amount and the transaction still
# reports SUCCESS. A service charge, discount or tax applied at the call site is the usual source of
# the extra digits — 1.99 + 10% is 2.189, and it will be charged as 2.19 with nothing reporting it.
SCALE_FAIL=0
CHARGE_FILES=$(grep -rlE '\.charge\(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null)
if [ -z "$CHARGE_FILES" ]; then
  echo "FAIL: no .charge( call site found in $SOURCE_ROOT"; SCALE_FAIL=1
else
  for f in $CHARGE_FILES; do
    if grep -q 'setScale' "$f"; then
      echo "OK: $f scales the amount before charging"
    elif grep -rq 'setScale' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null; then
      echo "REVIEW: $f calls .charge(...) without setScale; setScale exists elsewhere in SOURCE_ROOT."
      echo "        Confirm the value scaled there is the SAME value charged here:"
      grep -rn 'setScale' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null | head -5
    else
      echo "FAIL: $f calls .charge(...) and setScale appears NOWHERE in $SOURCE_ROOT"
      SCALE_FAIL=1
    fi
  done
fi
[ "$SCALE_FAIL" -eq 0 ] && echo "OK: amount scaling accounted for at every charge site" \
  || echo "FAIL: the charged amount is not provably at the currency's scale"

# SummaryFeature is nested inside UiConfiguration — a bare top-level import does not resolve
grep -rn 'import .*\.SummaryFeature' "$SOURCE_ROOT" --include="*.kt" \
  | grep -v 'UiConfiguration\.SummaryFeature' \
  && echo "FAIL: SummaryFeature must be imported as io.mpos.paybutton.UiConfiguration.SummaryFeature" \
  || echo "OK"

# --- This gate must NOT have created a second MposUi (Critical Rule 14). ----------------------
# Gate 3 owns the holder; the only exception is Step 1.1a (gate_3_enrollment = skip AND no holder
# existed), and even then the count must end at 1.
CREATE_SITES=$(grep -rn 'MposUi\.create(' "$SOURCE_ROOT" \
  --include="*.kt" --include="*.java" --exclude-dir=build | wc -l | tr -d ' ')
echo "MposUi.create() call sites: $CREATE_SITES"
[ "$CREATE_SITES" = "1" ] \
  || echo "FAIL: expected exactly 1 MposUi.create() site, found $CREATE_SITES — two owners of one SDK object"

# The configuration must have been EXTENDED, not rebuilt. A bare UiConfiguration(...) assignment
# added by THIS gate deletes whatever Gate 3 put in the set — Critical Rule 12.
grep -rn 'configuration *= *UiConfiguration(' "$SOURCE_ROOT" --include="*.kt" --exclude-dir=build \
  | wc -l | tr -d ' ' | xargs -I{} sh -c '[ "{}" -le 1 ] \
    && echo "OK: at most one UiConfiguration(...) construction (Gate 3s)" \
    || echo "FAIL: {} UiConfiguration(...) constructions — a later one rebuilds the set and drops earlier features"'

# A newly CREATED PaymentApplication must be registered or it never runs.
# SKIP this check on either of the other two branches:
#   - you extended an EXISTING Application subclass — that one is already registered
#   - the DI-owned branch — there is deliberately no Application subclass to register
if [ "$MPOS_ACCESSOR" = "PaymentApplication.mposUi" ]; then
  grep -n 'android:name="\..*Application"' "$MANIFEST" \
    && echo "OK" || echo "FAIL: no Application subclass registered in the manifest"
else
  echo "SKIP: holder is $MPOS_ACCESSOR — no new Application subclass was created"
fi

# On the DI branch, no gate may emit a literal PaymentApplication reference
if [ "$MPOS_ACCESSOR" != "PaymentApplication.mposUi" ]; then
  grep -rn 'PaymentApplication' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
    && echo "FAIL: PaymentApplication referenced, but this project's holder is $MPOS_ACCESSOR" \
    || echo "OK: no stray PaymentApplication references"
fi

# The accessory family must be TAP_TO_PHONE and nothing else
grep -rn "AccessoryFamily\." "$SOURCE_ROOT" --include="*.kt" --include="*.java"
# Every match must read AccessoryFamily.TAP_TO_PHONE. Any other family = FAIL.

# The summary feature TTP-6 depends on
grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: REFUND_TRANSACTION missing from summaryFeatures"

# MposUi.create() must be guarded — an exception in Application.onCreate() kills the process
# before isMposUiReady() can show anything
grep -rn -B3 'MposUi\.create' "$SOURCE_ROOT" --include="*.kt" --include="*.java" | grep -q 'try' \
  && echo "OK" || echo "FAIL: MposUi.create() is not guarded — see Critical Rule 14"
```

## Troubleshooting

See `references/ttp/troubleshooting.md#ttp-charge` for charge-specific failures: wrong `Currency`
import, `MposUi` not initialized, `latestTransaction` returning null, a result code that is
neither APPROVED nor FAILED, a transaction that fails because the device is not enrolled, the tap
not registering, and the Tap to Pay Ready app overlay not appearing. Shared setup failures
(network, credentials, enrollment, build config) are in
`references/ttp/troubleshooting.md#tap-to-pay`.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. **`MposUi` is created exactly once in the whole project, and this gate did not create it** — Step 1.1's
   `CREATE_SITES` check returned `1`, and the construction is the one `act_TTP_03` wrote. A readiness
   signal plus an enrollment signal are reachable from every call site: `isMposUiReady()` /
   `isDeviceEnrolled()` on the `Application` branches, a nullable provider plus
   `mposUi?.tapToPhone?.isDeviceEnrolled() == true` on the DI-owned branch
1a. `mpos_accessor` was read from `project-plan.md` and names a symbol that actually resolves in this
    project. Gates 6–9 substitute it for the literal `PaymentApplication.mposUi` in their samples
1b. **Step 1.1a applied only if it had to.** If `gate_3_enrollment = skip` *and* no durable holder
    existed, this gate created one following the constants file's three-branch recipe, recorded
    `mpos_accessor`, repointed the app's pre-existing construction at it, and said so in the report. On
    every other path this gate wrote no `MposUi.create()` at all
2. **Branch-dependent, and inherited from Gate 3.** On the created-`PaymentApplication` branch: the class
   is registered via `android:name` in `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`. On the
   extended branch, `android:name` was **not** repointed. On the DI-owned branch there is no
   `Application` subclass and no `android:name` change at all — **and no file references
   `PaymentApplication`**
3. The existing `MposUi.create()` uses `ProviderMode.TEST` and `AccessoryFamily.TAP_TO_PHONE` with
   `.integrated()` — verified, not rewritten
4. Credentials come from `BuildConfig.TTP_MERCHANT_ID` / `BuildConfig.TTP_MERCHANT_SECRET` — not hardcoded
5. `mposUi.configuration` carries `summaryFeatures` containing `SummaryFeature.REFUND_TRANSACTION`, imported as `io.mpos.paybutton.UiConfiguration.SummaryFeature` (nested) or qualified at the use site. If this gate added anything to that set it **added** to it (`+`) and did not rebuild it — Critical Rule 12
5a. `MposUi.create()` is wrapped so an initialisation failure leaves `isMposUiReady() == false` rather than killing the process on launch
6. ALL payment entry-point screens were discovered via grep and confirmed with the user **before** any code was written <!-- REC-01 -->
7. Tap to Pay was integrated into **all** confirmed screens — not only the primary screen <!-- REC-01 -->
8. A `startCharge(BigDecimal, String)` method exists in each target class
8a. **The charged amount is at the currency's scale, rounded once, after all arithmetic.** `setScale(2, RoundingMode.HALF_UP)` (or the currency's exponent) is applied to the *total actually charged* — after any service charge, discount, tax or split — and `require(amount.scale() == 2)` / `require(amount.signum() > 0)` guard it. The same rounded value is what the UI displays. There is no builder-time assertion on the amount: an unrounded total is **silently rounded by the gateway and charged**, and the transaction reports success, so nothing else will catch this
9. Both guards are present in that order — `isMposUiReady()` then `isDeviceEnrolled()` — and each shows visible feedback and returns gracefully without throwing
10. The `isDeviceEnrolled()` failure path routes to enrollment and does **not** start a transaction
11. `TransactionParameters` is built with `.charge(amount, Currency.<CODE>)` and `.customIdentifier(...)` using `io.mpos.transactions.Currency` — never `java.util.Currency` and never `com.visa.utils.Currency`
12. Every value reaching `.customIdentifier(...)` satisfies `^[a-zA-Z0-9_-]{0,256}$` — no spaces, no periods, no currency symbols. Literals in the gate's own code satisfy it as written, and any identifier from user input, an order number or a database column is validated by `isValidTtpCustomIdentifier()` (Step 1b) **before** parameters are built, with a visible message on rejection. Invalid input is rejected, never silently rewritten
13. The transaction is launched with `createTransactionIntent(params)` and `MposUi.REQUEST_CODE_PAYMENT`
14. Result handling matches the toolkit: Views → `onActivityResult` with `super.onActivityResult()` called first; Compose → a registered Activity Result launcher (no `onActivityResult` override)
15. The result handler handles `MposUi.RESULT_CODE_APPROVED` and `MposUi.RESULT_CODE_FAILED` (and does not treat other codes as failures)
16. The transaction identifier is read from `MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER` and persisted for TTP-6/TTP-8
17. The `Transaction` object is read from `mposUi.latestTransaction`
18. `onChargeApproved` shows user-visible feedback — an empty body is not acceptable
19. `onChargeFailed` shows user-visible feedback and distinguishes declined from failed
20. `grep -n "startCharge(" <each-modified-file>` returns at least one match per screen, **after confirming the file exists** <!-- REC-02 -->
21. No original handler remains in any click listener that now calls `startCharge()` <!-- REC-02 -->
22. Every control implying an unimplemented transaction type (Step 2 Question D / `unimplemented_controls`) is disabled, hidden, or routed to an explicit "not implemented" message — **none of them falls through to `startCharge()`**
23. No path used in implementation or verification assumes `app/`, `src/main/java/`, or `res/layout/` — all derive from `$ANDROID_MODULE_DIR` / `$SOURCE_ROOT`, and each was confirmed to exist before any grep result was believed
24. The `java.util.Currency` check is **scoped** — it flags only files that both import it and build SDK transaction parameters, so pre-existing unrelated uses (currency formatting, locale lists) do not produce a false FAIL
25. `$GRADLE_MODULE_PATH:assembleDebug` was actually executed with the Bash tool and succeeded
26. On a compatible enrolled physical device, a real NFC tap completes and returns `RESULT_CODE_APPROVED`

> **Device-dependent criteria:** AC 26 requires a compatible enrolled physical Android device
> meeting every requirement in `references/ttp/constants/ttp-sdk-requirements.md`. If no such
> device is available in this environment, implement AC 1–25 and mark AC 26
> `DEFERRED → TTP Gate 10 (manual device validation)`. Do **not** report PASS on AC 26 without
> a real approved transaction.
>
> A passing build is not a working tap. If credentials are placeholders, AC 26 is
> `BLOCKED (placeholder credentials)` rather than deferred — no transaction can complete.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 5 of the Tap to Pay on Android integration: charge transaction.

Working directory: <project root>

## Transaction parameters (from Step 0 — do NOT ask for these again)

TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
PAYMENT_AMOUNT_SOURCE=<PAYMENT_AMOUNT_SOURCE>  (expression the app already computes, or "" — PREFER THIS)
TRANSACTION_AMOUNT=<TRANSACTION_AMOUNT>      (fixed FALLBACK amount only)
PAYMENT_ENTRY_POINTS=<PAYMENT_ENTRY_POINTS>
PROJECT_LANGUAGE=<PROJECT_LANGUAGE>          (java | kotlin)
UI_TOOLKIT=<UI_TOOLKIT>                      (views | compose | mixed)
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
ANDROID_MODULE_DIR=<ANDROID_MODULE_DIR>      (NOT necessarily "app")
SOURCE_ROOT=<SOURCE_ROOT>                    (may be src/main/kotlin, not src/main/java)
MPOS_ACCESSOR=<mpos_accessor>                (from project-plan.md, WRITTEN BY TTP GATE 3. Substitute
                                             it for every literal PaymentApplication.mposUi in this
                                             file's samples. If it is EMPTY, see Step 1.1 — that means
                                             Gate 3 was skipped or failed to record it, and the branch
                                             table there decides what to do. Never assume the literal.)
HAS_APPLICATION_CLASS=<has_application_class>  (true | false — from project-plan.md)
DI_FRAMEWORK=<di_framework>                  ("" | hilt | koin | dagger | custom-component)
DI_SINGLETON_MODULE_FILE=<di_singleton_module_file>  (where the app's other singletons live, or "")
                                             (the last three matter ONLY on the Step 1.1a fallback)

(ANDROID_MODULE_DIR and SOURCE_ROOT are relative to GRADLE_ROOT. cd "$GRADLE_ROOT"
before running any command. Build with:
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" > /tmp/ttp-build.log 2>&1
then check $? — never pipe the build.)
DEVICE_AVAILABLE=<DEVICE_AVAILABLE>          (yes | no)

Use `io.mpos.transactions.Currency.<TRANSACTION_CURRENCY>` — never `java.util.Currency`, and never
`com.visa.utils.Currency` (both exist on the classpath and neither satisfies `.charge(...)`).
**`PAYMENT_AMOUNT_SOURCE` wins wherever it is non-empty.** It is the expression the developer
confirmed at Q9b as the app's own amount (e.g. `item.getPrice()`, `orderTotal`). Use it, and
**convert it properly**. `TRANSACTION_AMOUNT` is then a recorded fallback that **must not appear in
generated code** — it stays a valid decimal only so that a literal substitution can never produce
`BigDecimal("n/a")`.

Use `BigDecimal("<TRANSACTION_AMOUNT>")` **only** when `PAYMENT_AMOUNT_SOURCE` is empty, which means
the developer confirmed the app has no amount of its own. If `PAYMENT_AMOUNT_SOURCE` arrived empty but
`project-plan.md` specifies a `payment_amount_source`, prefer the plan's expression and say so in your
report — the two disagreeing means Step 0 and the planning gate saw different things.

Read `payment_amount_type` from the plan. The SDK requires `BigDecimal` at scale 2, and most apps hold
money as a `Double` or a formatted `String`:

```kotlin
val amount = BigDecimal.valueOf(orderTotal).setScale(2, RoundingMode.HALF_UP)
require(amount.signum() > 0 && amount.scale() == 2)
```

**`BigDecimal(orderTotal)` and `BigDecimal("%.2f".format(orderTotal))` are both wrong** — the first
inherits binary floating-point error into the charged amount, the second throws in any locale using a
comma decimal separator. Substituting the plan's expression verbatim into a `BigDecimal` parameter
will not even compile when the source is a `Double`. See
`$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` § *Money*.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context, `payment_entry_points`, TTP GATE 5 notes
2. `$SKILL_DIR/references/ttp/activities/act_TTP_05_implement-charge.md` — the activity definition
3. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — versions, device requirements, and the
   import-resolution procedure (import paths are NOT published — resolve, do not guess)
4. `$SKILL_DIR/references/ttp/constants/ttp-questions.md` — the verbatim text of every question you may
   ask (`G4a`, `G4b`, `G4c`). Transcribe them; do not compose your own wording.

## Your task

Implement TTP GATE 5 using the activity file as your primary guide. Integrate EVERY screen listed
in `payment_entry_points` — do not re-prompt the developer for them.

Critical constraints:
1. `AccessoryFamily.TAP_TO_PHONE` and `ProviderMode.TEST` only — no other accessory family, and never `MOCK` or `LIVE`.
2. **Do NOT create `MposUi`. `act_TTP_03` already did.** Run Step 1.1 first: read `MPOS_ACCESSOR` from
   `project-plan.md` and count `MposUi.create()` call sites.
   - **accessor set, exactly 1 call site** → the normal path. Use the accessor everywhere and leave the
     construction untouched.
   - **more than 1 call site** → **FAIL and report it.** Two owners of one SDK object builds cleanly and
     fails on hardware; removing the duplicate is Gate 3's job, not a workaround for this gate.
   - **accessor empty, 1 call site** → recover the accessor from the code, write it to
     `project-plan.md`, and say in the report that Gate 3 should have written it.
   - **accessor empty, 0 call sites** → this means `gate_3_enrollment = skip`. **This is the only branch
     where you build the holder.** Follow
     `"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` § *The `MposUi` holder* and take one
     of its three branches (extend existing `Application` / create `PaymentApplication` / DI-scoped
     provider — keyed on `HAS_APPLICATION_CLASS` and `DI_FRAMEWORK`, see `DI_SINGLETON_MODULE_FILE`).
     Then record `mpos_accessor`, repoint any in-screen construction at the holder, and report that this
     gate created it.
3. **On the Step 1.1a branch only:** wrap `MposUi.create()` in try/catch **at the line where `create()`
   actually runs.** In the `Application` branches that is `onCreate()`, so an exception kills the process
   before any UI renders — and `isMposUiReady()`, the guard meant to show a friendly message, never runs.
   On the DI branch a lazy provider moves that moment to first injection: guard there, and let a nullable
   provider carry the meaning `isMposUiReady() == false`.
4. **Read `mposUi.configuration`; do not rebuild it.** Gate 3 set
   `summaryFeatures = setOf(SummaryFeature.REFUND_TRANSACTION)`. Charge needs nothing added, so on most
   projects this constraint means *change no code*. Where a later gate does add an entry it uses
   `configuration.copy(summaryFeatures = configuration.summaryFeatures + …)`. `SummaryFeature` is
   **nested**: import `io.mpos.paybutton.UiConfiguration.SummaryFeature`, or qualify as
   `UiConfiguration.SummaryFeature.…`. There is no top-level `SummaryFeature`.
5. If PROJECT_LANGUAGE = java and Step 1.1a applies, still write the `MposUi` holder in Kotlin
   (UiConfiguration relies on Kotlin default arguments). All other code in Java.
6. Guard order is `isMposUiReady()` then `isDeviceEnrolled()`. Both show feedback and return.
   The enrollment guard routes to act_TTP_03's flow — it must NOT start a transaction.
   Note that `isMposUiReady()` is NOT a credential check — it only means the object was built.
7. Import `io.mpos.transactions.Currency`, never `java.util.Currency` or `com.visa.utils.Currency`.
8. Persist the identifier from `MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER` — TTP GATE 6 and
   TTP GATE 8 both need it. In Compose, hold it in a ViewModel or `rememberSaveable`, not a local.
9. `onChargeApproved` and `onChargeFailed` must have user-visible feedback. Empty stubs fail.
   Keep the `?.` on `mposUi.latestTransaction` — it is genuinely `@Nullable`.
10. **`.customIdentifier(...)` accepts `^[a-zA-Z0-9_-]{0,256}$` only** — letters, digits, underscore,
    hyphen. No spaces, no periods, no currency symbols. The SDK throws `MposRuntimeException` from the
    builder method itself, so this crashes the app rather than failing the transaction, and no result
    callback ever runs. Use `"Pizza_order"`, not `"Pizza order"`. Add `isValidTtpCustomIdentifier()`
    (Step 1b) and call it on any identifier you did not write as a literal; reject invalid values with
    a visible message — never rewrite them silently.
11. **Branch on UI_TOOLKIT.** Compose projects have no layout XML, no `R.id` and no `findViewById`;
    use `Button(onClick = …)` and the Activity Result API, not `onActivityResult`. Views projects use
    `findViewById` + `onActivityResult`. For `mixed`, branch per screen.
12. **Never hardcode `app/`, `src/main/java/` or `res/layout/`** — use ANDROID_MODULE_DIR and
    SOURCE_ROOT, and confirm each path exists before believing a zero-match grep.
13. **Guard every control the Tap to Pay path will silently ignore — BOTH kinds.** Read
    `unimplemented_controls` from `project-plan.md`; each entry carries `kind: type | modifier`.
    - `kind: type` (Refund / Pre-Auth / Capture selector) — selecting it and pressing pay puts the
      **wrong type** through: a CHARGE.
    - `kind: modifier` (tipping mode, cashback, surcharge, installments) — selecting it puts the
      **wrong amount** through **and the transaction reports success**. Nothing in the UI, the build
      or the logs reveals the setting was discarded, which makes this the harder of the two to
      notice. Do not dismiss a tipping control as "not a transaction type, so it is fine".

    Disable (preferred), hide, or show an explicit "not implemented" message — never fall through.
    Also compare `old_call_site_inputs` against `new_call_site_inputs`: every input the old payment
    call read and the Tap to Pay path does not is a control the user can still change and the
    transaction will ignore.

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
# Paths first — a grep against a non-existent path returns zero matches and exit status 1,
# which is indistinguishable from "checked and clean". Without this, every check below can lie.
[ -d "$SOURCE_ROOT" ] || { echo "FAIL: SOURCE_ROOT ($SOURCE_ROOT) does not exist"; exit 1; }
MANIFEST="$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml"
[ -f "$MANIFEST" ] || { echo "FAIL: manifest not found at $MANIFEST"; exit 1; }

# The Currency trap — scoped to the CALL SITE, not the file.
#
# Neither a repo-wide grep nor a file-level one works. java.util.Currency is legitimately used for
# locale currency lists, display formatting and unrelated legacy code — and it can live in the SAME
# file as a perfectly correct TTP builder. Classifying a whole file by its presence fails correct
# integrations, which is exactly what a file-level check does on any real POS screen.
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

grep -rn 'com\.visa\.utils\.Currency' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: com.visa.utils.Currency is not the SDK Currency" || echo "OK"

# customIdentifier literals — the SDK throws MposRuntimeException on anything outside
# ^[a-zA-Z0-9_-]{0,256}$, from inside the builder method, so this crashes rather than declining.
#
# Do NOT write the SDK's pattern into grep -E. BSD grep (the default on macOS) caps bounded
# repetition at 255, so `{0,256}` is a SYNTAX ERROR: it prints to stderr, leaves stdout empty and
# exits 2 — which an && / || idiom reads as "nothing found", i.e. a silent pass on every project.
# Test for a disallowed CHARACTER instead. No bounded quantifier, and it names the offender.
grep -rnoE '\.customIdentifier\("[^"]*"\)' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  | grep -E '\.customIdentifier\("[^"]*[^a-zA-Z0-9_"-]' \
  && echo "FAIL: the literal(s) above contain a character outside [a-zA-Z0-9_-] — the SDK will throw" \
  || echo "OK: no literal customIdentifier violates the SDK pattern"

# Non-literal identifiers must be validated before they reach the builder.
if grep -rqE '\.customIdentifier\([^"]' "$SOURCE_ROOT" --include="*.kt" --include="*.java"; then
  grep -rq 'isValidTtpCustomIdentifier' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
    && echo "OK: a validator exists for the non-literal identifiers" \
    || echo "FAIL: .customIdentifier() receives a variable but isValidTtpCustomIdentifier() (Step 1b) is missing"
fi

# SummaryFeature must be the nested type
grep -rn 'import .*\.SummaryFeature' "$SOURCE_ROOT" --include="*.kt" \
  | grep -v 'UiConfiguration\.SummaryFeature' \
  && echo "FAIL: import io.mpos.paybutton.UiConfiguration.SummaryFeature" || echo "OK"

# A newly CREATED PaymentApplication must be registered. Skipped on the other two holder
# branches: an extended class is already registered, and the DI branch has none by design.
if [ "$MPOS_ACCESSOR" = "PaymentApplication.mposUi" ]; then
  grep -n 'android:name="\..*Application"' "$MANIFEST" \
    && echo "OK" || echo "FAIL: no Application subclass registered"
else
  echo "SKIP: holder is $MPOS_ACCESSOR — no new Application subclass was created"
fi

# MposUi.create() must be guarded
grep -rn -B3 'MposUi\.create' "$SOURCE_ROOT" --include="*.kt" --include="*.java" | grep -q 'try' \
  && echo "OK" || echo "FAIL: MposUi.create() unguarded — an exception kills the app on launch"

grep -rn "AccessoryFamily\." "$SOURCE_ROOT" --include="*.kt" --include="*.java"
# every match must be AccessoryFamily.TAP_TO_PHONE — any other family is a FAIL

grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: REFUND_TRANSACTION missing"

grep -rn "isDeviceEnrolled" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: enrollment gate missing"

# Compose projects must not use the deprecated result path
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -rn "onActivityResult" "$SOURCE_ROOT" --include="*.kt" \
    && echo "FAIL: use the Activity Result API on Compose" || echo "OK"
fi
```

<!-- REC-02 -->
**Mandatory click-listener verification (non-skippable — applies to ALL screens):**

For each modified file (confirm it exists first — see the path check above):

Check A:
```bash
F="$SOURCE_ROOT/<path-to-screen>"
[ -f "$F" ] || { echo "FAIL: $F does not exist"; exit 1; }
grep -n "startCharge(" "$F"
```
Zero matches = FAIL — `startCharge` was not wired.

Check B:
```bash
grep -n "Toast.makeText\|makeText" "$F"
```
If `Toast.makeText` appears inside a `setOnClickListener` block that was supposed to be replaced
by `startCharge()`, that is a HARD FAIL. Remove the original handler entirely, then re-run.

<!-- REC-01 -->
**Multi-screen check:** for each screen in `payment_entry_points`, confirm Check A and Check B
pass. Answer: "Are there screens with payment UI that were NOT integrated in this gate?" If yes,
integrate them and repeat the checks.

If DEVICE_AVAILABLE = yes: install the APK, tap a test card, and report the real result. Remember
that enrollment requires developer options DISABLED while installing requires them ENABLED — see
`references/ttp/constants/ttp-sdk-requirements.md` § *CRITICAL — the adb / developer-options deadlock*.
If DEVICE_AVAILABLE = no: complete AC 1–25, verify the build, and mark the on-device tap
DEFERRED → TTP Gate 10 (manual device validation). Do NOT fabricate an approved transaction.
If credentials are placeholders: mark it BLOCKED (placeholder credentials), not DEFERRED.

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
TTP GATE 5 REPORT
Status: PASS | FAIL | PASS (on-device tap DEFERRED to TTP Gate 10) | PASS (tap BLOCKED — placeholder credentials)
Build: SUCCESS | FAILED
Android module / source root used: <ANDROID_MODULE_DIR> / <SOURCE_ROOT>
UI toolkit: views | compose | mixed
Target screens: <class name(s) — list all integrated screens, with toolkit per screen>
MposUi holder: REUSED the one act_TTP_03 created | CREATED HERE (Step 1.1a — gate_3_enrollment = skip, no holder existed)
  mpos_accessor: <the symbol> — read from project-plan.md | recovered from code (Gate 3 left it empty) | written here
  MposUi.create() call sites in the project: 1 (any other number is a FAIL)
Application class: <ClassName> — CREATED by Gate 3 | EXTENDED by Gate 3 (owner: <hilt|koin|dagger|custom>) | none (DI-owned)
Application registered in manifest: YES (already, untouched) | YES (added at Step 1.1a) | N/A (DI-owned)
MposUi.create() guarded against launch crash: YES | NO
UiConfiguration summaryFeatures: <list> — UNCHANGED by this gate | EXTENDED with <what>
SummaryFeature imported as nested type: YES | NO
AccessoryFamily.TAP_TO_PHONE only: YES | NO
ProviderMode.TEST: YES | NO
isMposUiReady gate present: YES | NO
isDeviceEnrolled gate present: YES | NO
Currency type used: io.mpos.transactions.Currency | OTHER (FAIL)
Result handling: onActivityResult (views) | Activity Result launcher (compose)
Transaction identifier persisted to: <location>
onChargeApproved has visible feedback: YES | NO
onChargeFailed has visible feedback: YES | NO
REC-02 Check A (startCharge wired, all screens): PASS | FAIL
REC-02 Check B (original handler removed): PASS | FAIL
Unimplemented-type controls guarded: <list control → treatment> | NONE FOUND
All payment_entry_points integrated: YES | NO (list any missed)
Pre-existing java.util.Currency files (scoped check, NOT failures): <list or none>
On-device tap result: APPROVED | DECLINED (<status>) | FAILED | DEFERRED (no device) | BLOCKED (placeholder credentials)
Files modified: <list>
Acceptance criteria met: <list>
```
```
