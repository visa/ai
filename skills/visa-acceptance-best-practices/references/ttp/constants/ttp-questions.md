# Tap to Pay — Canonical Question Bank

Every question the Tap to Pay workflow may put to a developer is defined **here and only here**.
`workflow.md` decides *when* to ask and what to do with the answer; this file decides *what is asked*.

## Two hard rules

**1. Ask verbatim.** The `header`, `question`, and each option's `label` and `description` below are
**data, not prose to paraphrase**. Copy them into `AskUserQuestion` character for character. Do not
reword for brevity, do not merge options, do not add options, do not reorder them, and do not
substitute your own recommendation.

> **Why this is a rule and not a preference.** The same developer running this skill twice was shown
> different wording, different options, and different option descriptions each time, because the
> question text used to live in paragraphs that had to be *recomposed* into an `AskUserQuestion` call
> on every run. Recomposition is not deterministic. Transcription is. If a question below is wrong or
> incomplete, fix it here — do not improve it at the call site, because the next session will not
> know you did.

**2. Declare the roster before asking anything.** Many questions are conditional, so the set the
developer sees legitimately varies between projects. Nothing about that variation is visible from
their side: a question skipped because it does not apply looks exactly like a question you forgot.
Print the full roster with a per-question `ASK` / `SKIP` decision and a reason for every `SKIP`, then
take **one** confirmation for the whole list. See § *Roster declaration protocol*.

## Schema

Each question block carries exactly these fields. A field that is absent is absent on purpose.

| Field | Meaning |
|-------|---------|
| `id` | Stable identifier. **Never renumber** — `workflow.md` and the activity files reference these. |
| `ask when` | The condition. `always`, or a predicate over earlier answers. |
| `header` | The `AskUserQuestion` `header` value. Max 12 characters. |
| `question` | The `AskUserQuestion` `question` value, verbatim. |
| `multiSelect` | `true` or `false`. Absent means `false`. |
| `options` | Ordered list. Each has a verbatim `label` and verbatim `description`. |
| `dynamic options` | Present instead of `options` when the choices come from a codebase probe. States how to build each label and description. |
| `store` | The variable(s) the answer becomes, and their legal values. |
| `validate` | Rule applied before storing. On failure, re-ask. |
| `then` | Follow-up routing, or a procedure in `workflow.md` to run next. |
| `note` | Context for you, the agent. **Not shown to the developer** unless the field says otherwise. |

### Formatting conventions

These exist because three competing conventions used to coexist in `workflow.md`, and an agent
normalised to whichever it had read most recently.

- **The recommended option is listed first**, and its `description` opens with the word
  `Recommended.` Never encode the recommendation in the `label` — a label is the value, not a
  verdict. `Recommended: Latest available` as a label is wrong; `Latest available` with a
  description starting `Recommended.` is right.
- **A question may have no recommended option at all, and a few deliberately do not.** The rule above
  governs *where a recommendation goes*, not whether one must exist. Leave it out when the answer
  depends on the merchant's business rather than on anything this skill can see — whether a café wants
  tipping is not a technical question, and `Recommended.` on either option is the skill guessing at a
  business decision and dressing it as engineering advice. The tell: if the justification for the
  recommendation would be "most merchants…", it is a guess about *this* merchant. Where an option is
  genuinely cheaper or safer *as an integration* — a version everything is verified against, a gate
  that can be added later without rework — recommend it and say why. `Q8` is neutral by this rule;
  `Q11` recommends `No` and its `note` explains why that one is a technical judgement.
- **Every option has a non-empty `description`.** An option whose meaning "is obvious" is exactly
  the one whose description gets invented differently each session.
- **Never author an `Other` option.** The runtime appends free-text `Other` to every question by
  itself. A hand-written `Other (describe)` produces two of them.
- **Never author a `Both` / `All of the above` option.** Set `multiSelect: true` and let the
  developer select more than one. A combined value is not a member of the set the downstream gate
  branches on, so it matches no branch. See `Q7a`.

## Roster declaration protocol

Before the first `AskUserQuestion` of Step 0, evaluate `ask when` for every Step 0 question and print:

```
Tap to Pay on Android — Visa Acceptance SDK integration.

I work in 11 gates. Each one builds, verifies itself, and reports before the next starts:

   0  Baseline build & quality      measure the project before I change anything
   1  SDK dependencies              add the Tap to Pay artifacts
   2  Merchant credentials          MID + Acceptance Devices Secret Key
   3  Device enrollment             enroll this phone — needs real hardware
   4  Menu, transactions, status    the operator surface
   5  Charge                        take a payment
   6  Refund                        \
   7  Tipping                        |  only the ones you ask for
   8  Pre-auth & capture             |
   9  Account verification          /
  10  Manual device validation      you tap a real card and tell me what happened

First I need to ask you some questions — 5 minutes, no code written yet. Then I write a plan to
project-plan.md for you to approve, and only then does Gate 0 start. You can stop after any gate,
and resume in a later session from the plan file.

Working from:
  Gradle root:  ~/projects/my-pos-app                    (holds settings.gradle.kts, gradlew)
  App module:   my-pos-app/app                           (one level below the Gradle root)

Before I start, here is every question I will ask, and every one I am skipping.

  Q1   SDK version              ASK
  Q1a  Version number           SKIP — only if you choose to pin a version at Q1
  Q2   Test device              ASK
  ...
  Q9b  Payment amount           SKIP — this app computes its own amount (see P1); Gate 5 will
                                       use that expression, so a constant would be dead code

Anything marked SKIP that you expected to be asked? Say so now — a wrong skip becomes a
silent assumption in the plan.
```

Rules for the print:

- **Open with the orientation block**, as above — what the run is, how many gates, which of them are
  conditional, and what happens before any code is written.

  > **Why this is here and not in a question.** The roster answered *which questions am I being asked*
  > and never answered *what is about to happen to my project*. From the developer's chair the run
  > opened with a dozen questions about refunds and tipping, from something whose shape they could not
  > see — so there was no way to judge whether an answer mattered, and no way to tell that the first
  > gate would not start for another five minutes. Three lines of shape make every answer that follows
  > cheaper to give.
  >
  > **It is a `print`, not an `AskUserQuestion`.** The same reason the roots are: a confirmation here
  > would be a checkpoint before the workflow has asked anything, and it fights
  > `CHECKPOINT_MODE = autonomous`. The roster confirmation immediately below is the developer's
  > opening to object to any of it.

- **All eleven gates, and Gate 0 is one of them.** The registry in `workflow.md` § *Gate registry* is
  the source of truth for names and numbering — count from it, do not count from this example. Gate 0
  is the one that gets dropped when a list is written from memory, because it is the only gate with no
  activity file; omitting it makes the run look like it starts by changing the project, when it starts
  by measuring it. Gate 10 is the other one worth naming explicitly: it is the developer's own work,
  not the skill's, and a run that reveals that at the end has mis-set expectations for an hour.
- **Mark Gates 6–9 as conditional rather than listing them as certainties.** Which of them run
  depends on answers not yet given, and a developer who sees ten guaranteed gates reasonably assumes
  the questions are cosmetic.
- **Do not print gate skip decisions here** — they are not known yet. The Planning Agent proposes them
  from the codebase in Step 1a and the developer approves them in Step 1b.
- **Then the resolved roots**, before the roster itself. `GRADLE_ROOT` was resolved by walking
  ancestors and is frequently *not* the directory the developer opened, so the value the whole run
  depends on is one the developer has never seen. Printing it costs a line and makes a wrong root
  visible before any gate builds against it. Print the app module too when planning has already
  resolved it; omit that line on a first run, where it is not yet known. Like the orientation block,
  this is stated and not asked.
- **List every question in the bank**, including the ones you are skipping. A roster that omits its
  own omissions defeats the purpose.
- **A `SKIP` needs a reason naming the evidence**, not just the condition. "only asked when refunds
  are enabled" is a restatement; "you declined refunds at Q6" is a reason.
- Questions whose condition is not yet decided (because they depend on an answer you have not
  collected) are listed as `MAYBE` with the deciding question named: `Q6a Refund approach — MAYBE,
  depends on Q6`.
- Take **one** confirmation for the whole roster. Do not confirm each skip individually — on a run
  that declines refunds, pre-auth and tipping that is nine prompts, which trains reflexive approval
  and buys nothing.
- Re-print the roster if a probe or an answer changes it (e.g. `P1` finding no amount source turns
  `Q9b` from `SKIP` to `ASK`). Name what changed.

---

## Probes

A probe is a codebase check that runs **before** a question so the question can offer what the
project actually contains. Probes are not questions and are never confirmed by themselves.

> **Probe ids are not run order.** Each probe names the question it must precede, and the *Ask order*
> under Step 0 is authoritative: `P2` runs first, before `Q1`; `P1` runs later, after `Q5`.

### P1 — amount sources

Run once, before the transaction questions. Feeds `Q9b` and `Q7c`.

```bash
# Do NOT consult project-plan.md here. Step 0 runs BEFORE Step 1a, which is the only producer of
# that file, so on a fresh start it does not exist — and a grep for `payment_amount_source` in a
# file that is not there returns nothing, which is indistinguishable from "this app has no dynamic
# amount". That silent fall-through is what routes a cart-total app into a hardcoded constant.
#
# SOURCE_ROOT is not resolved until the planning gate either, so search from GRADLE_ROOT and let
# the --include filters narrow it. This is a CANDIDATE LIST, not an answer.
#
# On a MULTI-MODULE repo an unranked `head -20` is worse than useless: protocol and data-layer
# modules define `amount` far more densely than the one screen that shows a cart total, so the
# truncation window fills with library hits and the app's own match never appears. A list that
# silently contains no app code reads exactly like an app with no dynamic amount.
cd "$GRADLE_ROOT" || exit 1
grep -rniE '(val|var|fun) +[a-z_]*(total|amount|price|subtotal)' . \
  --include='*.kt' --include='*.java' \
  --exclude-dir=build --exclude-dir=.gradle --exclude-dir=.git 2>/dev/null > /tmp/ttp-amount.txt
echo "total candidate lines: $(wc -l < /tmp/ttp-amount.txt)"   # so truncation stays visible

# Label each hit with the Gradle module it belongs to, taking the module list from settings.gradle
# rather than guessing directory names. Only the APP module's hits can be the sale total.
grep -hoE "include *\(? *['\"]:[A-Za-z0-9_:.-]+" settings.gradle settings.gradle.kts 2>/dev/null \
  | sed -E "s/.*['\"]://; s/:/\//g" | sort -u > /tmp/ttp-modules.txt
echo "modules declared: $(wc -l < /tmp/ttp-modules.txt)"

if [ -s /tmp/ttp-modules.txt ]; then
  while IFS= read -r m; do
    N=$(grep -cE "^\./$m/" /tmp/ttp-amount.txt)
    [ "$N" -gt 0 ] && echo "--- module $m ($N hits) ---" && grep -E "^\./$m/" /tmp/ttp-amount.txt | head -8
  done < /tmp/ttp-modules.txt
else
  head -20 /tmp/ttp-amount.txt   # single-module project: no ranking needed
fi
```

> **Present the app module's hits, and say what you truncated.** If the module the developer is
> integrating into contributes zero candidates, that is a finding to state — not a silent fall-through
> to "this app has no dynamic amount", which is what routes a cart-total app into a hardcoded constant.

Store the surviving candidates as `AMOUNT_CANDIDATES` (possibly empty).

> On a **resumed** run `project-plan.md` exists. Read `payment_amount_source` and
> `pre_auth_amount_source` from it and skip the grep.

**Never pick a candidate yourself.** A grep for `total` finds `totalItemCount` as readily as
`cartTotal`. The developer chooses; you present evidence.

### P2 — an SDK version the project already pins

Run once, **before `Q1`**. Feeds `Q1`.

A project that already declares `io.payworks` has already chosen a version. Asking "which version do
you want?" as though the field were empty invites the answer `latest`, and `latest` is never equal to
the pin — which silently converts "add an integration" into "upgrade the SDK".

```bash
cd "$GRADLE_ROOT" || exit 1

# Direct coordinates carrying a literal version.
grep -rnE 'io\.payworks:(paybutton-android|mpos\.android\.taptophone):[0-9]' . \
  --include='*.gradle' --include='*.gradle.kts' \
  --exclude-dir=build --exclude-dir=.gradle --exclude-dir=.git 2>/dev/null

# Version-catalog form: the module line names an alias; the version sits behind a version.ref.
grep -nE '^[a-zA-Z0-9_-]+ *= *\{ *module *= *"io\.payworks:' gradle/libs.versions.toml 2>/dev/null
```

When a catalog entry uses `version.ref = "<name>"`, resolve `<name>` in `[versions]` — and count how
many other aliases share it:

```bash
REF=mpos-sdk        # the version.ref name found above
grep -nE "^${REF} *=" gradle/libs.versions.toml 2>/dev/null
grep -cE "version\.ref *= *\"${REF}\"" gradle/libs.versions.toml 2>/dev/null
```

Store the resolved version as `EXISTING_SDK_PIN` (possibly empty) and the count as `PIN_SHARED_BY`.

> **A shared `version.ref` makes a version bump wider than this integration.** One ref commonly governs
> both `paybutton-android` and `mpos.android.taptophone`, and sometimes aliases that other modules
> consume. Changing it upgrades artifacts nobody asked you to touch. That is an upgrade decision needing
> consent — treat it like the `minSdk` bump: name the blast radius and let the developer choose.

---

## Step 0 — configuration questions

**Ask order:** `P2 → Q1 → Q1a → Q2 → Q3 → Q3a → Q3b → Q3c → Q4 → Q5 → P1 → Q9a → Q9b → Q6 → Q6a → Q6b
→ Q7 → Q7a → Q7b → Q7c → Q7d → Q8 → Q8a → Q8b → Q8c → Q11`

> **`Q10` is not in this order because it was withdrawn** — see its entry below. The id is retired
> rather than reused, so a stale reference to `Q10` anywhere resolves to an explanation instead of to a
> different question.

> **Ask order is not id order, and that is deliberate.** Currency and amount (`Q9a`/`Q9b`) apply to
> every transaction type, so they are settled before the per-type questions that depend on them —
> `Q7c` cannot offer "the same amount the sale uses" before the sale's amount is known. The ids stay
> as they are because `workflow.md` and every activity file reference them by name.

### Q1 — SDK version preference

- `ask when`: always
- `header`: `SDK version`
- `question`: when `EXISTING_SDK_PIN` (from `P2`) is set — `` This project already pins the Tap to Pay
  SDK to `<EXISTING_SDK_PIN>`. Which version should the integration use? `` Otherwise —
  `Which Tap to Pay SDK version do you want to use?`
- `options`:
  | label | description | offered when |
  |-------|-------------|--------------|
  | `` Keep `<EXISTING_SDK_PIN>` `` | `Recommended. Reuse the version and the declaration the project already has, so this integration introduces no version change.` | `EXISTING_SDK_PIN` is set — list it **first** |
  | `Latest available` | `Use the most recent version published by the repository — newest fixes and device support.` | always. Prefix `Recommended.` **only** when no pin exists |
  | `Let me choose` | `Specify a version yourself, for example to pin to one your QA has already validated.` | always |
- `store`: `SDK_VERSION_PREFERENCE` (`keep` \| `latest` \| `choose`)
- `then`: `keep` → set `SELECTED_SDK_VERSION = EXISTING_SDK_PIN` and skip the Step 1c version query;
  Gate 1 then takes its *reuse the existing declaration* branch instead of adding a second one.
  `choose` → `Q1a`. `latest` → `SELECTED_SDK_VERSION` is resolved in Step 1c.
- `note`: when `PIN_SHARED_BY > 1`, append to the `Latest available` description: `` This project's pin
  is a shared `version.ref` — changing it also upgrades <PIN_SHARED_BY - 1> other artifact(s). `` On
  such a project `latest` is an upgrade decision, not a default, and it must be chosen deliberately.

### Q1a — SDK version number

- `ask when`: `SDK_VERSION_PREFERENCE = choose`
- `header`: `Version`
- `question`: `Which SDK version should this integration pin to?`
- `options`:
  | label | description |
  |-------|-------------|
  | `2.115.0` | `The version whose API names this skill has verified. Safest choice.` |
  | `2.114.0` | `The previous release. Pick this only if your QA has validated it specifically.` |
- `validate`: matches `X.Y.Z` (three integers separated by dots). On failure, show
  `` The value you entered (`<input>`) is not a valid SDK version format. SDK versions must be in the format `X.Y.Z` (e.g. `2.115.0`). `` and re-ask.
- `store`: `SELECTED_SDK_VERSION`
- `then`: run the **repository availability check** in `workflow.md` § *Q1a repository validation*.
  It is mandatory, and it owns the not-available and network-error messaging.
- `note`: The developer can type any version via the runtime's `Other`. The two presets exist so the
  common cases are one click; they are not a restriction.

### Q2 — test device availability

- `ask when`: always
- `header`: `Test device`
- `question`: `Do you have a compatible Android device available to test on right now?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Yes` | `A physical phone or tablet connected over adb.` |
  | `No / Not yet` | `Implement the code now and validate on hardware later.` |
- `store`: `DEVICE_AVAILABLE` (`yes` \| `no`)
- `then`: `yes` → run the **device pre-flight** in `workflow.md` § *Q2 device pre-flight*, which owns
  the exit-code handling. The pre-flight can send `DEVICE_AVAILABLE` back to `no`, but only with the
  developer's agreement — see the `note` on that below.
- `note`: **Run the adb probe in `workflow.md` § *Q2 device pre-flight* before asking, and say what it
  found in the preamble.** The resume path already auto-detects; a fresh start that does not is asking
  the developer for a fact the session could have looked up, and the two paths then disagree about the
  same phone. Open with one of:
  - `` A device is already connected over adb: <model> (Android <release>). Use it? `` — and keep
    `Yes` selected by default.
  - `No Android device is connected over adb right now.` — the answer is still theirs; a phone may be
    sitting on the desk unplugged.
- `note`: **Spell out what "compatible" means in the preamble — the developer cannot answer this
  question without it.** They are being asked to certify a device against requirements they have not
  been shown, and the usual result is a confident `Yes` followed by a pre-flight failure. Print the
  checkable list:
  - Android 12 (API 31) or newer, with a security patch level no older than 2022-05
  - NFC hardware, switched on
  - Google Mobile Services **and** the Google Play Store — both, and neither can be added to a build
    that shipped without them
  - The **Tap to Pay Ready app** (`com.visa.kic.app.kernel`), installable from the Play Store
  - Not rooted; bootloader not unlocked
  - Automatic date and time **on**
  - Developer options **off** — which is the one that catches almost everyone, because the phone you
    have been debugging on is the phone that cannot enroll. USB debugging is needed for the pre-flight
    and the install, so the honest sequence is: keep it on through Gate 9, turn it off for Gate 10.

  The authoritative list is `references/ttp/constants/ttp-sdk-requirements.md`; the pre-flight script
  checks all of the above except Play Integrity and the hardware Keystore, which are not observable
  over `adb`.
- `note`: **An emulator is not an option** — enrollment requires Play Integrity `DEVICE_INTEGRITY`
  and a hardware-backed Keystore. If the developer offers an emulator, tell them why it cannot work
  and ask whether physical hardware is available before setting `DEVICE_AVAILABLE = no`.
- `note`: **Never set `DEVICE_AVAILABLE = no` without asking.** It is not a bookkeeping detail: it
  defers Gate 10 and every claim about this integration then rests on a build that has never taken a
  payment. Whatever sent it that way — a pre-flight failure, an emulator, an exit `2` — say what
  happened, say that Gate 10 will be deferred, and let the developer choose. A developer who knows a
  second handset is in a drawer will fetch it; one who is never told simply ends up with an unvalidated
  integration.

### Q10 — WITHDRAWN. Do not ask it, and do not reinstate it.

There was a question here asking whether the menu should include a `Transactions` screen or ship with
`Device Status` alone. **It is deliberately removed. Gate 4 always builds both entries** — see
`act_TTP_04` Critical Rule 9.

> **Why it was withdrawn rather than reworded.** Its second option ("Device Status only") promised that
> refund and capture would "act on the latest transaction" — and both of those gates explicitly forbid
> exactly that. `act_TTP_06` AC 14 requires the refunded identifier to be the *selected* transaction's,
> "never a cached `lastTransactionIdentifier` or `latestTransaction`", and `act_TTP_08` says the same for
> capture. So the option offered a behaviour no gate would implement: choosing it left Gates 6 and 8 with
> no defined surface at all, since their only documented fallback is *Gate 4 was skipped*.
>
> The option's benefit was one fewer screen. Its cost was a permanent cap on which transaction can be
> refunded, plus a third code path in two money-moving gates. That is not a trade worth offering, so the
> skill decides it: the history ships.

If a developer volunteers that they do not want a transactions list, the answer is not to skip it — it is
Step 0 of `act_TTP_04`, which asks how to integrate with the surface they already have.

### Q11 — account verification

- `ask when`: always
- `header`: `Verify card`
- `question`: `Should the app also support account verification — a card-present check that a card is valid, with no money taken?`
- `options`:
  | label | description |
  |-------|-------------|
  | `No, not needed` | `Recommended unless you have a card-on-file use case. Skips Gate 9 entirely; nothing about charge, refund or pre-auth changes.` |
  | `Yes, add account verification` | `Adds a separate "Verify card" action. Typical use is card-on-file setup: verify the card at the counter now, charge later through another channel.` |
- `store`: `ACCOUNT_VERIFICATION_REQUESTED` (`true` \| `false`)
- `then`: `false` → `gate_9_account_verification = declined`. `true` → injected into Gate 9. Either way
  it is a **separate control** in the app; it never becomes an option on the pay button.
- `note`: **Ask this last, after the other capability questions.** It is the least commonly wanted of the
  four and its answer feeds nothing else, so a developer who declines it has already settled everything
  that matters.
- `note`: **`No` is listed first, and that is deliberate — this is the one capability question whose
  recommended answer is "no".** Refund, tipping and pre-auth are asked because most merchants want at
  least one of them; account verification is genuinely niche. Offering it enthusiastically produces
  integrations carrying a control nobody uses.
- `note`: If the developer asks what it is for, the honest answer is card-on-file: a merchant who will
  bill later (a subscription, a deposit, a tab) wants to know now that the card is real, without taking
  money. It is **not** a way to check a balance — that is `.balanceInquiry()`, a gift-card operation the
  Tap to Pay path does not accept at all.
- `note`: **If the developer calls this a "zero-amount" transaction, agree with the description but do
  not carry the phrase into the plan.** It is the correct industry term for the outcome and the wrong
  description of the code: `VERIFICATION` is a separate transaction type built with
  `.verification(currency)`, and `.charge(BigDecimal.ZERO, currency)` is **rejected by the SDK** with
  `Amount should be bigger than zero`. Record the answer as `ACCOUNT_VERIFICATION_REQUESTED` only — this
  question settles *whether* to build it, and `act_TTP_09` Critical Rule 1 settles *how*.
- `note`: **State the confidence level if they choose `Yes`.** The API is verified against the artifact and
  the reader has its own localised verification screens, but this skill has less real-hardware evidence
  for this path than for charge or refund. `act_TTP_09` Critical Rule 9 requires the gate to say so in its
  report; saying it here too avoids a surprise.
- `note`: If the project's UI **already** has an account-verification control, `P1`-style detection is not
  needed — `act_TTP_05`'s Question D inventory will have recorded it with
  `unavailable_reason: not-implemented`. Mention that in the question's preamble: answering `Yes` turns a
  control that is currently greyed out into a working one.

### Q3 — how credentials reach the build

- `ask when`: always
- `header`: `Credentials`
- `question`: `How would you like to provide Visa Acceptance TEST merchant credentials? The SDK needs a Merchant ID (MID) and an Acceptance Devices Secret Key.`
- `options`:
  | label | description | include when |
  |-------|-------------|--------------|
  | `Use the credentials already in local.properties` | `Recommended. Both keys are already present in this project. Gate 2 verifies them and writes nothing.` | only when the probe found both keys present and non-placeholder **and** referenced by a build or source file |
  | `Use the credentials already in local.properties (not currently wired)` | `Both keys are present, but nothing in this project reads them — they may be left over from an earlier attempt. Gate 2 will wire them and check they are present; only Gate 3 or Gate 10 can tell you they are valid.` | only when the probe found both keys present and non-placeholder **and** no file references them |
  | `I'll edit local.properties myself` | `Most secure — you write the values into the file and they never appear in the terminal.` | always |
  | `Enter them here` | `Paste them into the terminal. The secret key will be visible on screen and may be written to your shell history — it is a live credential for a real merchant account.` | always |
  | `I don't have them yet — use placeholders` | `The build will compile and the app will launch, but nothing will work end to end.` | always |
- `store`: `CREDENTIAL_METHOD` (`local_properties` \| `interactive_input` \| `placeholder`), plus
  `MERCHANT_ID` / `MERCHANT_SECRET` per the branch table in `workflow.md` § *Q3 credential handling*
- `then`: `Enter them here` → `Q3a`, `Q3b`. Then `Q3c` unless `CREDENTIAL_METHOD = placeholder`.
- `note`: Run the **credential presence probe** in `workflow.md` § *Q3 credential handling* **before**
  asking — it decides which of the first two options exists, and asking without it offers a configured
  project three options that are all wrong. **The first two options are mutually exclusive: exactly one
  of them appears, never both**, chosen by whether any build or source file references the keys.
  Presence and wiring are different facts, and only the second one tells you the build can reach the
  values. When non-placeholder credentials exist, the placeholder option **overwrites them**; state
  that consequence and get explicit confirmation before taking it.
- `note`: **`Enter them here` names its cost in the option description, not only in the warning
  printed afterwards.** The warning fires *after* the developer has already chosen — by then the
  decision is made and backing out feels like a mistake being corrected. "Visible on screen" also
  undersells it: a terminal scrollback is transient, a shell history file is not, and this is a live
  credential for a real merchant account. The developer needs the whole cost while they are still
  choosing between options. `workflow.md` § *Q3 credential handling* keeps the fuller warning and adds
  an escape hatch back to `I'll edit local.properties myself`.

### Q3a — Merchant ID

- `ask when`: `CREDENTIAL_METHOD = interactive_input`
- `header`: `Merchant ID`
- `question`: `Paste your Visa Acceptance TEST Merchant ID.`
- `options`: none — free text via the runtime's `Other`
- `store`: `MERCHANT_ID`
- `note`: Show the plaintext warning before asking. **Ask `Q3a` and `Q3b` as two separate
  `AskUserQuestion` calls** — never collect both secrets in one input.

### Q3b — Secret key

- `ask when`: `CREDENTIAL_METHOD = interactive_input`
- `header`: `Secret key`
- `question`: `Paste your Acceptance Devices Secret Key.`
- `options`: none — free text via the runtime's `Other`
- `store`: `MERCHANT_SECRET`

### Q3c — how the secret key was obtained

- `ask when`: `CREDENTIAL_METHOD != placeholder`
- `header`: `Key source`
- `question`: `Do you already have an Acceptance Devices Secret Key?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Yes, I have one` | `Gate 2 stores and verifies it. Nothing new is generated.` |
  | `No — I'll generate it in the Business Center` | `Gate 2 walks you through Payment Configuration ▸ Key Management ▸ Acceptance Devices Secret Key.` |
  | `No — generate it via the REST API` | `Gate 2 provides the call to make.` |
- `store`: `KEY_SOURCE` (`already_have` \| `business_center` \| `rest_api`); `n/a` when
  `CREDENTIAL_METHOD = placeholder`
- `note`: This is a **separate question from `Q3`**, not a refinement of it. `Q3` asks how the
  credentials reach the build; `Q3c` asks how the key came to exist. Collapsing them into one
  variable is why Gate 2 previously received values it did not recognise. **Generating a new key
  when one already exists can invalidate the existing key** and break other integrations using it —
  `already_have` means store-and-verify only.

### Q4 — ProGuard/R8

- `ask when`: always
- `header`: `ProGuard`
- `question`: `Do you want to enable ProGuard/R8 code obfuscation for release builds?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Yes` | `Recommended. Sets isMinifyEnabled = true and adds the SDK keep rules, which matter because the SDK relies on reflection.` |
  | `No` | `Skip it for now. You can add it later, but you will need to revisit the keep rules and re-test release builds.` |
- `store`: `PROGUARD_ENABLED` (`true` \| `false`)
- `note`: The **only** place ProGuard is asked about. Gate 1 receives the answer and must not
  re-prompt.

### Q5 — gate execution control

- `ask when`: always
- `header`: `Control`
- `question`: `How much control do you want during gate execution?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Checkpoint after each gate` | `Recommended. Pause for your approval after every gate. Best for a first integration.` |
  | `Autonomous` | `Run all gates automatically. Pauses only on a failure, or on a decision that is yours to make and has no safe default — a minSdk raise, say. Fastest.` |
- `store`: `CHECKPOINT_MODE` (`per_gate` \| `autonomous`)
- `note`: The `Autonomous` description must keep naming the second exception. `CHECKPOINT_MODE`
  governs **progress** checkpoints only; it never suppresses an always-fires decision
  (`workflow.md` § *Always-fires decisions*). Describing this option as "pause only on failures"
  promises a hands-off run the workflow will not deliver, and the developer then reads a legitimate
  product question as the workflow ignoring their answer.
- `note`: **When `DEVICE_AVAILABLE = yes`, append this to both descriptions — it is the real
  difference between them on this run**, and `Q2` has already been answered by the time this is asked:
  - `Checkpoint after each gate` → `` Also lets you try each gate on your connected phone as it lands, so a failure has one suspect instead of nine. ``
  - `Autonomous` → `` Your connected phone will not be used until Gate 10, so every on-device check lands at the end at once. ``

  Left unsaid, `Autonomous` reads as "the same run, faster". It is not: it trades all mid-run
  hardware feedback for speed. That is a reasonable trade and plenty of developers will take it —
  but only one of them is making an informed choice. See `workflow.md` § *Mid-run device test*.

### Q9a — transaction currency

- `ask when`: always
- `header`: `Currency`
- `question`: `Which currency should be used for transactions? This applies to all transaction types.`
- `options`:
  | label | description |
  |-------|-------------|
  | `EUR` | `Euro.` |
  | `USD` | `US Dollar.` |
  | `GBP` | `British Pound.` |
- `validate`: `^[A-Z]{3}$` (ISO 4217, uppercase). Re-ask if invalid.
- `store`: `TRANSACTION_CURRENCY`
- `note`: Becomes `Currency.<CODE>` on the SDK's own `io.mpos.transactions.Currency` enum — never
  `java.util.Currency`, never `com.visa.utils.Currency`. Gates 5, 6, 7 and 8 must not re-prompt.
  After enrollment, `TapToPhone.getMerchantInformation()?.supportedCurrencies.orEmpty()` reports what
  the MID actually supports; a currency absent from that set fails at the gateway, not at compile
  time. The `?.` is required — `getMerchantInformation()` is `@Nullable`, so the non-null form does
  not compile from Kotlin, and a null result means the same as an empty set: configuration not
  loaded.

### Q9b — payment amount

- `ask when`: always. **Which form is asked depends on `P1`.**
- `header`: `Amount`

**Form A — `AMOUNT_CANDIDATES` is non-empty.** The app already computes an amount, so the question
is which expression it is, not what constant to invent.

- `question`: `Where should the amount charged come from? I found these candidates in your code.`
- `dynamic options`: one per candidate, up to three, most plausible first.
  `label` = the expression exactly as it appears in the source (e.g. `orderTotal`).
  `description` = `` `<file>:<line>` — `<the full declaration line>` ``.
  Then always append this fixed option **last**:
  | label | description |
  |-------|-------------|
  | `None of these — use a fixed amount` | `None of the candidates above is the sale total, or you want Gate 5 to charge a constant instead.` |
- `store`: `PAYMENT_AMOUNT_SOURCE` = the chosen expression. Set `TRANSACTION_AMOUNT = 9.99` as an
  **unused** fallback and say so in the roster print — do not ask for it. Gate 5 must not emit it.
- `then`: `None of these` → ask Form B.

**Form B — `AMOUNT_CANDIDATES` is empty, or the developer chose `None of these`.**

- `question`: `This app has no amount of its own, so the charge amount will be a constant compiled into the payment call. What should it be?`
- `options`:
  | label | description |
  |-------|-------------|
  | `9.99` | `Recommended. Processes normally on the TEST environment without tripping low-value or round-number fraud filters.` |
  | `1.00` | `The smallest practical amount.` |
  | `25.00` | `A value with two significant decimal places, useful for confirming decimal handling.` |
- `validate`: positive decimal, at most two decimal places
- `store`: `TRANSACTION_AMOUNT`; leave `PAYMENT_AMOUNT_SOURCE` empty

> **Why this question has two forms.** `TRANSACTION_AMOUNT` used to be asked unconditionally, as a
> "test amount", and then fed to Gate 5 as the amount **compiled into the charge call**. On any app
> with a cart total that answer is collected and immediately discarded, because `act_TTP_05` prefers
> `payment_amount_source` — so the developer was asked to choose a number that could not be used.
> Gate 5 implements a payment *capability*, and a capability takes its amount from its caller. A
> constant is correct only when there is no caller to take it from, which is what Form B is for.

> **`PAYMENT_AMOUNT_SOURCE` wins wherever both exist.** When it is non-empty, `TRANSACTION_AMOUNT`
> must not appear in generated code. It stays a valid decimal rather than a sentinel so that a
> literal substitution can never produce `BigDecimal("n/a")`. Convert the chosen expression to
> `BigDecimal` at scale 2 per `ttp-sdk-requirements.md` § *Money* — `BigDecimal(aDouble)` and
> `BigDecimal("%.2f".format(x))` are both wrong.

### Q6 — refunds

- `ask when`: always
- `header`: `Refunds`
- `question`: `Do you want to implement refunds?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Yes` | `Recommended. Most merchants need them, and retrofitting later means revisiting every payment screen.` |
  | `No` | `Skip refunds for now.` |
- `store`: `REFUND_REQUESTED` (`true` \| `false`)
- `then`: `Yes` → `Q6a`, `Q6b`

### Q6a — refund approach

- `ask when`: `REFUND_REQUESTED = true`
- `header`: `Approach`
- `question`: `How should refunds be driven?`
- `options`:
  | label | description |
  |-------|-------------|
  | `SDK built-in` | `Recommended. Add SummaryFeature.REFUND_TRANSACTION and let the SDK summary screen drive the refund. Almost no code.` |
  | `Programmatic` | `Build refund TransactionParameters yourself. Needed only when refunds must be triggered from your own UI rather than the SDK summary screen.` |
- `store`: `REFUND_APPROACH` (`builtin` \| `programmatic`)

### Q6b — refund types

- `ask when`: `REFUND_REQUESTED = true`
- `header`: `Refund types`
- `question`: `Which refund types should be supported? Select all that apply.`
- `multiSelect`: `true`
- `options`:
  | label | description |
  |-------|-------------|
  | `Referenced full refund` | `Refund the whole of a known transaction.` |
  | `Referenced partial refund` | `Refund part of a known transaction.` |
  | `Stand-alone credit` | `Push funds to a card with no original transaction. Higher risk — there is no original transaction bounding the amount.` |
- `store`: `REFUND_TYPES`, one or more of `referenced_full`, `referenced_partial`, `standalone_credit`

### Q7 — pre-authorization and capture

- `ask when`: always
- `header`: `Pre-auth`
- `question`: `Do you want to implement pre-authorization and capture?`
- `options`:
  | label | description |
  |-------|-------------|
  | `No` | `Recommended. Skip unless the merchant vertical requires deferred billing.` |
  | `Yes` | `Authorize now, capture later. Needed for hotels, car rental, fuel, and open tabs.` |
- `store`: `PRE_AUTH_CAPTURE_REQUESTED` (`true` \| `false`)
- `then`: `Yes` → `Q7a`, `Q7b`, `Q7c`, `Q7d`
- `note`: Pre-auth and capture are always implemented together — a pre-auth you cannot capture is a
  hold that expires.

### Q7a — capture types

- `ask when`: `PRE_AUTH_CAPTURE_REQUESTED = true`
- `header`: `Capture`
- `question`: `Which capture types should be supported? Select all that apply.`
- `multiSelect`: `true`
- `options`:
  | label | description |
  |-------|-------------|
  | `Full capture` | `Recommended. Capture the full pre-authorized amount.` |
  | `Partial capture` | `Recommended. Capture less than was authorized — for example when the final bill came in lower.` |
- `store`: `CAPTURE_TYPES` — a **set**, one or more of `full` \| `partial`
- `note`: Most integrations need both — a bill that comes in lower than the authorized amount is a
  routine case, not an edge case, so an integration that supports only full capture has to void and
  re-charge to handle it. **There is no `Both` option and you
  must not add one** — the question is multi-select, so `Both` is a redundant encoding, and
  `capture_types: [both]` reaches Gate 8 whose logic branches on `full` and `partial`, matching
  neither. If `both` arrives from anywhere, normalise it to `[full, partial]` before recording.
  The SDK supports both chains (`.capture(id)` and `.capture(id).amountAndCurrency(...)`) and Gate 8
  implements both. When both are selected, Gate 8 must also specify how the partial amount is
  entered and validated — it cannot exceed the authorized total, including approved increments.

### Q7b — incremental authorization

- `ask when`: `PRE_AUTH_CAPTURE_REQUESTED = true`
- `header`: `Incremental`
- `question`: `Once a hold has been placed on a card, do you need to raise it before taking the money — for example a bar tab that keeps growing, or a hotel stay that gets extended?`
- `options`:
  | label | description |
  |-------|-------------|
  | `No` | `Recommended. The held amount is fixed when the card is first presented. To hold more, void the hold and take a new one.` |
  | `Yes` | `Adds an "Increase hold" action on a held transaction, so the amount can be raised without asking for the card again.` |
- `store`: `INCREMENTAL_AUTH_REQUESTED` (`yes` \| `no`)
- `note`: **Say it in terms of the hold and the money, not `incrementalAuthorization` and `capture`.**
  The developer answering this has usually not met the pre-auth vocabulary yet — `Q7` is where they
  first encounter it — so an option described as "raise a held amount before capture" asks them to
  already know that *capture* is the step where money moves. The API name belongs in the gate
  (`act_TTP_08`), not in the question. What the developer needs to recognise is their own use case:
  a tab, a hotel folio, a fuel pump.
- `note`: **`yes` / `no`, not `true` / `false` — do not "normalise" this to match `Q7`'s
  `PRE_AUTH_CAPTURE_REQUESTED`.** The inconsistency is real but the value is a contract: `act_TTP_08`
  compares it against a shell variable (`[ "$FOUND" = "$INCREMENTAL_AUTH_REQUESTED" ]`, § *Mandatory
  verification*), and its checks assert in **both** directions, so a changed encoding turns a passing
  gate into a failing one rather than into an error anyone can read. Changing it means changing every
  reader in the same commit.

### Q7c — pre-authorization hold amount

- `ask when`: `PRE_AUTH_CAPTURE_REQUESTED = true`
- `header`: `Hold amount`
- `question`: `What amount should a pre-authorization hold?`
- `options`: depends on `Q9b`.

  **When `PAYMENT_AMOUNT_SOURCE` is non-empty**, offer:
  | label | description |
  |-------|-------------|
  | `Same as the sale: <PAYMENT_AMOUNT_SOURCE>` | `Recommended. Use the amount the sale already uses, so a hold and a sale from the same screen are never for different values.` |
  | `A different expression` | `The hold is computed differently from the sale — for example a fixed deposit plus the cart total.` |
  | `A fixed amount` | `Always hold the same amount regardless of what is in the cart.` |

  **When `PAYMENT_AMOUNT_SOURCE` is empty**, offer:
  | label | description |
  |-------|-------------|
  | `50.00` | `Recommended. A typical deposit-sized hold on the TEST environment.` |
  | `100.00` | `A larger hold, useful for exercising partial capture against a wide margin.` |
- `validate`: a fixed amount must be a positive decimal with at most two decimal places
- `store`: `PRE_AUTH_AMOUNT_SOURCE` (expression, or empty) and `PRE_AUTH_AMOUNT` (fixed fallback)
- `note`: **A fixed hold on an app whose sale uses the cart total is an inconsistency that only
  surfaces as a real hold for the wrong value** — the sale charges €23.40 and the pre-auth holds
  €50.00, from the same screen and the same button, with nothing reporting the discrepancy. Where a
  dynamic source exists, reuse it. Convert to `BigDecimal` at scale 2 per `ttp-sdk-requirements.md`
  § *Money*.

### Q7d — sale vs. pre-auth UI

- `ask when`: `PRE_AUTH_CAPTURE_REQUESTED = true`
- `header`: `UI pattern`
- `question`: `How should the app choose between a sale and a pre-authorization?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Mode selector` | `Recommended. Add a Sale/Pre-Auth control above the existing pay button — one payment path, one decision point.` |
  | `Separate button` | `Add a dedicated "Pre-Authorize" button alongside the pay button.` |
- `store`: `UI_PATTERN` (`mode-selector` \| `separate-button`)
- `note`: **This question is only about sale vs pre-authorization**, because both start a *new*
  card-present transaction and the choice has to be made before the tap. It is **not** a general
  transaction-type selector. **Refund, capture and increase-hold are never offered on the payment
  screen** — each acts on an existing transaction, so each lives on that transaction's detail page
  (`act_TTP_04` Step 3). Do not extend this control with `Refund` or `Capture` options, however
  natural that looks next to `Sale` and `Pre-Auth`.

### Q8 — tipping

- `ask when`: always
- `header`: `Tipping`
- `question`: `Do you want to implement tipping?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Yes` | `The phone prompts the shopper for a tip before the card is presented. Standard for table service, counter service and delivery.` |
  | `No` | `No tip prompt. Can be added later without touching the rest of the integration.` |
- `store`: `TIPPING_REQUESTED` (`true` \| `false`)
- `then`: `Yes` → `Q8a`
- `note`: **Only on-reader tipping is in scope.** Post-tap tip adjustment is a pre-authorization
  followed by a capture at a different amount — that is Gate 8, not Gate 7.
- `note`: **Neither option is marked `Recommended.`, and that is deliberate — do not add one.**
  Whether a merchant takes tips is a fact about their business, not a technical judgement, and this
  skill cannot see it: hospitality expects a tip prompt and its absence is a defect; a pharmacy or a
  parking kiosk would find one inappropriate. `No` used to carry the recommendation, which read as
  *tipping is the unusual choice* to exactly the merchants for whom it is mandatory. See § *Formatting
  conventions* on neutral questions. `Yes` is listed first only because it is the answer that adds a
  gate — order here carries no endorsement.
- `note`: Contrast `Q11`, which does recommend `No`. That recommendation is defensible because it
  rests on something this skill knows about the *integration* — account verification is niche, its
  answer feeds nothing else, and Gate 9 has the least hardware evidence behind it. "Most merchants
  don't tip" is not that kind of claim.

### Q8a — tip entry mode

- `ask when`: `TIPPING_REQUESTED = true`
- `header`: `Tip entry`
- `question`: `How should the shopper be asked for a tip on the device screen?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Percentage choice` | `Recommended. The screen offers percentage buttons. Fastest for the shopper.` |
  | `Tip amount` | `The shopper types the tip itself.` |
  | `Total amount` | `The shopper types the total including the tip.` |
- `store`: `TIP_ENTRY_MODE` (`percentage` \| `tip_amount` \| `total_amount`)
- `then`: `percentage` → `Q8b`. `tip_amount` or `total_amount` → `Q8c`.
- `note`: **This is configuration, and it is the only place the tip mode is chosen.** The app gets no
  in-app tip control in either outcome — no mode selector and no "Add tip" toggle. The SDK's own tipping
  screen presents a **"No Tip"** option in every entry mode above, so declining a tip is already the
  shopper's choice at the reader; an in-app equivalent duplicates it, can drift from it, and asks before
  the card is even presented. If tipping is declined at `Q8`, any existing tip-mode control in the app is
  **removed** — see `act_TTP_05` Question D2.

### Q8b — tip percentage values

- `ask when`: `TIP_ENTRY_MODE = percentage`
- `header`: `Percentages`
- `question`: `Which tip percentages should be offered?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Use the SDK defaults` | `Recommended. Omits .percentages(...) entirely and takes whatever the SDK offers.` |
  | `10, 15, 20` | `A common set for lower-value transactions.` |
  | `15, 20, 25` | `A common set for table service.` |
- `validate`: custom input splits on `,` and trims to **exactly three** integers between 1 and 100.
  Re-ask if not.
- `store`: `TIP_PERCENTAGES = [p1, p2, p3]`, or `null` for SDK defaults
- `note`: Collect all three values in **one** `AskUserQuestion` call — the two preset labels double
  as the format example for anyone typing their own.

### Q8c — maximum tip

- `ask when`: `TIP_ENTRY_MODE = tip_amount` or `TIP_ENTRY_MODE = total_amount`
- `header`: `Max tip`
- `question`: `Should there be a maximum tip amount?`
- `options`:
  | label | description |
  |-------|-------------|
  | `No maximum` | `Recommended. Let shoppers tip freely.` |
  | `Set a maximum` | `Cap the tip. Type the limit as a decimal.` |
- `validate`: positive decimal
- `store`: `TIP_MAX_AMOUNT`, or `null`
- `note`: **Never ask `Q8c` when `TIP_ENTRY_MODE = percentage`.** `maxTipAmount(...)` is published on
  the tip-amount and total-amount builders but **not** on the percentage builders — see
  `ttp-sdk-requirements.md` § *Tipping builders*.

---

## Gate-local questions

These are asked **inside** a gate because they depend on what that gate discovered. Every one of
them carries a standalone guard.

> **The standalone guard.** Each question below has a Step 0 counterpart or a workflow-injected
> variable. When the workflow supplied the value, **use it and do not ask** — re-asking inside a
> gate is where the "it asked me the same thing twice, differently" reports come from. Ask only when
> the gate is running standalone, i.e. the variable arrived empty.

### G4a — which screens get Tap to Pay

- `owner`: `act_TTP_05_implement-charge.md` Step 2
- `ask when`: always — the candidate list is a codebase finding, not a Step 0 answer
- `header`: `Screens`
- `question`: `Which of these screens should have Tap to Pay integrated? Select all that apply — do not skip any.`
- `multiSelect`: `true`
- `dynamic options`: one per candidate screen. `label` = the class name.
  `description` = the evidence found, e.g. `` `CheckoutActivity.kt:88` — formats a price with a currency symbol ``.
- `store`: `PAYMENT_ENTRY_POINTS`
- `note`: **Do not ask about one screen and stop.** If a search path did not exist, say so — never
  record "no matches", because the two are indistinguishable in a grep exit code.

### G4b — payment trigger per screen

- `owner`: `act_TTP_05_implement-charge.md` Step 2
- `ask when`: once per screen confirmed in `G4a`
- `header`: `Trigger`
- `question`: `How should payment be triggered on <ScreenName>?`
- `options`:
  | label | description |
  |-------|-------------|
  | `Button on each list item` | `A "Buy" control per row. The amount comes from the item, so no constant is needed.` |
  | `Floating Action Button` | `A single FAB for the screen. The amount comes from the screen's own total, or from the configured fallback.` |
  | `Standalone button` | `A button placed in the layout. The amount comes from the screen's own total, or from the configured fallback.` |
- `store`: per-screen trigger choice, recorded in the plan

### G4c — currency, standalone only

- `owner`: `act_TTP_05_implement-charge.md` Step 3
- `ask when`: `TRANSACTION_CURRENCY` was **not** provided by the workflow
- Identical to `Q9a`. Ask it verbatim from there.

### G5a — refund target classes

- `owner`: `act_TTP_06_implement-refund.md` Step 1
- `ask when`: the classes that received `startCharge()` are ambiguous **and**
  `PAYMENT_ENTRY_POINTS` was not provided by the workflow
- `header`: `Target class`
- `question`: `Which classes should handle refunds? Normally these are the same classes that received startCharge().`
- `multiSelect`: `true`
- `dynamic options`: one per class containing `startCharge(` or `onActivityResult`.
  `description` = `` `<file>:<line>` — <which of the two it contains> ``.
- `store`: refund target classes

### G6a — does a charge flow exist

- `owner`: `act_TTP_07_implement-tipping.md` Step 1
- `ask when`: Gate 5 did **not** run in this session (standalone invocation)
- `header`: `Charge flow`
- `question`: `Do you have a working Tap to Pay charge transaction in this project? Tipping attaches to an existing charge and has nothing to modify without one.`
- `options`:
  | label | description |
  |-------|-------------|
  | `Yes, a tap can complete a sale` | `Tipping will be added to the existing charge flow.` |
  | `No, I need the charge transaction first` | `I will route you to the charge gate and stop here.` |
  | `Not sure, let me check` | `I will stop so you can confirm before anything is modified.` |
- `store`: `CHARGE_FLOW_EXISTS` (`yes` \| `no` \| `unknown`)
- `then`: `No` or `Not sure` → route to `act_TTP_05` and **stop**
- `note`: When Gate 5 ran in this session the answer is known — **do not ask**. Verify it from the
  code instead.

### G6b — tipping strategy, standalone only

- `owner`: `act_TTP_07_implement-tipping.md` Step 2
- `ask when`: `TIP_ENTRY_MODE` was **not** provided by the workflow
- Identical to `Q8a`, and its follow-up to `Q8b`. Ask them verbatim from there.
- `note`: This block used to restate the question with its own wording, so a developer who answered
  `Q8a` in Step 0 met a differently-worded version of the same question in Gate 7. When Step 0
  supplied `TIP_ENTRY_MODE`, use it.

### G7a — how pre-auth capture is driven

- `owner`: `act_TTP_08_implement-pre-auth-capture.md` Step 2
- `ask when`: always — Step 0 has no counterpart for this
- `header`: `Drive mode`
- `question`: `How should pre-authorization capture and increment be driven?`
- `options`:
  | label | description |
  |-------|-------------|
  | `SDK built-in` | `Recommended. Use the summary screen's capture and increment buttons. Step 1 already enabled them, so only the pre-authorization itself needs custom code.` |
  | `Programmatic` | `Build TransactionParameters yourself for capture and increment, with your own buttons and full control over amounts.` |
- `store`: `PRE_AUTH_DRIVE_MODE` (`builtin` \| `programmatic`)
- `then`: `builtin` → implement Steps 3–5, then skip to Step 9. `programmatic` → all steps.
- `note`: This is the one gate-local question with no Step 0 counterpart, so it has no standalone
  guard. If that changes, add the guard here and in Step 0 together.
