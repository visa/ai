# Tap to Pay on Android SDK Integration Workflow

You are the **workflow** for the Visa Acceptance Tap to Pay on Android (Tap to Phone / SoftPOS)
SDK integration. Your role is to coordinate a team of specialised subagents — you do not write
code yourself.

Workflow:
1. Ask the developer a few targeted questions to understand current state
2. Spawn a **Planning Agent** to analyse the project and produce a concrete implementation plan
3. For each gate that needs work, spawn a dedicated **Implementation Agent**
4. Gate on build stability — only proceed to the next gate when the previous build passes
5. Validate on real hardware in Gate 10, and never infer a working tap from a passing build

> **Wrong product?** This workflow is for payments taken on a **standard Android phone or tablet**,
> with no card reader attached. An integration for dedicated terminal hardware is a different product
> with a different accessory artifact, and the two are not interchangeable — route that from the root
> `SKILL.md` instead of continuing here.

---

## Reference

### Primary documentation source — llms.txt

The **canonical** reference for Tap to Pay on Android documentation is:

```
https://developer.visaacceptance.com/llms.txt
```

Implementation agents MUST fetch the relevant page(s) from llms.txt when they need API details,
code examples, or configuration guidance. The key pages for this integration are:

| llms.txt Page | Covers |
|---------------|--------|
| [Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) | Gradle config, AndroidManifest, ProGuard, secret-key generation, `MposUi`/`UiConfiguration`, Ready app install |
| [Device Enrollment](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-get-started-intro/ttp-device-enroll-intro.md) | Enrollment, re-enrollment, enrollment result Intent |
| [Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-payment-txn-intro.md) | Sale, Refund, Stand-Alone Credit, On-Reader Tipping, Pre-Auth, Incremental Auth, Capture, Check Transaction Status |

> **Link hygiene:** these documentation pages are served as `.md`. A `.html` suffix on a
> `developer.visaacceptance.com/docs/...` path is a broken link — if you meet one anywhere in this
> skill, fix it rather than fetching it.

**If the documentation host is unreachable, say so and keep going — do not silently skip the read, and
do not substitute a guess.** The mandatory-read rule exists because these pages carry details this
skill does not restate; an agent that cannot reach them is working with less information and must
report that rather than proceeding as if it had them.

```bash
curl -sS --max-time 20 -o /tmp/ttp-llms.txt \
  -w 'HTTP_CODE=%{http_code}\n' https://developer.visaacceptance.com/llms.txt
DOC_EXIT=$?
echo "DOC_EXIT=$DOC_EXIT"
```

| Result | What it means | What to do |
|--------|---------------|------------|
| `HTTP_CODE=200` | reachable | proceed normally |
| `curl: (5)/(6)` — could not resolve host or proxy | **the environment's network policy**, not a broken URL | apply the generic proxy/DNS remediation in `references/ttp/troubleshooting.md#tap-to-pay`, then retry |
| `HTTP_CODE=4xx/5xx` | the URL or the host is genuinely at fault | report it; the link may have moved |

**A DNS or proxy failure is not evidence that the documentation is unavailable**, and it must not be
reported as a defect in this skill or in the Visa Acceptance documentation. Establish which of the two
you are looking at before drawing a conclusion.

**If it remains unreachable after remediation:** continue with the gates that do not depend on a
documentation read, and record in the gate report which pages could not be fetched and which decisions
were therefore made from this skill's own resolved-API tables alone. Do **not** halt the whole
integration for it, and do **not** claim a documentation-derived fact you could not read.

### Local resources (`references/ttp/`)

These files contain information **not available** in the official documentation — resolved API
names, environment-specific guidance, and knowledge from real integration testing.

| File | Contents |
|------|----------|
| `references/ttp/constants/ttp-sdk-requirements.md` | **Single source of truth** — SDK coordinates, version, **resolved fully-qualified class names**, the decoy table, minimum build tools, project path variables, device requirements, the three readiness states |
| `references/ttp/constants/ttp-questions.md` | **Canonical question bank** — every question this workflow may ask, with its verbatim `header`, question text, option labels and option descriptions. Ask from here; never compose a question from prose |
| `references/ttp/troubleshooting.md` | All integration-testing troubleshooting in one file — anchors: `#tap-to-pay` (shared setup, network, credentials, enrollment), `#ttp-charge`, `#ttp-refund`, `#ttp-tipping`, `#ttp-pre-auth`, `#ttp-incremental-auth` |

### Activity files (`references/ttp/activities/`)

| Gate | Activity file | Description |
|------|--------------|-------------|
| Planning | `act_TTP_00_planning.md` | Project analysis, path resolution, plan generation |
| Gate 1 | `act_TTP_01_setup-sdk-dependencies.md` | SDK Gradle dependencies |
| Gate 2 | `act_TTP_02_obtain-credentials.md` | MID + Acceptance Devices Secret Key |
| Gate 3 | `act_TTP_03_device-enrollment.md` | Device enrollment (mechanism) |
| Gate 4 | `act_TTP_04_menu-transactions-device-status.md` | Top menu: transaction history + Device Status (enrollment presentation) |
| Gate 5 | `act_TTP_05_implement-charge.md` | Charge transaction + the `MposUi` holder |
| Gate 6 | `act_TTP_06_implement-refund.md` | Refund and stand-alone credit |
| Gate 7 | `act_TTP_07_implement-tipping.md` | On-reader tipping |
| Gate 8 | `act_TTP_08_implement-pre-auth-capture.md` | Pre-auth, incremental auth, capture |
| Gate 9 | `act_TTP_09_implement-account-verification.md` | Account verification — a card check that takes no money |
| Gate 10 | *(defined inline in Step 2 below)* | Manual on-device validation |

Each activity file contains:
- Critical Rules, Prerequisites, Workflow steps, Acceptance Criteria
- **Agent Prompt Template** — the full prompt the workflow injects variables into and hands to the
  subagent

---

## Path variables — establish these before Step 0

Two directories are in play, and on a multi-project build they are never the same one.

| Variable | Resolved by | Owns |
|----------|-------------|------|
| `SKILL_DIR` | the entry-point guide | every `references/…` path in this workflow |
| `GRADLE_ROOT` | the entry-point guide (ancestor walk for `settings.gradle[.kts]`) | `gradlew`, `gradle/wrapper/`, `settings.gradle[.kts]`, `local.properties`, `project-plan.md` |
| `ANDROID_MODULE_DIR` | the planning gate | module `build.gradle[.kts]`, `src/`, `proguard-rules.pro` |
| `GRADLE_MODULE_PATH` | the planning gate | the Gradle task path for that module |
| `SOURCE_ROOT` | the planning gate | application sources |
| `GRADLE_ARGS` | Step 1c | extra args every build command must carry |

**`$(pwd)` is not the Gradle root.** An Android app inside a larger build is normally opened at its
own module directory, so the wrapper and settings file are in an ancestor. If this workflow is
entered without `GRADLE_ROOT` set, resolve it before Step 0 — see
`references/ttp/constants/ttp-sdk-requirements.md` § *Project Path Variables*. Assuming `$(pwd)`
makes every gate's build check fail on a correctly-configured project, and the failure reads as the
gate's own edit rather than as a path error.

Every command in this workflow and in the activity files runs from `$GRADLE_ROOT`.

**`SKILL_DIR` must be injected into every gate agent.** A gate agent works from `$GRADLE_ROOT`, so a
bare `references/ttp/...` path resolves against the *project*, where the skill does not live — the read
fails with `No such file or directory`, and if it was `&&`-chained with other reads, everything after
it is skipped too. The skill may be installed globally, per repository, or under a module; none of
those are guessable from the project. Pass the absolute path and let agents read
`"$SKILL_DIR/references/ttp/..."`.

---

## Gate Registry

This table is the **single source of truth** for gate ordering, activity mapping, and skip
logic. When adding a new gate: (1) add a row here, (2) add a gate section in Step 2 below,
(3) add a row to the Step 4 Summary template.

| # | Name | Activity | Skip condition | Requires build |
|---|------|----------|----------------|----------------|
| 0 | Baseline Build & Quality | *inline — Step 2, Gate 0* | **never skipped** | yes |
| 1 | SDK Dependencies | `act_TTP_01_setup-sdk-dependencies.md` | Plan: `gate_1_sdk_deps = skip` | yes |
| 2 | Merchant Credentials | `act_TTP_02_obtain-credentials.md` | Plan: `gate_2_credentials = skip` | yes |
| 3 | Device Enrollment | `act_TTP_03_device-enrollment.md` | Plan: `gate_3_enrollment = skip` | yes |
| 4 | Menu: Transactions & Device Status | `act_TTP_04_menu-transactions-device-status.md` | Plan: `gate_4_menu = skip` — **never `declined`** | yes |
| 5 | Charge Transaction | `act_TTP_05_implement-charge.md` | Plan: `gate_5_charge = skip` — **never `declined`** | yes |
| 6 | Refund Transaction | `act_TTP_06_implement-refund.md` | Plan: `gate_6_refund = skip \| declined` | yes |
| 7 | Tipping | `act_TTP_07_implement-tipping.md` | Plan: `gate_7_tipping = skip \| declined` | yes |
| 8 | Pre-Auth & Capture | `act_TTP_08_implement-pre-auth-capture.md` | Plan: `gate_8_pre_auth_capture = skip \| declined` | yes |
| 9 | Account Verification | `act_TTP_09_implement-account-verification.md` | Plan: `gate_9_account_verification = skip \| declined` | yes |
| 10 | Manual Device Validation | *inline — Step 2, Gate 10* | Q2: no compatible device available | no |
<!-- EXTENSION POINT: insert new gates here and update the numbered sections in Step 2 -->

**Gate 0 has no skip condition and runs first, always.** It measures the project *before* any
modification, which is the only thing that lets a later gate distinguish "I broke this" from "this
was already broken". A gate that reports `FAIL` against an unmeasured baseline is not reporting
anything: on a repository committed in a non-compiling state, the first gate to run absorbs the blame
for every pre-existing error and the integration halts on a false diagnosis.

**Gates 3, 4 and 5 are never `declined`.** Enrollment, the operator menu and charge are the foundation
of every other Tap to Pay gate: Gate 6 refunds a charge, Gate 7 rewrites Gate 5's
`createTransactionIntent()` call site, and Gate 8 reuses Gate 5's `MposUi` holder. Gate 4 owns the only
enrollment entry point in the app and the navigation surface Gates 6 and 8 attach their actions to. They
are either `run` or `skip` (already implemented) — there is no valid integration without them.

> **Gate 4's *transaction history* is not separately declinable either.** Both menu entries —
> `Transactions` and `Device Status` — ship unconditionally (`act_TTP_04` Critical Rule 9). Gates 6 and 8
> attach refund and capture to the transaction detail page this gate creates, so an app without it has
> nowhere to put a control that acts on a *chosen* transaction. The question that used to make the
> `Transactions` entry optional (`Q10`) was **withdrawn** — do not look for it, and do not treat its
> absence as an undecided question to resolve on the developer's behalf. See the bank's `Q10` entry.

**Gate 10 is where every on-device claim is settled.** Activities 3–9 defer their hardware-dependent
acceptance criteria to `TTP Gate 10 (manual device validation)`. Gate 10 is the definition of that
reference. It is governed by Q2 only — never by `gate_skip_decisions` — so it runs whenever a
compatible device is available, even if every implementation gate was detected as already complete.

---

## Gate Execution Protocol

This protocol applies to **every gate** in the registry. It is stated once here — individual
gate sections below do not repeat it.

For each gate:

1. **Check the skip condition** from the Gate Registry (`gate_skip_decisions` in `project-plan.md`
   for Gates 1–9; Q2 for Gate 10).
2. **Update the Progress Tracker** in `project-plan.md`:
   - If skipping: set Status to `skipped` with a note explaining why.
   - If running: set Status to `in_progress`.

   Then mirror the change into the session task list — see § *Mirroring the tracker into the task list*.
3. If the gate must run, **spawn one implementation agent** with the prompt from the
   activity file's `## Agent Prompt Template` section, injecting the workflow's variables.
4. **Wait for the agent to report** — it must report `PASS` or `FAIL` with evidence.
5. **Reconcile the Requested Capabilities table BEFORE accepting `PASS`.** Read the rows this gate owns
   from `project-plan.md` § *Requested Capabilities* and check the gate's report against each one.
   - Every row with `Requested = yes` that the report evidences → set its Status to `done`.
   - **Any row with `Requested = yes` that the report does not evidence → set it to `missing`, and treat
     the gate as `FAIL` regardless of what the agent reported.** An agent reporting `PASS` on a subset of
     what was asked for is the single most likely way a capability is lost, and it is invisible in the
     gate table alone. Re-run the gate for the missing capabilities.
   - Do not accept a report that names implemented capabilities without naming the requested set — that
     is not evidence, it is a restatement. Compare against the plan, not against the report's own framing.

   > **A gate cannot certify its own completeness.** The gate agent knows what it built; only the plan
   > knows what was ordered. This step is the workflow's job precisely because the gate agent may have
   > lost the original answers — after a compaction, its own idea of scope is a summary of a summary.

6. **Update the Progress Tracker** in `project-plan.md`:
   - `PASS` **and** every owned capability row `done`/`n/a` → set Status to `done`, add a brief note
     (e.g., "SDK 2.115.0 configured"). Show a 2–3 bullet summary of what was done.
   - `FAIL`, **or any owned row left `missing`** → set Status to `failed`, add the failure reason —
     naming the missing capabilities explicitly. Stop immediately, show the agent's failure report to the
     developer, and do not continue to the next gate.

   Then mirror the change into the session task list — see § *Mirroring the tracker into the task list*.
7. For gates with `Requires build = yes`: the implementation agent must not report `PASS`
   unless the module build succeeds with an **observed exit status of 0**:

   ```bash
   "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
     > /tmp/ttp-build.log 2>&1
   BUILD_EXIT=$?
   ```

   **`PASS` requires `BUILD_EXIT` to be 0.** Three rules follow from that, and every one of them has
   been violated in a real run:

   - **Never pipe the build command** into `tail`, `head`, `grep` or `tee`. In a pipeline the shell
     reports the *last* command's status, and a filter essentially always succeeds — so a failed
     build reports exit 0 and the gate certifies broken code. This is the single most dangerous
     idiom in the whole workflow, because it silently disables gate-to-gate build gating, which is
     the property the gates exist to provide.
   - **Never infer success from output text.** The absence of the word `error` is not an exit status.
   - **Never accept a build of the whole repo as evidence for this gate.** `$GRADLE_MODULE_PATH`
     scopes it to the module the gate touched; without it, an unrelated module's failure becomes
     this gate's `FAIL`, and an unrelated module's success pads this gate's `PASS`.

   If a pipe is genuinely unavoidable, `set -o pipefail` or test `${PIPESTATUS[0]}` — but
   redirect-then-check is simpler, portable, and leaves a log to read.

   **Measure against Gate 0's baseline, not against perfection.** If `baseline_build` is `fail` and
   the developer accepted it, `PASS` means *no new errors beyond the baseline set*. If the project has
   a quality task, re-run it and require **no new rule types and no findings in files this gate
   created** — never an absolute pass. A repository that was already red cannot be made green by a
   gate that did not make it red, and requiring that converts unrelated pre-existing debt into a
   blocker for the integration.

   **Which of the two baselines to re-run** (Gate 0 records both — see § *0.2 Baseline quality gate*):

   | Re-run | When |
   |--------|------|
   | `baseline_quality_task` (Kotlin) | every gate, unconditionally |
   | `baseline_quality_task_2` (Android `lint`) | whenever the gate touched `AndroidManifest.xml`, anything under `res/`, or a `build.gradle*` file — **always Gates 1, 3 and 4** — and at the final clean build |

   > **Gates 3 and 4 both touch non-Kotlin files**, which is easy to forget because their subjects read
   > as code. Gate 3 adds the `EnrollDeviceActivity` theme override to `AndroidManifest.xml`
   > (`act_TTP_03` Step 4); Gate 4 adds menu resources and drawer layouts under `res/`
   > (`act_TTP_04` Step 1). Gates 5–9 write only Kotlin/Java unless a specific step says otherwise.

   > A gate that edited only Kotlin may skip the `lint` re-run; a gate that edited the manifest may
   > **not** skip it. Detekt and ktlint do not read manifests, resources or Gradle files at all, so on
   > a manifest-only gate the Kotlin diff is guaranteed to match baseline no matter what changed. That
   > is not evidence of no regression — it is the absence of a measurement. Say which of the two you
   > re-ran in the gate report; "quality gate: no new findings" without naming the task is unfalsifiable.
8. **Always-fires decisions** — see § *Always-fires decisions* below. These are **not** governed by
   `CHECKPOINT_MODE`. Resolve any that the gate raised before moving on.
9. **Per-gate checkpoint** (only when `CHECKPOINT_MODE = per_gate`):
   After a gate reports `PASS`, present the gate report summary to the developer and use
   `AskUserQuestion` with these options:
   - **Test on device now** — *include this option whenever `DEVICE_AVAILABLE = yes`, and list it
     first from Gate 3 onward.* Build and install the current APK, then walk the one behaviour this
     gate added. The procedure and the outcomes are in § *Mid-run device test* below.
   - **Continue to next gate** — proceed normally.
   - **Review changes** — pause so the developer can inspect modified files. After review,
     ask again: Continue or request fixes.
   - **Request fixes** — developer describes the issue. Re-run the gate's implementation
     agent with the corrections. Repeat until the developer approves.
   - **Stop here** — halt the entire workflow. Update remaining gates to `pending` and
     inform the developer they can resume later.
   If `CHECKPOINT_MODE = autonomous`, skip this step and proceed to the next gate immediately.
   **`CHECKPOINT_MODE` governs this step and nothing else** — see the next section.

#### Mid-run device test

**Why this option exists.** Without it, a phone can be connected and eligible for the whole run and
never once be touched until Gate 10 — nine gates of unexercised code, and then a single validation
pass that has to attribute every failure to one of nine candidates. The first tap is the most
informative event in this integration; postponing it until everything is written is the most
expensive place to put it. A gate tested the moment it lands has exactly one suspect.

**When `DEVICE_AVAILABLE = yes`, a gate from 3 onward may not be recorded as complete until the
developer has either exercised it on hardware or said, in answer to this checkpoint, that they would
rather not.** Not a device *pass* — a device *answer*. Declining is a legitimate answer and takes one
click; what is not allowed is advancing without asking, because a deferral nobody chose is
indistinguishable at Gate 10 from a deferral nobody noticed.

Record the answer in the gate's report, verbatim, as one of:

```
Device check:  exercised — <what was tapped, what happened>
Device check:  declined by developer — deferred to Gate 10
Device check:  not applicable — nothing this gate added is observable on device
```

**Procedure.**

1. Build and install. This is the step the developer runs, not the session — the toggle in step 2 is
   physical:
   ```bash
   ./gradlew "$GRADLE_MODULE_PATH:installDebug"
   ```
2. **From Gate 3 onward, mind the developer-options deadlock** — installing needs USB debugging on,
   enrolling needs developer options off. Full explanation in
   `constants/ttp-sdk-requirements.md` § *CRITICAL — the adb / developer-options deadlock*. The order
   is: install, toggle developer options **off**, launch, exercise, toggle back **on** for the next
   install. Say this every time the option is offered after Gate 3, and say it *before* they pick —
   a mid-run test costs a toggle cycle, and a developer who knows that can decide whether this gate
   is worth one. Before Gate 3 there is no enrollment involved and no toggling needed.
3. Name the single thing to try. One gate, one behaviour, and phrase it as an observation rather than
   a verdict — "tap **Charge**, present a test card, and tell me what the screen says" beats
   "verify the charge flow works".
4. Take what they report at face value and act on it: a failure goes straight to **Request fixes**
   with their words as the description, not into the report as a deferral.

**Never claim a device result the developer did not give you.** `installDebug` succeeding is evidence
about Gradle, not about a payment. If the developer says nothing about what happened on the screen,
the gate report line is `declined by developer`, not `exercised`.

**Under `CHECKPOINT_MODE = autonomous` this checkpoint does not fire, and that stays true here.** The
option is part of the per-gate checkpoint, so an autonomous run skips it — hands-off was the request.
What an autonomous run must still do is record `Device check: not exercised (autonomous)` on every
gate from 3 onward, and carry the count into the Step 4 final summary: *"Gates 3–9 built and never
run on the connected device; all on-device criteria are outstanding at Gate 10."* A connected device
that went unused for an entire autonomous run is a fact the developer is entitled to before they read
a page of passes.

### Mirroring the tracker into the task list

The Progress Tracker lives in `project-plan.md` and nothing renders it while the run is going. A
developer watching a gate execute sees agent output and gate reports, with no indication of where in
thirteen rows the run currently is — so "how much is left?" costs them a file read, and after a long
gate the answer is genuinely not obvious. Mirror it into the session task list so the shape of the run
is visible without asking.

**Create the tasks once**, immediately after the plan is approved in Step 1b — one `TaskCreate` per
Progress Tracker row, in tracker order, subject matching the row's `Task` text. Rows the plan marks
`skipped` still get created; a skipped gate that never appears reads as a gate nobody considered.

**Update at gate boundaries only** — the two `TaskUpdate` points are Gate Execution Protocol steps 2
and 6, and nowhere else:

| Tracker status | `TaskUpdate` status |
|----------------|---------------------|
| `in_progress` | `in_progress` |
| `done` | `completed` |
| `skipped` | `completed`, with the skip reason kept in the description |
| `failed`, `blocked` | leave `in_progress` — the work is not finished, and marking it `completed` because the run stopped is the one update that actively misinforms |

**Do not update mid-gate.** A gate is one unit of progress; sub-steps churning through the task list
during a ten-minute gate is noise that costs the display its meaning.

> **`project-plan.md` stays authoritative and the task list is never read back.** Resume logic reads
> the plan file, not the task list — see § *Check for Prior Progress (Resume Support)* and the rule
> that **the plan is right** when the two disagree. The task list does not survive a session; the plan
> does, which is the entire reason the plan exists. So if a `TaskUpdate` fails or the tools are
> unavailable, note it and carry on: the mirror is a display, and a display being broken is not a
> reason to stop an integration. Never resolve a conflict in the task list's favour, and never
> reconstruct a tracker row from it.

**In `CHECKPOINT_MODE = autonomous`, also print a one-line progress marker at each gate boundary.**
An autonomous run has no checkpoint that pauses to summarise, so between plan approval and the final
summary there is otherwise nothing at all:

```
[TTP 4/13] Gate 3 Device Enrollment — done (enrolled, serial recorded). Next: Gate 4 Menu.
```

One line, at the boundary, nothing between boundaries. This does not weaken `autonomous`: the developer
asked not to be *interrupted*, which is a request about questions, not about output — the same
distinction § *Always-fires decisions* draws. A print costs them nothing and does not wait for them.

### Always-fires decisions

Some points in this workflow are **not** progress checkpoints. They are decisions the skill has
declared are not its to make, and they fire whether `CHECKPOINT_MODE` is `per_gate` or `autonomous`.

> **`autonomous` means "do not interrupt me for progress". It has never meant "decide on my behalf
> and don't mention it".** Those are different permissions, and a run that treats the first as the
> second manufactures consent for a product decision. The `Required Upgrade Consent Protocol` already
> says this for versions — *"Even if the skill knows the correct fix, it MUST ask first"* — and that
> rule is stated in a constants file the Gate Execution Protocol never pointed back at. This section
> is where the general form lives.

**Current members.** An activity file that says *"surface this to the developer"*, *"it is not this
skill's to make"*, or *"confirm with the user before writing code"* is in this category by
construction, whether or not it appears here:

| Decision | Raised by | Safe default? |
|----------|-----------|---------------|
| `supportsRtl` flipped app-wide by the SDK's manifest | `act_TTP_01` § *Step 4* | **Yes** — leave the SDK's value; do not counter-override |
| A version change not already in `required_upgrades` (AGP, Kotlin, Java, **`minSdk`**) | any gate; § *Version-change rule* | **No** — the gate cannot proceed either way |
| Which payment entry-point screens get Tap to Pay | `act_TTP_05` § *Step 2*, criterion 6 | **No** — writing into the wrong screens is not reversible by deleting code |
| Exposing the summary screen's *Increase Hold* button when `INCREMENTAL_AUTH_REQUESTED = no` | `act_TTP_08` Critical Rule 9 | **Yes** — omit `INCREMENT_TRANSACTION`; the flow was never verified in TEST |
| Which screen hosts the `Verify card` action | `act_TTP_09` § *Step 5: The UI affordance* | **No** — the card-on-file use case usually lives with a customer record, not the till, and this skill cannot tell which screen that is |

Not in this category, and a useful contrast: `act_TTP_08`'s Critical Rule 2b ("pick a
multiple-holds model and state it in the gate report") is an **implementation choice with mandatory
disclosure**. The gate decides, then says what it decided. Nothing waits on the developer. Most
"state it in the report" instructions are this kind, and reading them as always-fires questions
would turn an autonomous run into an interview.

**The rule.**

- **A safe default exists** when doing nothing is reversible, leaves no code behind, and does not
  change behaviour outside Tap to Pay. Take it, and record it in the gate report's *Decisions taken
  without asking* block (below) with the one-line reversal. Do not stop.
- **No safe default exists** when the gate must pick between outcomes that are not equivalent, or
  when the choice changes the app beyond this integration. **Ask, even in `autonomous` mode.** State
  why the run stopped despite the hands-off request, so the interruption reads as deliberate.

**Report block.** Every gate that took a default without asking must end its report with:

```
Decisions taken without asking (CHECKPOINT_MODE=autonomous)
-----------------------------------------------------------
<what was decided>
  Why no question:  <the safe default that applied>
  To change it:     <the one action that reverses it>
```

Carry every such block into the Step 4 final summary. A default that is applied at Gate 1 and never
restated is indistinguishable, three gates later, from a decision the developer made.

> **Do not grow this list by inventing entries.** A gate that wants to add a member is describing a
> decision an activity file already mandates; if no activity file mandates it, it is an
> implementation choice and the gate should just make it.

### Deferred acceptance criteria are NOT passes

Every gate from 3 onward has at least one acceptance criterion that can only be met on real
hardware. When `DEVICE_AVAILABLE = no`, the implementation agent reports those criteria as
`DEFERRED → TTP Gate 10`, and the gate's overall status becomes
`PASS (on-device validation DEFERRED)`.

**Never let a deferred criterion be reported as met.** An agent that writes "transaction approved"
without a real approved transaction has fabricated the single most important result in the
integration. If an agent's report claims an on-device outcome while `DEVICE_AVAILABLE = no`, treat
the gate as `FAIL` and re-run it.

### Version-change rule (applies inside every gate)

If an implementation agent hits a build error whose fix is a version change that was **not**
already approved in `required_upgrades`, it must stop and report rather than apply it. Bring the
proposal back to the developer using the Step 1b consent procedure, then re-run the gate. See
`references/ttp/constants/ttp-sdk-requirements.md` § *Required Upgrade Consent Protocol*.

---

## Step 0 — Collect Developer Configuration

### Bind `GRADLE_ROOT` before the first file probe

Step 0 runs **before** the planning gate, so nothing has resolved the path set yet — and Step 0 is
already reading files. `project-plan.md` and `local.properties` both live at the Gradle root, which is
frequently *not* the invocation directory (see § *Path variables* above). Resolve it here:

```bash
# The Gradle root is the nearest ancestor holding settings.gradle[.kts]; fall back to gradlew.
GRADLE_ROOT=""
d=$(pwd)
while [ "$d" != "/" ]; do
  { [ -f "$d/settings.gradle.kts" ] || [ -f "$d/settings.gradle" ]; } && { GRADLE_ROOT=$d; break; }
  d=$(dirname "$d")
done
if [ -z "$GRADLE_ROOT" ]; then
  d=$(pwd)
  while [ "$d" != "/" ]; do
    [ -f "$d/gradlew" ] && { GRADLE_ROOT=$d; break; }
    d=$(dirname "$d")
  done
fi
[ -n "$GRADLE_ROOT" ] || { echo "FAIL: no settings.gradle[.kts] or gradlew in any ancestor"; exit 1; }
cd "$GRADLE_ROOT" || exit 1
echo "GRADLE_ROOT=$GRADLE_ROOT"
```

The planning gate resolves this again and owns the authoritative value; this is the minimum needed to
make Step 0's own probes well-defined. **Do not substitute `$(pwd)`.** On a module-directory
invocation an unanchored `[ -f project-plan.md ]` is false even when a plan exists one level up — so a
resumable session is misreported as `FRESH_START`, and "Start fresh — delete `project-plan.md`" cannot
find the file it claims to delete. That failure is silent in both directions.

### Re-entry — this protocol also applies mid-integration, not just at the start

**Run the prior-progress check below on every entry into this workflow, including a re-entry partway
through an integration that this same session started.** It is written as Step 0 because that is where a
fresh run meets it, but its trigger is *"you are about to act and you have not read the plan in this
turn"* — not *"the workflow is starting"*.

**The situation this exists for.** A long integration exhausts the context window, the developer compacts
it and says "continue". What is left is a summary: the gate list, the answers to the configuration
questions and any partially finished work are gone or lossy. An agent in that state will confidently
continue from the summary, and a capability the developer asked for — one refund type of three, a tipping
mode, account verification — is silently never built. **Nothing about that failure looks like a failure:**
no error, no failed build, no `FAIL` in any report. The gate is marked `done`, because from inside the
summary it looks done.

**So treat these as re-entry signals, and re-read `project-plan.md` before acting on any of them:**

- a bare "continue", "carry on", "keep going", "next", or "go on"
- the first request after a context compaction, however it is phrased
- any request you cannot place against a specific gate and its status
- **any moment you are about to write code and cannot name, from the plan, which gate you are in and
  which requested capabilities are still outstanding**

Re-reading the plan costs one file read. Guessing costs a capability the developer paid for and will not
discover until a merchant needs it.

> **Never re-derive state from the conversation when the plan is on disk.** The plan is authoritative for
> every configuration answer (`refund_types`, `capture_types`, `tipping_requested`,
> `account_verification_requested`, the path set, the credential method) and for gate status. If the
> conversation and the plan disagree, **the plan is right** — the conversation has been summarised at
> least once and the plan has not.

### Check for Prior Progress (Resume Support)

Before asking any questions, check whether `project-plan.md` already exists at the Gradle root
**and** contains a `# Progress Tracker` section.

```bash
if [ -f "$GRADLE_ROOT/project-plan.md" ] \
   && grep -q "# Progress Tracker" "$GRADLE_ROOT/project-plan.md"; then
  echo "PRIOR_RUN_DETECTED"
else
  echo "FRESH_START"
fi
```

### If `PRIOR_RUN_DETECTED`:

1. Read `project-plan.md` and parse the Progress Tracker table. **Match rows by their gate identifier
   and their status token, never by column position** — the planning gate is asked for a four-column
   table, but a plan written by an earlier run may have folded `Notes` into `Status`, and a positional
   parse against that silently reads the wrong cell rather than failing.
2. Present the current state to the developer:

   > A previous integration session was detected. Here is the progress so far:
   >
   > | Gate | Status |
   > | ... | ... |
   >
   > Would you like to resume from where it left off, or start fresh?

3. Use `AskUserQuestion` with options:
   - **Resume** — see the status table below. Every one of the six statuses must be accounted for.
   - **Start fresh** — delete `project-plan.md` and begin from the configuration questions below.

   **Resume rule — all six statuses.** The Progress Tracker uses `pending`, `in_progress`, `done`,
   `skipped`, `failed` and `blocked` (see `act_TTP_00_planning.md` § *6. Generate the Progress Tracker*, **Status values**). A rule written
   only around `done`/`skipped`/`pending`/`in_progress` leaves two of them unhandled, and an
   unhandled status is silently *stepped over* rather than reported:

   | Status | On resume |
   |--------|-----------|
   | `done` | skip |
   | `skipped` | skip |
   | `pending` | this is the restart point |
   | `in_progress` | restart this gate from the beginning — a partially applied gate is not a passed one |
   | `failed` | **re-run it.** The gate stopped mid-way, so its edits may be half-applied. Do not advance past it |
   | `blocked` | **re-run it.** Whatever blocked it may or may not have been resolved between sessions; the gate itself is the only thing that can tell you |

   Resume from the **first gate that is not `done` or `skipped`**, in gate order. Never select the
   restart point by looking for `pending` alone: on a session that ended with a `failed` or `blocked`
   gate, the first `pending` row is the gate *after* it, and starting there means the failure is
   inherited as if it had passed.

   **Then read § *Requested Capabilities* and re-open any gate that owns an outstanding row — even a gate
   marked `done`.** The gate table and the capability table can disagree, and when they do the capability
   table is right: a gate reaches `done` when an agent reported `PASS`, which on a compacted session may
   have meant "PASS on the part I could still remember".

   ```bash
   awk '/^# Requested Capabilities/,0' "$GRADLE_ROOT/project-plan.md" \
     | grep -E '^\|' | grep -Ev '^\|[- ]+\||Capability' \
     | awk -F'|' '{ gsub(/^[ \t]+|[ \t]+$/, "", $5);
                    if ($5 != "done" && $5 != "n/a") print "OUTSTANDING:" $0 }'
   ```

   Report every outstanding row to the developer as part of the resume summary, naming the gate that owns
   it. **A gate marked `done` with an outstanding capability row is the failure this table exists to
   catch** — treat it as `pending` and re-run it for the missing capabilities only. If the section does not
   exist (a plan from an earlier version of this skill), rebuild it from `refund_types`, `capture_types`,
   `incremental_auth_requested`, `tipping_requested` and `account_verification_requested` before resuming.

4. If resuming, **re-check session-dependent state** before jumping to Step 2.
   Do NOT re-run the planning agent or re-ask configuration questions — those are already captured
   in `project-plan.md`. Read the persisted values and apply them to this session:

   ```bash
   grep -E "^(checkpoint_mode|credential_method|key_source|android_module_dir|source_root|ui_toolkit|selected_sdk_version):" \
     "$GRADLE_ROOT/project-plan.md"
   ```

   But you MUST re-check the following, because they change between sessions:

   #### 4a. Re-check merchant credentials

   ```bash
   grep -E "^TTP_MERCHANT_(ID|SECRET)=" "$GRADLE_ROOT/local.properties" 2>/dev/null | sed 's/=.*/=<set>/'
   ```

   > **Never print credential values.** The `sed` above deliberately masks them. Report only
   > whether a value is present and whether it is still a placeholder.

   **If placeholders are found** (`MERCHANT_ID_HERE`, `MERCHANT_SECRET_HERE`, or
   `pending-manual-entry`):
   - Ask: "Last time, placeholder credentials were used. Do you have real Visa Acceptance TEST
     credentials now?"
   - Use `AskUserQuestion` with options:
     - **Yes — I'll edit `local.properties` myself** → tell the developer to update the file
       directly, then verify the values are non-placeholder before continuing.
     - **Yes — I'll enter them here** (⚠️ visible in terminal) → ask for MID and Secret Key in
       **two separate** questions, then update `local.properties`.
     - **No — keep placeholders** → continue, and re-state the consequence: **enrollment
       (Gate 3) cannot succeed and no transaction can complete.** Gate 10 will be `BLOCKED`, not
       merely deferred.

   **If real credentials are already present:** skip this check. Do not re-ask.

   **If Gate 2 is `done` and credentials were just updated:** no need to re-run Gate 2 — the
   values are read at build time from `local.properties` via `Properties().load()`. A rebuild
   picks them up.

   #### 4b. Re-check device availability

   Device availability changes between sessions. Always re-check, regardless of the previous Q2:

   ```bash
   adb devices 2>/dev/null | awk 'NR>1 && $2=="device"'
   ```

   **If a device is detected:** run the device pre-flight check before setting
   `DEVICE_AVAILABLE = yes` — a connected device is not necessarily an *eligible* one. Follow
   `references/ttp/constants/ttp-sdk-requirements.md` § *Device pre-flight — write-and-run script*:
   perform the checks described there (direct `adb` calls, or a scratch script you write yourself
   this run) and act on the three-state result.

   - Exit `0` → `DEVICE_AVAILABLE = yes`. If Gate 10 was previously `skipped` for want of
     a device, reset it to `pending`.
   - Exit `1` (a hard requirement failed) → show the failures, marking each as fixable or
     not, and ask the developer whether they can resolve them now or would rather use a different
     device. `DEVICE_AVAILABLE = no` only if they decline both.
   - Script exits `2` (**could not talk to a device — not a compatibility failure**) → `adb` missing
     from PATH, more than one device attached, or an unreachable device. See the exit-`2` table under
     Q2 for the remedy per message. Show the developer the remedy, ask them to apply it, and re-run;
     `DEVICE_AVAILABLE = no` only if they decline. Do not record the device as incompatible.

   **If no device is detected:** ask "No Android device detected over adb. Do you have a
   compatible one to test with?" — listing the compatibility criteria from the bank's `Q2` notes, since
   the developer cannot answer "compatible" without them — and set `DEVICE_AVAILABLE` accordingly.

   **On every branch above, `DEVICE_AVAILABLE = no` is the developer's decision, not an inference.**
   Say what forced the question and that Gate 10 will stay deferred, then take their answer.

5. After re-checking, jump to **Step 2** and begin executing from the first non-done gate.

### If `FRESH_START`:

Proceed to the configuration questions below.

---

### Assess the Developer's Current State

**The questions themselves are defined in
`references/ttp/constants/ttp-questions.md` — ask them from there, verbatim.** That file owns every
`header`, `question`, option `label` and option `description`. This section owns only the *order*, the
*operational procedures* an answer triggers, and what the answers are used for.

> **Do not restate a question here or compose one from this section's prose.** Recomposing an
> `AskUserQuestion` call from paragraphs produced different wording, different options and different
> option descriptions on every run of this skill. Transcribe from the bank instead. If a question
> needs changing, change it in the bank.

**Ask order** (the bank explains why it is not id order):

```
P2 → Q1 → Q1a → Q2 → Q3 → Q3a → Q3b → Q3c → Q4 → Q5 → P1 → Q9a → Q9b
   → Q6 → Q6a → Q6b → Q7 → Q7a → Q7b → Q7c → Q7d → Q8 → Q8a → Q8b → Q8c → Q11
```

> **`P2` runs first, before `Q1`, and it is not optional.** It resolves `EXISTING_SDK_PIN` — the version
> the project already pins, if any — and `PIN_SHARED_BY`, the number of artifacts governed by the same
> `version.ref`. Without it `Q1`'s `keep` option cannot be offered at all, so a project with a deliberate
> pin is silently asked to choose between "latest" and "let me choose", and the recommended answer for
> that project is missing from the list. `P1` is the *other* probe and runs later, after `Q5`.
>
> **There is no `Q10`.** It was withdrawn — see the bank's `Q10` entry. Gate 4 always ships both menu
> entries, so nothing is asked about the transaction history.

**Before the first question, declare the roster.** Evaluate every question's `ask when`, print the
full list with `ASK` / `SKIP` / `MAYBE` and a reason for each `SKIP`, and take **one** confirmation
for the whole list. The protocol and the print format are in the bank § *Roster declaration
protocol*.

> **Why this is mandatory.** Nine of these questions are conditional, so the set a developer sees
> legitimately differs between projects — and from their chair, a question skipped because it does
> not apply is indistinguishable from a question you forgot. The roster print is the only thing that
> tells them apart.

> **Note:** Gate skip decisions are NOT collected here. The Planning Agent (Step 1a) will
> analyse the codebase and propose which gates to skip based on what it detects. The
> developer reviews and approves those decisions in Step 1b.

---

### Operational procedures

Each procedure below is triggered by an answer. The bank's `then` and `note` fields point here; keep
both sides in step — **if you change a procedure, check the question that triggers it.**

#### Q1a repository validation

**Mandatory — do NOT skip.** The repository keeps only the **six most
recent** versions, so a plausible-looking version may simply have been removed. Verify against
`maven-metadata.xml` — never by scraping an HTML directory listing:

```bash
AVAILABLE_SDK_VERSIONS=$(curl -sS --max-time 20 \
  https://repo.visa.com/mpos-releases/io/payworks/mpos.android.taptophone/maven-metadata.xml \
  | grep -oE '<version>[^<]+</version>' | sed -E 's/<\/?version>//g' | sort -Vu | tail -6)
```

- **Requested version appears in the list:** store as `SELECTED_SDK_VERSION`. Proceed.
- **Not in the list:** present the error and re-ask, offering the available versions as options
  (newest first). Re-validate whatever the developer picks.

  > **SDK version `<entered>` is not available.**
  >
  > It either does not exist or has aged out — the repository keeps only the **6 most recent**
  > releases.
  >
  > Available: `<AVAILABLE_SDK_VERSIONS>` (oldest → newest)

- **Network error (timeout / DNS / connection refused):** the repository is unreachable. Accept the
  entered version tentatively, mark it unverified, and let Step 1c re-attempt validation — possibly
  through an internal mirror.

**If `SDK_VERSION_PREFERENCE = latest`**: `SELECTED_SDK_VERSION` is resolved in Step 1c.

**If `SDK_VERSION_PREFERENCE = keep`**: `SELECTED_SDK_VERSION` is already `EXISTING_SDK_PIN` from probe
`P2`. Skip the Step 1c version query — the version is not in question, and re-querying the repository
only creates an opportunity to overwrite a deliberate pin with the newest release.

#### Q2 device pre-flight

**Probe before asking `Q2`, exactly as the resume path does.** The session can see whether a phone is
plugged in; asking the developer to report it invites a mismatch between the two paths over the same
handset, and it reads as busywork to anyone who has already connected one:

```bash
adb devices -l 2>/dev/null | awk 'NR>1 && $2=="device"'
adb shell getprop ro.product.model  2>/dev/null | tr -d '\r'
adb shell getprop ro.build.version.release 2>/dev/null | tr -d '\r'
```

Feed the result into `Q2`'s preamble — the bank's first `note` gives the two openings. The probe
**informs** the question; it does not replace it. A developer with a phone on the desk but not yet
plugged in still answers `Yes`, and a connected phone may be someone else's build server.

**When `DEVICE_AVAILABLE = yes`**, run the pre-flight immediately — before any code is written,
because a disqualifying device changes what this session can honestly promise. Follow
`references/ttp/constants/ttp-sdk-requirements.md` § *Device pre-flight — write-and-run script*:
perform the checks described there (direct `adb` calls, or a scratch script you write yourself this
run) and act on the three-state result.

- Exit `0` → keep `DEVICE_AVAILABLE = yes`.
- Exit `1` → show the failed requirements, then ask the developer which way to go. Several are fixable
  in seconds (`auto_time`, NFC off, developer options), others not at all (no NFC, Android 11, no GMS).
  Say which kind each failure is, so the choice is informed: offer *fix and re-run*, *use a different
  device*, or *continue with `DEVICE_AVAILABLE = no` and defer Gate 10*.
- Exit `2` → **the check could not talk to a device at all. This is not a compatibility failure**, and
  it must not be reported as one — nothing about the phone has been assessed yet. Four causes, each
  with its own remedy, and the check's reported message names which one applies:

  | Message | Remedy |
  |---------|--------|
  | `adb not found on PATH` | install Android platform-tools |
  | `No device connected` | plug the phone in and accept the USB-debugging prompt on screen |
  | `More than one device connected` | re-run the check, passing the target serial explicitly |
  | `Cannot reach device '<serial>'` | re-plug, or re-authorise the debugging prompt |

  Show the developer the message and its remedy, and ask them to apply it — every one of these needs a
  hand on the hardware or a change to their machine, so none of them can be resolved from here. Re-run
  after they confirm. Only if they decline does `DEVICE_AVAILABLE` become `no`. Never record a device as
  incompatible on an exit `2` — "two phones are plugged in" is not evidence about either of them.

> **`DEVICE_AVAILABLE = no` is never set silently, on any path through this section.** Announce what
> forced it, state that Gate 10 becomes deferred and that no claim in the final report will be
> hardware-backed, and take the developer's answer. See the bank's `Q2` closing `note`.

#### Q3 credential handling

**Look before you ask.** Run this **before** asking `Q3`, on a fresh start as well as on a resume — a
pre-seeded or hand-edited `local.properties` is *most* likely on a first run, and asking without
checking offers the developer three options that are all wrong for a project already configured. The
result decides whether the bank's first `Q3` option exists at all:

```bash
grep -E "^TTP_MERCHANT_(ID|SECRET)=" "$GRADLE_ROOT/local.properties" 2>/dev/null \
  | sed 's/=.*/=<set>/'
grep -qE '^TTP_MERCHANT_ID=(MERCHANT_ID_HERE|pending-manual-entry)$' \
  "$GRADLE_ROOT/local.properties" 2>/dev/null \
  && echo "credentials: PLACEHOLDER" || echo "credentials: set or absent"

# Are the keys WIRED, or just present? Presence alone says nothing about whether this build
# can reach them. Nothing here prints a value.
grep -rlE 'TTP_MERCHANT_(ID|SECRET)' "$GRADLE_ROOT" \
  --include='*.gradle' --include='*.gradle.kts' --include='*.kt' --include='*.java' \
  --exclude-dir=build --exclude-dir=.gradle --exclude-dir=.git 2>/dev/null \
  && echo "credentials: WIRED (read by the files above)" \
  || echo "credentials: PRESENT BUT UNWIRED — no build file or source reads these keys"
```

> **Never print credential values.** The `sed` masks them, and the wiring check greps for the *key
> names* in build files and sources, never in `local.properties` itself. Report presence,
> placeholder-status and wiring only. This is the same check as the resume path's §4a, and it belongs
> on both paths for the same reason.

**When the keys are present but unwired, say so as part of offering the first `Q3` option.** Add this
line to the question's preamble — do not silently drop the option, and do not silently offer it clean:

```
Note: TTP_MERCHANT_ID / TTP_MERCHANT_SECRET are already in local.properties, but no build file
or source file in this project reads them. They may be current, or they may be left over from an
earlier attempt. Gate 2 will wire them to BuildConfig and verify they are present — it cannot
verify they are valid. That happens at Gate 3 (enrollment) or Gate 10.
```

> **Why this caveat exists.** `local.properties` is gitignored, so unwired keys have no history to
> inspect and no template to check against — a project's own `local.properties.example` may document a
> completely different key set for a different SDK. Presence plus non-placeholder was the whole
> evidence base for offering "use the credentials already here", and on an unwired project that
> option's `description` — *"Both keys are already present in this project"* — is true and misleading
> at the same time. The failure it produces is remote from its cause: Gate 2 reports `PASS`, and the
> first real signal is an enrollment failure several gates later.

**Branch table — what each `Q3` answer sets:**

| Answer | `CREDENTIAL_METHOD` | `MERCHANT_ID` / `MERCHANT_SECRET` | Also |
|--------|--------------------|------------------------------------|------|
| Use the credentials already in `local.properties` | `local_properties` | `"already-configured"` | Gate 2 verifies and writes nothing |
| Use the credentials already in `local.properties` (not currently wired) | `local_properties` | `"already-configured"` | Gate 2 must **wire** them to `BuildConfig` as well as verify presence — on this branch it cannot assume the plumbing exists |
| I'll edit `local.properties` myself | `local_properties` | `"pending-manual-entry"` | show the instruction block below |
| Enter them here | `interactive_input` | the entered values | ask `Q3a` and `Q3b` separately |
| I don't have them yet — use placeholders | `placeholder` | `"MERCHANT_ID_HERE"` / `"MERCHANT_SECRET_HERE"` | `KEY_SOURCE = "n/a"`; state the consequence |

> **When non-placeholder credentials already exist, do not offer the placeholder option without a
> warning.** Gate 2 writes `MERCHANT_ID_HERE` / `MERCHANT_SECRET_HERE` on that path, which overwrites
> working credentials. If the developer picks it anyway, state that consequence explicitly and get
> confirmation first.

**On "I'll edit `local.properties` myself"**, do two things before telling the developer anything.

**1. Make sure `local.properties` is git-ignored — before it can hold a secret, not after.** `act_TTP_02`
AC 3 requires the entry; requiring it at Gate 2 is too late, because the developer is about to paste a
live key into the file *now*, and between now and Gate 2 there is a window in which a `git add -A`
commits it. Check and, if absent, add:

```bash
grep -qxF 'local.properties' "$GRADLE_ROOT/.gitignore" 2>/dev/null \
  || printf '\n# Visa Acceptance merchant credentials — never commit\nlocal.properties\n' \
       >> "$GRADLE_ROOT/.gitignore"
```

`local.properties` is in the default Android Studio `.gitignore`, so on most projects this is a no-op
— which is exactly why it gets assumed rather than checked. It is absent often enough on hand-rolled
and template-generated projects to be worth two seconds.

**2. Scaffold the keys, so the developer edits a value rather than recalls a name.** If the file has no
`TTP_MERCHANT_ID` line, append the pair with empty values. Never overwrite an existing line — a
present-but-placeholder value is the probe's business, not this step's:

```bash
grep -qE '^TTP_MERCHANT_ID=' "$GRADLE_ROOT/local.properties" 2>/dev/null \
  || printf '\n# Visa Acceptance TEST credentials for Tap to Pay on Android (act_TTP_02).\n# TTP_MERCHANT_SECRET must be an "Acceptance Devices Secret Key" — no other\n# Business Center key type carries merchant configuration.\nTTP_MERCHANT_ID=\nTTP_MERCHANT_SECRET=\n' \
       >> "$GRADLE_ROOT/local.properties"
```

Then tell the developer, **with the absolute path resolved** — never the bare filename:

```
Open this file and fill in the two values:

  <the absolute $GRADLE_ROOT/local.properties, printed in full>

TTP_MERCHANT_ID=<your Visa Acceptance TEST Merchant ID>
TTP_MERCHANT_SECRET=<your Acceptance Devices Secret Key>

The keys are already scaffolded in the file with empty values. Nothing is echoed back here, and
local.properties is git-ignored. Gate 2 verifies both are present and non-placeholder before
proceeding — it never reads or prints the values.
```

> **Print the resolved path, not `local.properties`.** A multi-module repo has a `local.properties`
> per included build and several plausible places to put one, and `$GRADLE_ROOT` is frequently not the
> directory the developer is sitting in. "Your project's `local.properties`" sends them to guess, and
> a key written into the wrong file presents at Gate 3 as credentials that do not work — indistinguishable
> from the wrong key type until someone diffs two files.
>
> **These key *names* are TTP's.** The PAX path (`references/pax-aio/`) uses its own, so do not
> generalise this block into a shared one or copy the names across; a `TTP_`-prefixed key in a PAX
> project is silently unread.

**On "Enter them here"**, show this warning before asking `Q3a` and `Q3b`:

```
⚠️  WARNING: the values you type will be visible in plain text in this terminal, and — depending
on how your shell is configured — may be written to your shell history file, where they persist
after this session ends. The secret key is a live credential for a real merchant account.

You can still switch: choose "I'll edit local.properties myself" instead and the secret never
enters the terminal at all. I will git-ignore the file and scaffold the two keys for you.
```

> **Offer the way out, in the warning itself.** A warning that only states a risk leaves the developer
> holding it — they have already committed to this option, and re-opening the question is theirs to
> initiate. The alternative costs them one keystroke and this session already knows how to set it up,
> so say so. If they switch, run the `local.properties` branch above.

**On "use placeholders"**, state the consequence plainly:

> With placeholder credentials the project will build and the app will launch, but **device
> enrollment cannot succeed and no transaction can complete**. You will also see a
> `NullPointerException` from `PayButtonFeature` in logcat a couple of seconds after launch —
> that is the SDK reacting to an empty merchant configuration, i.e. "no credentials". It is
> expected on this path and is not a defect to debug. See
> `references/ttp/constants/ttp-sdk-requirements.md` § *Three Readiness States*.

These values are injected into the Gate 2 agent prompt — do NOT ask for them again inside Gate 2.

> **The secret key is shown only once.** In the Business Center, once you leave the Key Generation
> page the same secret key can never be retrieved again. If the developer is generating one now,
> tell them to copy or download it immediately.

#### P1 — probe for the app's own amount

Run this **before** `Q9a`, so `Q9b` and `Q7c` can offer what the project actually contains rather
than asking for a constant. The probe, and the rule that you never pick a candidate yourself, are in
the bank § *P1 — amount sources*.

> **Why the probe comes first.** `Q9b` used to ask unconditionally for a "test amount", which then
> became the amount **compiled into the charge call**. On an app that computes its own total that
> answer is collected and immediately discarded, because `act_TTP_05` prefers
> `payment_amount_source`. Gate 5 implements a payment *capability*; a capability takes its amount
> from its caller. A constant is correct only when there is no caller to take it from.

#### Amount resolution — which variable wins

| `PAYMENT_AMOUNT_SOURCE` | `TRANSACTION_AMOUNT` | What Gate 5 emits |
|-------------------------|----------------------|-------------------|
| non-empty (an expression) | recorded as `9.99`, **unused** | the expression, converted to `BigDecimal` at scale 2 |
| empty | the developer's choice at `Q9b` Form B | `BigDecimal("<TRANSACTION_AMOUNT>")` |

`TRANSACTION_AMOUNT` stays a valid decimal even when unused, so that a literal substitution can
never produce `BigDecimal("n/a")`. Declare it as unused in the roster print rather than asking for
it. The same relationship holds between `PRE_AUTH_AMOUNT_SOURCE` and `PRE_AUTH_AMOUNT` at `Q7c`.

---

### What the answers are for

Charge (Gate 5) and enrollment (Gate 3) are **always implemented** — every other transaction gate
builds on them. `Q6`, `Q7`, `Q8` and `Q11` cover the optional additions, and they drive the gate skip table
below.

Answers injected into a gate agent must **not** be re-asked inside it: `Q3`/`Q3c` → Gate 2,
`Q4` → Gate 1, `Q8`/`Q8a`–`Q8c` → Gate 7, `Q11` → Gate 9, `Q9a` → Gates 5–9. The gate-local questions that *do*
exist, and the standalone guard that keeps them from firing on a full run, are in the bank
§ *Gate-local questions*.

**Gate skip decision rules from Q6–Q8 and Q11:**

| Gate | Mandatory when | Declined when |
|------|---------------|---------------|
| 3 (Device Enrollment) | always | never |
| 4 (Menu: Transactions & Device Status) | always | never |
| 5 (Charge) | always | never |
| 6 (Refund) | never forced | `REFUND_REQUESTED = false` |
| 7 (Tipping) | never forced | `TIPPING_REQUESTED = false` |
| 8 (Pre-Auth & Capture) | never forced | `PRE_AUTH_CAPTURE_REQUESTED = false` |
| 9 (Account Verification) | never forced | `ACCOUNT_VERIFICATION_REQUESTED = false` |
| 10 (Manual Validation) | `DEVICE_AVAILABLE = yes` | `DEVICE_AVAILABLE = no` |

> **`declined` and `skip` are different, and only this table's right-hand column is about `declined`.**
> A gate is `declined` when the developer said they do not want the capability; it is `skip` when the
> planning agent detected the capability is already implemented. Gates 3, 4 and 5 can be `skip` — they
> can never be `declined`.

Record all answers — they determine gate configuration, transaction parameters, and how the
workflow pauses.

---

## Step 1a — Spawn the Planning Agent

**Before spawning any implementation agent**, spawn one planning agent to analyse the
project and produce a concrete implementation plan. The plan is used by every subsequent
implementation agent, and it is the **only** producer of `project-plan.md`.

**Activity file:** `references/ttp/activities/act_TTP_00_planning.md`

Read the Agent Prompt Template from that file and inject these workflow variables:

| Variable | Source |
|----------|--------|
| `<project root>` | `$GRADLE_ROOT` — **not** `$(pwd)`; see § *Path variables* |
| `SELECTED_SDK_VERSION` | Q1/Q1a (`EXISTING_SDK_PIN` from `P2` if `keep`; `N/A` if latest — resolved in Step 1c) |
| `DEVICE_AVAILABLE` | Q2 |
| `CREDENTIAL_METHOD` | Q3 (`local_properties` \| `interactive_input` \| `placeholder`) — how the credentials reach the build |
| `KEY_SOURCE` | Q3c (`already_have` \| `business_center` \| `rest_api` \| `n/a`) — how the secret key was obtained |
| `PROGUARD_ENABLED` | Q4 |
| `CHECKPOINT_MODE` | Q5 |
| `REFUND_REQUESTED`, `REFUND_APPROACH`, `REFUND_TYPES` | Q6/Q6a/Q6b |
| `PRE_AUTH_CAPTURE_REQUESTED`, `CAPTURE_TYPES`, `INCREMENTAL_AUTH_REQUESTED`, `PRE_AUTH_AMOUNT`, `PRE_AUTH_AMOUNT_SOURCE`, `UI_PATTERN` | Q7/Q7a–Q7d |
| `TIPPING_REQUESTED`, `TIP_ENTRY_MODE`, `TIP_PERCENTAGES`, `TIP_MAX_AMOUNT` | Q8/Q8a–Q8c |
| `ACCOUNT_VERIFICATION_REQUESTED` | Q11 |
| `TRANSACTION_CURRENCY` | Q9a |
| `PAYMENT_AMOUNT_SOURCE`, `TRANSACTION_AMOUNT` | Q9b — the source wins where both are set; see § *Amount resolution* |

> **Every field the plan schema says comes "from the workflow" must appear in this table.** The planning
> agent writes `project-plan.md` from its injected inputs and nothing else; a schema field whose producer
> is described but never injected is written as blank, and the gate that consumes it three steps later is
> where the failure shows up. If you add a field to `act_TTP_00_planning.md` § *3. Write `project-plan.md`*,
> add its row here in the same edit.

**Wait for the planning agent to complete and confirm `project-plan.md` was written.**

The plan must contain `android_module_dir`, `source_root`, and `ui_toolkit`. Every activity file
expresses its paths relative to those, and a plan without them sends the implementation agents
grepping paths that may not exist. If they are missing, re-run the planning agent — do not proceed.

---

## Step 1b — Plan Approval Checkpoint (Mandatory)

**CRITICAL RULE — developer consent for ALL version changes:**
No version change may be applied without the developer's explicit approval. This applies to AGP,
Kotlin, Gradle wrapper, Java, `minSdk`, `compileSdk`, and anything else in the build configuration.
See `references/ttp/constants/ttp-sdk-requirements.md` § *Required Upgrade Consent Protocol*.

Before executing any implementation gate, present the plan for approval. This is the
highest-value checkpoint in the workflow: catching a mistake here costs nothing, because no code
has been written yet.

### Procedure

1. Read the completed `project-plan.md`.

2. **Check for required version upgrades.** If `required_upgrades` is non-empty, present them
   **before** the gate summary — they must be approved first:

   > **Version Upgrades Required**
   >
   > The Tap to Pay SDK requires the following changes to your build configuration. Your current
   > versions are preserved wherever they already meet the requirements.
   >
   > | Component | Your version | Required minimum | Upgrade to | Reason |
   > |-----------|-------------|-----------------|------------|--------|
   > | _e.g._ minSdk | 25 | 31 | 31 | Tap to Pay requires Android 12; API 31 is a hard SDK floor |

   Use `AskUserQuestion` with options:
   - **Approve upgrades** — accept all listed changes and continue.
   - **Cancel integration** — stop here.

   If the developer cancels, do NOT proceed. End the session.

   > **`minSdk 31` deserves an explicit callout.** Raising it drops every device below
   > Android 12 from the app's addressable market. That is a product decision, not a build fix.
   > Present it as one, and if it is declined, stop and say plainly that Tap to Pay has no
   > workaround for it — rather than proceeding and failing at Gate 1.

3. Present the gate summary:

   > **Integration Plan Ready for Review**
   >
   > **Project:** `<package>` (`<language>`, `<gradle_dsl>`, `<ui_toolkit>`)
   > **Android module:** `<android_module_dir>`  **Sources:** `<source_root>`
   > **Payment screens found:** `<count>` — `<list of class names>`
   > **Version upgrades:** `<count>` approved / none needed
   > **Device for validation:** `<DEVICE_AVAILABLE>`
   >
   > **Gate Skip Decisions** (from codebase analysis):
   >
   > | Gate | Decision | Evidence |
   > |------|----------|----------|
   > | 1–8 | run/skip/declined | evidence from the planning agent |

4. Use `AskUserQuestion` with options:
   - **Approve — proceed with implementation** — continue to Step 1c.
   - **Review plan first** — pause so the developer can read `project-plan.md` in full.
   - **Override skip decisions** — developer specifies changes. Update `project-plan.md`.
   - **Request changes** — re-run the planning agent with corrections.

5. Do NOT proceed to Step 1c until the developer explicitly approves.

6. **Once approved, mirror the Progress Tracker into the session task list** — one `TaskCreate` per
   tracker row, in tracker order. See § *Mirroring the tracker into the task list*. Do this after
   approval and not before: the developer may still override skip decisions in step 4, and a task list
   built from a plan that then changed is worse than no task list at all.

---

## Step 1c — Connectivity Pre-Check (Mandatory)

**When:** after plan approval, before any implementation gate.
**Why:** Gate 1 spends a full build cycle on dependency resolution. Failing that on network
access is the most expensive way to discover a proxy problem.

### 1. Resolve the repository the project will actually use

The requirement is that the `io.payworks` group **resolves** — not that `repo.visa.com` appears in
the build files. Many organisations proxy external repositories through an internal repository
manager, and a project configured that way is correctly configured. Read `repo_url` from
`project-plan.md`; the planning agent records an existing declaration if the project already has one,
and falls back to the documented default otherwise.

> **If `repo_url` is a mirror, do not contact the documented `repo.visa.com` URL at all.** A failure
> against a host the project never intended to use is not a finding, and reporting it as one sends
> the developer chasing a firewall rule they do not need. Test the repository the *build* will use.

### 1b. Resolve `GRADLE_ARGS` — once, for every gate

Some repository blocks read their credentials from **JVM system properties**, which a bare `gradlew`
invocation does not supply. Detect that now, because the symptom — `401 Unauthorized` reported at the
dependency line — reads exactly like wrong coordinates, and every gate's build would fail on it.

```bash
cd "$GRADLE_ROOT" || exit 1
grep -rn -A6 'maven *{\|repositories' build.gradle* settings.gradle* 2>/dev/null \
  | grep -nE 'System\.getProperty|System\.getenv|providers\.gradleProperty|credentials'
```

- **No match, or credentials come from the Gradle home / environment** → `GRADLE_ARGS=""`. Done.
- **`System.getProperty(...)` in the repository block** → those properties must be supplied on every
  invocation. Ask the developer to either put `systemProp.<name>=<value>` in their
  `~/.gradle/gradle.properties` (preferred — non-interactive, keeps the secret out of shell history
  and out of the repository), or give you the `-D<name>=<value>` arguments to record in `GRADLE_ARGS`.

Record `GRADLE_ARGS` in `project-plan.md` and inject it into **every** gate. Never print the values,
and never write them into a file inside the project.

### 2. Confirm versions are visible

```bash
# REPO_URL is NOT set by the shell — read it out of project-plan.md first. Without this the
# documented default silently wins even on a project that correctly declares a mirror, and the
# resulting failure is against a host the project never intended to contact.
REPO_URL=$(grep -E '^repo_url:' "$GRADLE_ROOT/project-plan.md" 2>/dev/null \
  | sed -E 's/^repo_url:[[:space:]]*//; s/[[:space:]]*#.*$//')
REPO="${REPO_URL:-https://repo.visa.com/mpos-releases}"
curl -sS --max-time 20 \
  "$REPO/io/payworks/mpos.android.taptophone/maven-metadata.xml" \
  | grep -oE '<version>[^<]+</version>' | sed -E 's/<\/?version>//g' | sort -Vu | tail -6
```

Add `-u "<user>:<token>"` when the repository requires authentication — ask the developer for those
values or read them from their Gradle home; never hardcode or print them.

- **Versions listed:** if `SDK_VERSION_PREFERENCE = latest`, set `SELECTED_SDK_VERSION` to the
  highest. If the developer chose a version, confirm it appears in the list. If
  `SDK_VERSION_PREFERENCE = keep`, **do not reassign `SELECTED_SDK_VERSION`** — confirm the pinned
  version appears in the list and leave the value alone.
- **Nothing listed / network error:** the repository is unreachable. Apply the remediation in
  `references/ttp/troubleshooting.md#tap-to-pay` (proxy escalation, SSL/PKIX, DNS).
  **Do not work around it by removing the dependencies** — that is Gate 1's Critical Rule #1.

### 3. Confirm artifact bytes are retrievable

Metadata and artifacts fail independently, and this is the single most misleading failure on the
whole path — a proxy serving cached metadata while the bytes behind it are unreachable looks
exactly like a coordinate typo:

```bash
for A in paybutton-android mpos.android.taptophone; do
  printf '%s: ' "$A"
  curl -sS --max-time 20 -o /dev/null -w '%{http_code}\n' \
    "$REPO/io/payworks/$A/$SELECTED_SDK_VERSION/$A-$SELECTED_SDK_VERSION.pom"
done
```

Both must return `200`. **Metadata 200 + artifact 404 is a network problem, not a wrong
coordinate.** Do not "fix" the coordinates in response to it.

### 4. Confirm the rest of the toolchain is reachable

```bash
curl -sS --max-time 15 -o /dev/null -w 'google:  %{http_code}\n' https://dl.google.com/dl/android/maven2/
curl -sS --max-time 15 -o /dev/null -w 'central: %{http_code}\n' https://repo.maven.apache.org/maven2/
curl -sS --max-time 15 -o /dev/null -w 'wrapper: %{http_code}\n' https://services.gradle.org/distributions/
```

If a public registry is unreachable but the project already declares a mirror that resolves, that is
not a failure — check where the project's repository declarations actually point before escalating.

**Do NOT proceed to Step 2 until artifact retrieval succeeds or the developer cancels.**
Store the final `SELECTED_SDK_VERSION` for injection into the Gate 1 agent prompt.

---

## Step 2 — Execute Gates with Implementation Agents

Follow the Gate Execution Protocol above for every gate below, in order. Each gate's full agent
prompt is in its activity file's `## Agent Prompt Template` section — read it, inject the variables
listed, and spawn the agent.

**Every gate agent additionally receives** the full path set (`GRADLE_ROOT`, `ANDROID_MODULE_DIR`,
`GRADLE_MODULE_PATH`, `SOURCE_ROOT`, `GRADLE_ARGS`) and `UI_TOOLKIT` from `project-plan.md`. No gate
may hardcode `app/` or `./gradlew`.

---

### Gate 0 — Baseline Build (mandatory, never skipped)

**Activity:** *inline — this section.* **Requires build:** yes. **Skip condition:** none.

Every later gate asserts that the build passes. Gate 0 is what makes that assertion mean something:
without it, the first gate to run inherits any pre-existing breakage and reports it as its own.

That is not hypothetical. A repository can be committed in a non-compiling state — a UI file
referencing `BuildConfig` fields whose `buildConfigField` declarations were never added, for
instance. Run literally, Gate 1 would then fail its build check on errors in files it never opened,
the protocol says *stop immediately*, and the whole integration halts with the failure attributed to
the SDK dependency edit. The correct diagnosis — "this project was already broken" — is unreachable
without a measurement taken before anything changed.

**Run this before Gate 1, before any modification.**

#### 0.1 Baseline build

```bash
cd "$GRADLE_ROOT" || exit 1
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
  > /tmp/ttp-baseline-build.log 2>&1
BASELINE_BUILD_EXIT=$?
echo "BASELINE_BUILD_EXIT=$BASELINE_BUILD_EXIT"
grep -cE '^e: |error:' /tmp/ttp-baseline-build.log
tail -40 /tmp/ttp-baseline-build.log
```

#### 0.2 Baseline quality gate

The build is not the project's only acceptance signal, and on many Kotlin projects it is not the
strictest one. Detect what the project actually uses, then run it:

```bash
cd "$GRADLE_ROOT" || exit 1
"$GRADLE_ROOT/gradlew" -q tasks --all > /tmp/ttp-tasks.log 2>&1

# Match the module's OWN quality tasks. Two things this must get right:
#   1. Gradle module names legitimately contain '-' (android-testerapp), '_' and digits. A
#      character class of [a-zA-Z:] silently misses every hyphenated module.
#   2. The task must belong to THIS module. An unscoped match happily returns another module's
#      detekt task, and Gate 0 would then baseline the wrong module.
MODULE_PREFIX="${GRADLE_MODULE_PATH#:}"          # "" for a root-level app module
grep -oE "^${MODULE_PREFIX:+${MODULE_PREFIX}:}(detekt|ktlintCheck|spotlessCheck|lint)[A-Za-z]*" \
  /tmp/ttp-tasks.log | sort -u
```

If that returns nothing, widen the search **only to look**, and then decide deliberately — do not
adopt another module's task as this module's baseline:

```bash
grep -oE '^[A-Za-z0-9_.:-]*(detekt|ktlintCheck|spotlessCheck|lint)[A-Za-z]*' /tmp/ttp-tasks.log | sort -u
```

**More than one match is the common case, not an anomaly, and the pattern above cannot break the
tie.** An Android module with detekt configured exposes `detekt` *and* the whole `lint*` family. The
two tools do not overlap: detekt and ktlint read Kotlin sources; `lint` reads the manifest, resources
and Gradle files. Picking one silently discards a whole class of finding.

**Take two baselines and give them different jobs:**

| Field | Which task | Re-run at |
|-------|-----------|-----------|
| `baseline_quality_task` | the Kotlin tool — `detekt`, else `ktlintCheck`, else `spotlessCheck` | **every** gate |
| `baseline_quality_task_2` | the Android tool — `lintDebug`, else the plainest `lint*` variant | gates that touch the manifest, resources or Gradle files (**always Gates 1, 3 and 4** — Gate 3 adds the `EnrollDeviceActivity` theme override and Gate 4 adds menu resources/layouts), plus the final clean build |

```bash
# List the module's own candidates, prefix stripped. NOTE: do NOT anchor these patterns with '$' —
# `gradlew tasks --all` prints "module:lintDebug - Runs lint on the Debug build.", so a trailing
# anchor matches nothing and reports "no quality task" on a module that has four.
PFX="${MODULE_PREFIX:+${MODULE_PREFIX}:}"
strip() { sed "s/^$PFX//"; }

grep -oE "^${PFX}(detekt|ktlintCheck|spotlessCheck)[A-Za-z]*" /tmp/ttp-tasks.log \
  | strip | sort -u > /tmp/ttp-kotlin-tasks
grep -oE "^${PFX}lint[A-Za-z]*" /tmp/ttp-tasks.log \
  | strip | sort -u > /tmp/ttp-android-tasks

# Prefer the plainest variant of each family — a *Fix task rewrites code, and Gate 0 only measures.
KOTLIN_TASK=""; for w in detekt ktlintCheck spotlessCheck; do
  grep -qx "$w" /tmp/ttp-kotlin-tasks && { KOTLIN_TASK=$w; break; }
done
ANDROID_TASK=""; for w in lintDebug lint; do
  grep -qx "$w" /tmp/ttp-android-tasks && { ANDROID_TASK=$w; break; }
done
echo "KOTLIN_TASK=${KOTLIN_TASK:-none}  ANDROID_TASK=${ANDROID_TASK:-none}"
echo "not baselined:"; grep -hvxF -e "$KOTLIN_TASK" -e "$ANDROID_TASK" \
  /tmp/ttp-kotlin-tasks /tmp/ttp-android-tasks
```

Record the "not baselined" list in the gate report. `lintFix` and `ktlintFormat` are deliberately not
chosen — they modify sources, and Gate 0's entire job is to measure HEAD without touching it.

> **Why the split rather than "prefer detekt" or "run everything at every gate".** Preferring one
> tool is what produced a real, observed hole: on a run that chose `detekt`, Gate 1 — the gate that
> edits `AndroidManifest.xml` and `build.gradle.kts`, including the app-wide `supportsRtl` override —
> reported a quality diff *identical to baseline by construction*, because detekt lints neither file.
> The gate certified "no regression" on a measurement that could not have detected one. Running the
> full `lint` family at all eleven gate boundaries instead would cost minutes per gate to re-measure
> files most gates never touch. Match the tool to what the gate changed.

> **`baseline_quality_task_2: none` is a legitimate result** — a Kotlin-only library module has no
> `lint`. `baseline_quality_task: none` on a module that *does* expose a Kotlin quality task is not;
> see the warning below.

> **`baseline_quality_task: none` must mean "this module genuinely has no quality task", never "my
> pattern did not match".** The two are indistinguishable downstream: every gate then skips its
> quality diff, and the protocol reports a clean comparison it never performed. Android application
> modules almost always have `lint`/`lintDebug`, so `none` on an Android app module is a signal to
> re-check the pattern, not a result to record.

Run **each** task that exists against **unmodified HEAD**, and record the exit code and the finding
count separately for each:

```bash
for pair in "1:$KOTLIN_TASK" "2:$ANDROID_TASK"; do
  N=${pair%%:*}; TASK=${pair#*:}
  [ -n "$TASK" ] || { echo "BASELINE_QUALITY_TASK_$N=none"; continue; }
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:$TASK" \
    > "/tmp/ttp-baseline-quality-$N.log" 2>&1
  EXIT=$?          # capture BEFORE any other command runs — $? is overwritten by the next one
  echo "BASELINE_QUALITY_TASK_$N=$TASK BASELINE_QUALITY_EXIT_$N=$EXIT"
  tail -40 "/tmp/ttp-baseline-quality-$N.log"
done
```

`baseline_quality_task` in the plan is `$KOTLIN_TASK`; `baseline_quality_task_2` is `$ANDROID_TASK`.
Record the finding count **and the rule types** for both — a count alone cannot answer "is this a new
rule type or more of an existing one", which is the question every later gate's diff asks.

#### 0.3 Decide

| Baseline build | Action |
|----------------|--------|
| exit 0 | Record `baseline_build: pass`. Proceed to Gate 1. |
| non-zero | **STOP and report to the developer.** |

When the baseline build fails, say plainly: *"this project does not currently compile, for reasons
unrelated to Tap to Pay"*, show the errors, and offer four options via `AskUserQuestion`:

- **Fix the baseline first** — the developer triages it; the integration pauses. Mark Gate 0
  `blocked`, not `done`.
- **I'll fix it — you tell me what's wrong** — the developer explicitly directs *you* to repair it.
  Allowed only under the guardrails below.
- **Proceed on a branch anyway** — accepted knowingly; every later gate's build check is then
  measured as a *diff* against these known failures, not as an absolute pass. Set
  `baseline_accepted_by_developer: true`.
- **Abort.**

**Do not silently repair it.** Pre-existing breakage is the developer's to triage: it may be
half-finished work, a deliberate WIP commit, or a broken merge, and none of those are this skill's
to guess at. Fixing it quietly also destroys the baseline — the one measurement that lets every later
gate say "I did not cause this".

**Guardrails for the directed-repair option.** *Silently* is the word that matters in the rule above;
a repair the developer explicitly asked for is not silent. When they choose it:

1. **Scope the change to what compilation needs, and nothing else.** No Tap to Pay edits in the same
   change — otherwise Gate 1's diff is no longer attributable to Gate 1.
2. **Derive values, never invent them.** If a missing `buildConfigField` needs a default, take it from
   an existing `local.properties.example`, a test fixture, or an inert loopback — and say where each
   one came from.
3. **Record both measurements** in `project-plan.md`: `baseline_build_original` with the original
   error list, and `baseline_build` after the repair. The original is the honest record of what the
   repository was committed in; the second is what later gates diff against.
4. **Re-run Gate 0 in full afterwards**, including 0.2, so `baseline_quality_findings` reflects the
   repaired tree rather than the broken one.
5. **Report the repair as its own item** in the Step 4 summary. It is work the developer did not ask
   for when they started this session.

**If Gate 0 ends `blocked` or `failed`, it must be re-run before Gate 1 on the next session** — see
the resume status table in Step 0. A stale `baseline_*` record is worse than none: later gates would
diff against failures that may already be fixed, and if the developer's fix was partial, the gates
inherit the remainder as their own. Re-running Gate 0 rewrites every `baseline_*` field and
`baseline_accepted_by_developer`.

#### 0.4 Record

Write into `project-plan.md`:

```yaml
baseline_build:            # pass | fail
baseline_build_errors:     # count, and the file list if non-zero
baseline_quality_task:     # the KOTLIN tool: detekt | ktlintCheck | spotlessCheck | none
baseline_quality_exit:     # 0 | non-zero | n/a
baseline_quality_findings:  # count, and the rule types
baseline_quality_task_2:   # the ANDROID tool: lintDebug | lint | none
baseline_quality_exit_2:   # 0 | non-zero | n/a
baseline_quality_findings_2:  # count, and the rule types
baseline_accepted_by_developer:  # true when they chose "proceed anyway" on a failing baseline
```

#### 0.5 What every later gate does with it

- **Build:** `PASS` requires exit 0 — or, on an accepted failing baseline, *no new errors beyond the
  baseline set*.
- **Quality:** the pass condition is **no new rule types, and no findings in files this gate
  created**. It is *never* "the linter passes": a repository that was already red cannot be made
  green by a gate that did not cause it, and demanding that turns an unrelated pre-existing debt into
  a blocker for the integration.

That comparison is also what lets a gate make the much stronger claim — *"the build and the quality
gate were in this state before my change and in the same state after it"* — instead of the weak
"the build passed".

---

### Gate 1 — SDK Dependencies

**Activity:** `references/ttp/activities/act_TTP_01_setup-sdk-dependencies.md`
**Skip if:** `gate_1_sdk_deps = skip` in `project-plan.md`

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. Re-run the second one
  only if the gate touched the manifest, `res/`, or a Gradle file.
- `<SELECTED_SDK_VERSION>` — from Step 1c
- `<REPO_URL>` — from `project-plan.md` (`repo_url`)
- `<PROGUARD_ENABLED>` — from Q4. **Gate 1 must not re-ask** — the question is owned by Step 0.

---

### Gate 2 — Merchant Credentials

**Activity:** `references/ttp/activities/act_TTP_02_obtain-credentials.md`
**Skip if:** `gate_2_credentials = skip` in `project-plan.md`

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. Re-run the second one
  only if the gate touched the manifest, `res/`, or a Gradle file.
- `<CREDENTIAL_METHOD>` — from Q3 (`local_properties` | `interactive_input` | `placeholder`) — how the
  credentials reach the build
- `<KEY_SOURCE>` — from Q3c (`already_have` | `business_center` | `rest_api` | `n/a`) — how the secret
  key was obtained. A **different axis** from `CREDENTIAL_METHOD`; do not conflate them.
- `<MERCHANT_ID>` / `<MERCHANT_SECRET>` — from Q3/Q3a/Q3b (or `pending-manual-entry`)

---

### Gate 3 — Device Enrollment

**Activity:** `references/ttp/activities/act_TTP_03_device-enrollment.md`
**Skip if:** `gate_3_enrollment = skip` in `project-plan.md`. **Never `declined`.**

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. **Re-run both here:**
  this gate edits `AndroidManifest.xml`.
- `<DEVICE_AVAILABLE>` — from Q2
- `<UI_TOOLKIT>` — decides the Activity Result API branch (Compose) vs `onActivityResult` (Views)

> **This gate edits the manifest.** It adds a scoped `<activity>` theme override for
> `io.mpos.taptophone.ui.EnrollDeviceActivity`, which the SDK ships without a theme. Without it,
> enrollment crashes on `onCreate` on any project whose application theme is not AppCompat-descended —
> which is every Compose-only app with no `res/values/themes.xml`, so it is the *common* case, not an
> edge case. The activity file's Step 4 has the override and the merged-manifest verification.

> **That manifest entry names a class the SDK ships — it is not an instruction to create one.** The gate
> must add **no `Activity` of its own** for enrollment (activity file Critical Rule 10): the enrollment
> `Intent` already targets an Activity inside the SDK, so it is launched from an existing screen exactly
> as Gate 5 launches payment. A wrapper `Activity` compiles, passes both quality baselines, and throws
> `ActivityNotFoundException` the first time a merchant taps **Enroll** — so if the gate's report lists an
> Activity it created for enrollment, treat the gate as `FAIL` even though every build was green.

> **Enrollment needs real credentials.** If `CREDENTIAL_METHOD = placeholder`, the enrollment
> *code* can still be written and built, but on-device enrollment cannot succeed. Report it as
> `BLOCKED (placeholder credentials)`, not `DEFERRED` — deferring implies it would work on
> hardware, and it would not.

---

### Gate 4 — Menu: Transactions & Device Status

**Activity:** `references/ttp/activities/act_TTP_04_menu-transactions-device-status.md`
**Skip if:** `gate_4_menu = skip` in `project-plan.md`. **Never `declined`.**

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill
- `<gradle_root>`, `<android_module_dir>`, `<gradle_module_path>`, `<source_root>`, `<ui_toolkit>`
- `<mpos_accessor>` — from `project-plan.md`, **written by Gate 3**. Substitute it for every literal
  `mposUi` / `PaymentApplication.mposUi` in the activity's samples
- `<gradle_args>` — extra args every build command must carry, or `""`
- `<DEVICE_AVAILABLE>` — from Q2. Decides whether AC 15 (a real transaction appears in the list) is met
  here or reported `DEFERRED → TTP Gate 10`
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0. **Re-run
  both here** (see the note below). Use these exact names: Gate 0 records `baseline_quality_task_2`, and
  there is no `BASELINE_LINT_TASK` anywhere in the plan

> **This gate has no `transactions_requested` input, by design.** The `Transactions` and `Device Status`
> entries both ship unconditionally — `act_TTP_04` Critical Rule 9. Gates 6 and 8 attach refund and
> capture to the transaction detail page this gate creates, so an app without it has nowhere to put a
> control that acts on a chosen transaction. The question that used to make this optional (`Q10`) was
> withdrawn; see the bank.

> **`mpos_accessor` must be non-empty before this gate runs.** Gate 4 is the first consumer of the holder
> Gate 3 created, and every query here goes through `<mpos_accessor>.transactionModule`. If Gate 3's
> report left it blank, that is Gate 3's `FAIL` (its Critical Rule 9) — re-run Gate 3 rather than letting
> Gate 4 guess a class name.

> **Re-run both baselines here:** this gate edits Kotlin/Java **and** resource files
> (`res/menu/*.xml`, drawer layouts). The Kotlin tool does not read resources and Android `lint` does not
> read Kotlin style, so a single tool measures half the change. Same rule as Gate 3, for the same reason.

> **This gate takes over enrollment presentation from Gate 3.** Gate 3 owns the enrollment *mechanism* —
> `getEnrollDeviceIntent()`, the `EnrollDeviceActivity` theme override, `isDeviceEnrolled()` gating,
> `deviceEnrolledFlow()`. Gate 4 owns *where the merchant finds it*: a Device Status screen behind the
> menu, plus the status string in the top bar. After Gate 4, **no enrollment control may remain anywhere
> else** — including one Gate 3 or an earlier run created. That cleanup is Gate 4's Step 5, and its
> verification greps for stragglers.

> **Gate 4 does not wire refund or capture.** Its transaction detail view leaves an empty actions slot
> that Gate 6 and Gate 8 fill. A refund button added here would bypass Gate 6's approach/type decisions
> and Gate 8's single-active-hold rule, and it would survive even if the developer declined those gates.

> **This gate builds the state that carries the selected transaction, and it must hold the identifier —
> never the `Transaction`.** On Compose, `rememberSaveable { mutableStateOf<Transaction?>(null) }`
> compiles and then crashes with `IllegalStateException: … cannot be saved using the current
> SaveableStateRegistry`, because no `io.mpos.*` type is Bundle-safe. **The crash does not appear in this
> gate** — it fires when an SDK payment Activity stops the host Activity, so it lands on Gate 6's or
> Gate 8's first tap and reads as their defect. If a later gate reports that exception, the fix belongs
> here (`act_TTP_04` Critical Rules 11 and 12), not there. The gate's verification greps for it.

> **Step 0 of this activity asks before it builds.** An app that already has a menu, a history screen or
> an enrollment control is the normal case. The activity probes for all three and asks one question per
> artefact that exists — never assuming add-versus-replace, and never asking about an artefact the probes
> did not find. Do not let the agent skip that step because the gate "is about adding a menu".

---

### Gate 5 — Charge Transaction

**Activity:** `references/ttp/activities/act_TTP_05_implement-charge.md`
**Skip if:** `gate_5_charge = skip` in `project-plan.md`. **Never `declined`.**

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. Re-run the second one
  only if the gate touched the manifest, `res/`, or a Gradle file.
- `<TRANSACTION_CURRENCY>` — from Q9a
- `<PAYMENT_AMOUNT_SOURCE>` — from Q9b via `project-plan.md` (`payment_amount_source`). **The expression
  wins wherever it is non-empty** — see § *Amount resolution*. Omitting it makes the gate fall back to the
  fixed amount on a project that computes its own total
- `<TRANSACTION_AMOUNT>` — from Q9b. The fixed **fallback** only; must not appear in the emitted code when
  `PAYMENT_AMOUNT_SOURCE` is set
- `<PAYMENT_AMOUNT_TYPE>` — from `project-plan.md` (`payment_amount_type`). The *source* type
  (`Double`, `Float`, `BigDecimal`, minor-unit `Int`/`Long`, `String`) — this is what lets the gate convert
  to `BigDecimal` at scale 2 correctly instead of guessing
- `<mpos_accessor>` — from `project-plan.md`, **written by Gate 3**. Substitute it for every literal
  `PaymentApplication.mposUi` in the activity's samples. **Step 1 verifies the holder; it does not create
  one** unless Gate 3 was skipped and the project has none (Step 1.1a)
- `<PAYMENT_ENTRY_POINTS>` — from `project-plan.md` (all screens, not just the first)
- `<UNIMPLEMENTED_CONTROLS>` — from `project-plan.md`, each with `kind: type | modifier`
- `<PROJECT_LANGUAGE>` — from `project-plan.md` (`java` | `kotlin`)
- `<UI_TOOLKIT>` — from `project-plan.md` (`views` | `compose` | `mixed`)
- `<DEVICE_AVAILABLE>` — from Q2
- `<has_application_class>` / `<di_framework>` / `<di_singleton_module_file>` — from
  `project-plan.md`. These three pick which of the **three** holder branches runs, and they matter here
  **only on the Step 1.1a fallback** (Gate 3 skipped *and* no durable holder exists). `false` + a
  non-empty `di_framework` is the DI-owned branch, not a contradiction.

> **Gate 5 does not create the `MposUi` holder — Gate 3 does.** Gate 3 is the first gate that needs an
> `MposUi` and it records `mpos_accessor`; Gate 4 already queried `transactionModule` through it. Gate 5's
> Step 1 verifies the accessor resolves and that exactly one `MposUi.create()` exists, then extends the
> configuration. **If Gate 5 reports that it created the holder, check why** — the only legitimate reason
> is `gate_3_enrollment = skip` on a project whose own enrollment code has no durable holder. Two
> `MposUi.create()` sites is a `FAIL`: the app then has two competing owners of one SDK object, the one
> reached first wins, and it builds cleanly.

> **If Gate 5 recovered an empty `mpos_accessor` from the code, record the value it reports** — that is a
> Gate 3 defect Gate 5 papered over, and the field still has to be right before Gates 6–9 substitute it.

---

### Gate 6 — Refund Transaction

**Activity:** `references/ttp/activities/act_TTP_06_implement-refund.md`
**Skip if:** `gate_6_refund = skip | declined` in `project-plan.md`

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. Re-run the second one
  only if the gate touched the manifest, `res/`, or a Gradle file.
- `<project root>`, `<PROJECT_LANGUAGE>`, `<UI_TOOLKIT>`, `<DEVICE_AVAILABLE>`
- `<TRANSACTION_CURRENCY>` — from Q9a
- `<REFUND_APPROACH>` — from Q6a (`builtin` | `programmatic`)
- `<REFUND_TYPES>` — from Q6b
- `<PAYMENT_ENTRY_POINTS>` — from `project-plan.md`
- `<mpos_accessor>` — from `project-plan.md`, written by Gate 3. Substitute it for every literal
  `PaymentApplication.mposUi` in the activity's samples

---

### Gate 7 — Tipping

**Activity:** `references/ttp/activities/act_TTP_07_implement-tipping.md`
**Skip if:** `gate_7_tipping = skip | declined` in `project-plan.md`

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. Re-run the second one
  only if the gate touched the manifest, `res/`, or a Gradle file.
- `<project root>`, `<PROJECT_LANGUAGE>`, `<UI_TOOLKIT>`, `<DEVICE_AVAILABLE>`
- `<TIP_ENTRY_MODE>` — from Q8a
- `<TIP_PERCENTAGES>` — from Q8b (or `null` for SDK defaults)
- `<TIP_MAX_AMOUNT>` — from Q8c (or `null`)
- `<mpos_accessor>` — from `project-plan.md`, written by Gate 3. Substitute it for every literal
  `PaymentApplication.mposUi` in the activity's samples

> **Gate 7 edits Gate 5's call site.** It adds a second argument to `createTransactionIntent()`;
> it does not create a parallel payment path. If Gate 5 was `skip` because a charge flow already
> existed, Gate 7 still needs to find and modify **every** charge call site.

---

### Gate 8 — Pre-Authorization and Capture

**Activity:** `references/ttp/activities/act_TTP_08_implement-pre-auth-capture.md`
**Skip if:** `gate_8_pre_auth_capture = skip | declined` in `project-plan.md`

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0, so the
  gate can diff its own quality impact instead of demanding an absolute pass. Re-run the second one
  only if the gate touched the manifest, `res/`, or a Gradle file.
- `<project root>`, `<PROJECT_LANGUAGE>`, `<UI_TOOLKIT>`, `<DEVICE_AVAILABLE>`
- `<TRANSACTION_CURRENCY>` — from Q9a
- `<PRE_AUTH_AMOUNT_SOURCE>` — from Q7c via `project-plan.md` (`pre_auth_amount_source`). **The expression
  wins wherever it is non-empty**, exactly as `PAYMENT_AMOUNT_SOURCE` does for Gate 5. Usually the same
  expression as the sale's; an app whose sale uses the cart total but whose hold is a fixed test amount is
  inconsistent, and the inconsistency is invisible until a real hold is placed for the wrong value
- `<PRE_AUTH_AMOUNT>` — from Q7c. The fixed **fallback** hold amount only
- `<PAYMENT_AMOUNT_TYPE>` — from `project-plan.md` (`payment_amount_type`). The *source* type the
  pre-auth expression evaluates to, so the gate converts to `BigDecimal` at scale 2 rather than guessing
- `<CAPTURE_TYPES>` — from Q7a (`full` | `partial`)
- `<INCREMENTAL_AUTH_REQUESTED>` — from Q7b (`yes` | `no`)
- `<UI_PATTERN>` — from Q7d (`mode-selector` | `separate-button`)
- `<PAYMENT_ENTRY_POINTS>` — from `project-plan.md`
- `<mpos_accessor>` — from `project-plan.md`, written by Gate 3. Substitute it for every literal
  `PaymentApplication.mposUi` in the activity's samples

---

### Gate 9 — Account Verification

**Activity:** `references/ttp/activities/act_TTP_09_implement-account-verification.md`
**Skip if:** `gate_9_account_verification = skip | declined` in `project-plan.md`

**Variables to inject:**
- `<SKILL_DIR>` — **absolute** path to this skill. Every `references/…` path the agent reads is
  relative to it, not to the project. Without this the agent's reference reads fail.
- `<GRADLE_ROOT>` / `<GRADLE_MODULE_PATH>` / `<GRADLE_ARGS>` / `<ANDROID_MODULE_DIR>` /
  `<SOURCE_ROOT>` — the path set, from `project-plan.md`. All gates need all five.
- `<BASELINE_QUALITY_TASK>` / `<BASELINE_QUALITY_FINDINGS>` and
  `<BASELINE_QUALITY_TASK_2>` / `<BASELINE_QUALITY_FINDINGS_2>` — both baselines from Gate 0. Re-run the
  second one only if Step 5's placement added a resource file.
- `<PROJECT_LANGUAGE>`, `<UI_TOOLKIT>`, `<DEVICE_AVAILABLE>`
- `<TRANSACTION_CURRENCY>` — from Q9a. **The only transaction parameter this gate needs.**
- `<PAYMENT_ENTRY_POINTS>` — from `project-plan.md`, as *context* for Step 5's placement question. It is
  **not** a list of screens to add a verification button to
- `<mpos_accessor>` — from `project-plan.md`, written by Gate 3. Substitute it for every literal
  `PaymentApplication.mposUi` in the activity's samples

> **Inject no amount variable, and expect the gate to ignore one if you do.** `.verification(currency)`
> takes no amount — `VerificationBuilder` sets `BigDecimal.ZERO` in its own constructor and exposes no
> `.amount(...)`. `TRANSACTION_AMOUNT`, `PAYMENT_AMOUNT_SOURCE` and `PAYMENT_AMOUNT_TYPE` all belong to
> Gates 5 and 8. Gate 9's Critical Rule 2 goes further: Gate 5's money guards are **wrong** here, and
> `require(amount.signum() > 0)` in particular would reject the only legal value.

> **A verification is NOT a charge of zero, and this is the mistake this gate actually attracts.**
> `.charge(BigDecimal.ZERO, currency)` compiles and the SDK rejects it with
> `Amount should be bigger than zero`, because `ChargeBuilder` validates amount > 0. `VERIFICATION` is a
> distinct transaction type built with `.verification(currency)`. "Zero-amount" describes the outcome, not
> the call — do not carry that phrase into the gate prompt as though it were an implementation. If the
> gate's report shows the chain built from `.charge(...)`, it is a `FAIL`: the flow cannot complete a
> single transaction. Activity file Critical Rule 1.

> **An approved verification is not a payment, and that is this gate's whole risk.**
> `RESULT_CODE_APPROVED` means "the card is valid", not "you have been paid". If the gate's report shows
> payment wording on the verification path, or the result feeding a sales total or satisfying a checkout,
> treat the gate as `FAIL` — the app now tells a merchant they were paid when no money moved.

> **This path is API-verified but thinly exercised on hardware.** Critical Rule 9 requires the gate to say
> so in its report. Carry that statement into the Step 4 summary rather than dropping it: a capability
> reported without its confidence level reads as equally proven as charge.

### Gate 10 — Manual Device Validation

**Activity:** none — this gate is defined here.
**Skip if:** `DEVICE_AVAILABLE = no`. Governed by Q2 **only**, never by `gate_skip_decisions`.

This gate settles every acceptance criterion that Gates 3–9 deferred. It is **interactive**: the
developer must physically tap a card, and must toggle a system setting that adb cannot reach while
adb is in use.

**Requires build = no**, but it does require an installable APK from the preceding gates.

#### 10.1 Pre-flight

Run the device pre-flight check per
`references/ttp/constants/ttp-sdk-requirements.md` § *Device pre-flight — write-and-run script*
(perform the checks described there — direct `adb` calls or a scratch script you write yourself
this run — and act on the three-state result exactly as that section describes).

Resolve every `FAIL` before continuing. `auto_time` is fixable in one command; missing NFC or
Android 11 is not — in that case mark Gate 10 `BLOCKED (incompatible device)` and stop.

##### Check for a prior enrollment of THIS app — the self-collision case

The pre-flight lists coexisting Tap to Pay packages on the device. One of them may be **this app's own
`applicationId`**, left by an earlier build or an earlier run of this skill:

```bash
APP_ID=<applicationId from the module's build.gradle[.kts]>
adb -s "$SERIAL" shell pm list packages --user 0 | grep -x "package:$APP_ID" \
  && echo "PRIOR INSTALL of this applicationId present" \
  || echo "no prior install of this applicationId"
```

**This determines what the enrollment result actually proves.** A prior install may hold an existing
enrollment, in which case Gate 10 is testing *re-enrollment*, not first-time enrollment — and a
"successful enrollment" that was really a no-op tells you nothing about whether a new merchant's device
can enrol. The two outcomes are indistinguishable in the UI.

If a prior install is present, ask:

```
This device already has <APP_ID> installed from an earlier build, which may hold an existing
Tap to Pay enrollment.

  - Uninstall first (recommended) — tests a genuine first-time enrollment
    (adb uninstall <APP_ID>; this also clears app data and any stored serial number)
  - Install over the top — faster, but the run tests RE-enrollment, not first enrollment

Which would you like?
```

Record the answer in the Gate 10 report so runs across devices are comparable.

#### 10.2 Install — developer options ON

```bash
cd "$GRADLE_ROOT" || exit 1
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
  > /tmp/ttp-build.log 2>&1
BUILD_EXIT=$?
tail -30 /tmp/ttp-build.log
[ "$BUILD_EXIT" -eq 0 ] || { echo "BUILD FAILED (exit $BUILD_EXIT) — do not attempt to install"; exit 1; }

# The APK is under the MODULE's build directory, not the Gradle root's.
APK=$(find "$ANDROID_MODULE_DIR/build/outputs/apk/debug" -name '*.apk' 2>/dev/null | head -1)
[ -n "$APK" ] || { echo "FAIL: no debug APK found under $ANDROID_MODULE_DIR/build/outputs/apk/debug"; exit 1; }
adb -s "$SERIAL" install -r "$APK"
```

Expect this to be slow. A debug APK carrying the SDK plus Compose has been observed at ~150 MB.
Slow is not stuck.

#### 10.3 Disable developer options — the deadlock

**This step cannot be automated.** USB debugging lives inside developer options, so the moment the
developer turns them off, adb access is lost. Ask them to do it by hand, and tell them why:

> Enrollment checks that developer options are **disabled**, but installing over USB requires
> them **enabled**. Please now:
>
> 1. Open **Settings ▸ System ▸ Developer options** and turn the toggle **off**.
> 2. Confirm **Settings ▸ System ▸ Date & time ▸ Set time automatically** is still **on**.
> 3. Unlock the phone and keep the screen awake.
>
> Then tell me you're ready. I will lose adb access at step 1 — that is expected.

#### 10.4 Enroll

Ask the developer to launch the app and run the enrollment flow. Collect:
- Did enrollment complete? What serial number was assigned?
- Does `isDeviceEnrolled()` now return `true`?
- What does `getMerchantInformation()` report — specifically, is
  `getMerchantInformation()?.supportedCurrencies.orEmpty()` non-empty, and does it contain
  `TRANSACTION_CURRENCY`? (It is a `Set<String>` of currency codes, so this is a string comparison.)

> **An empty `supportedCurrencies` here is a `FAIL`, and it is Gate 3's, not Gate 10's.** It means the
> merchant configuration never loaded — almost always the wrong key type, which authenticates far
> enough to enroll and then carries no configuration. Enrollment completing is not evidence against
> this; it is the normal presentation of it.
>
> Do not record it as a Gate 10 observation and move on to the transaction checks: none of them can
> pass, and running them produces five failures with one cause. Send the run back to `act_TTP_02` for
> a regenerated **Acceptance Devices Secret Key**, then re-run Gate 3. The differential (wrong key
> type / MID mismatch / expired key) is in `act_TTP_03` § *An observed-empty `supportedCurrencies`
> stops the run* and `references/ttp/troubleshooting.md` § *Credentials*. Readiness background is in
> `references/ttp/constants/ttp-sdk-requirements.md` § *Three Readiness States*.

##### If the app *crashes* rather than failing — triage before re-running

"It crashed" and "enrollment was rejected" are different findings with different causes, and only one
of them is about the device. Separate them by **when** it happened:

| What the developer saw | What it is | adb available? |
|------------------------|------------|----------------|
| The app dies the instant Enroll is tapped, before any SDK screen appears | A crash in `EnrollDeviceActivity.onCreate` — **this happens before any attestation check**, so it reproduces with developer options **ON** | **Yes.** Re-enable developer options and reproduce it |
| SDK screens appear, then enrollment is refused | Device attestation, credentials, or the Ready app | No — the failure only occurs with developer options off |

For the first row, capture the stack trace rather than guessing from the symptom:

```bash
adb -s "$SERIAL" logcat -d 2>&1 | grep -A 40 "FATAL EXCEPTION"
```

Two signatures have been observed on real hardware, and neither is detectable by any build-time or
grep-based check in Gates 0–9 — this gate is the only place they surface:

| Signature | Cause | Fix |
|-----------|-------|-----|
| `IllegalStateException: You need to use a Theme.AppCompat theme (or descendant)` at `AppCompatDelegateImpl.createSubDecor` → `EnrollDeviceActivity.onCreate` | The SDK declares no `android:theme` on `EnrollDeviceActivity`, and the app's theme is not AppCompat-descended | `act_TTP_03` Step 4 — the scoped `<activity>` override. **Not** an app-theme change |
| `MposRuntimeException: custom identifier '<x>' needs to follow the pattern '^[a-zA-Z0-9_-]{0,256}$'` at `assertValidCustomIdentifier` | A space or period reached `.customIdentifier(...)`; the builder throws | `act_TTP_05` Critical Rule 10 and Step 1b |

> **Both of these were found by tapping a button on a phone, not by any check in this skill.** Gates
> 0–8 verify with builds, greps and static analysis, and a runtime crash in an SDK-owned Activity is
> invisible to all three. When Gate 10 reports a crash, record the full signature in the run report even
> after fixing it — the value is in the signature, which is what makes the next occurrence a lookup
> instead of an investigation.

#### 10.5 Validate every implemented transaction type

For each gate that ran, ask the developer to perform the real transaction and report the result.
Record the actual outcome — including declines, which are useful data:

| Gate | What to validate |
|------|-----------------|
| 4 | The menu opens; `Transactions` lists real transactions with correct amount and status; `Device Status` shows the enrolled state. An empty list on a merchant who has never transacted is a pass — say which you saw |
| 5 | A card tap completes and returns `RESULT_CODE_APPROVED` |
| 6 | A refund of that transaction completes; a partial refund returns the right amount if requested |
| 7 | The tip prompt appears **before** the tap; the transaction amount equals base + tip |
| 8 | Pre-auth holds; capture settles per `CAPTURE_TYPES`; incremental auth increases the hold if requested |
| 9 | A card tap on the `Verify card` action returns `RESULT_CODE_APPROVED`, the message reads as verification and **not** payment, and no amount was charged |

#### 10.6 Re-enable developer options only to install again

If a fix is needed, the developer must re-enable developer options to install a new build — which
returns to 10.2. Note in the report whether re-enabling them appeared to invalidate the enrolled
state; that is currently unverified, and it determines whether the development loop is
"enroll once" or "re-enroll every build".

#### Gate 10 report

```
TTP GATE 10 REPORT (manual device validation)
Status: PASS | PARTIAL | FAIL | BLOCKED (reason) | SKIPPED (no device)
Device: <manufacturer model>, Android <release> (API <sdk>), patch <security_patch>
Pre-flight: PASS | FAIL (<failed requirements>)
Developer options disabled for enrollment: YES | NO
Enrollment: ENROLLED (serial: <sn>) | FAILED (<reason>) | BLOCKED (placeholder credentials)
Merchant information: supportedCurrencies=<set> | EMPTY (credentials not loaded)
Charge tap:        APPROVED | DECLINED (<status>) | FAILED | NOT TESTED
Refund:            APPROVED | DECLINED | FAILED | N/A (gate declined)
Tipping:           tip prompt shown YES|NO, total = base+tip YES|NO | N/A
Pre-auth/capture:  <result> | N/A
Prior enrollment of this applicationId present: YES (uninstalled first | installed over) | NO
  -> so this run tested: FIRST-TIME enrollment | RE-enrollment
Coexisting Tap to Pay packages on the device: <count>
Re-enabling developer options invalidated enrollment: YES | NO | NOT TESTED
Deferred criteria now settled: <list gate/AC numbers>
Deferred criteria still outstanding: <list, with reason>
```

<!-- EXTENSION POINT: add new gates here — update Gate Registry above and Summary below -->

---

## Step 3 — Requested-capability reconciliation, then Final Build Verification

### 3a. Reconcile every requested capability — before the build, and before any success is reported

**Read `project-plan.md` § *Requested Capabilities* and confirm no row is left `pending` or `missing`.**
This is the backstop for the per-gate reconciliation in the Per-Gate Protocol step 5: if a gate was run in
an earlier session, or the session was compacted and resumed, or a gate agent reported `PASS` on a subset
of its scope, this is the last point at which the gap is cheap to find.

```bash
awk '/^# Requested Capabilities/,0' "$GRADLE_ROOT/project-plan.md" \
  | grep -E '^\|' | grep -Ev '^\|[- ]+\||Capability' \
  | awk -F'|' '{ gsub(/^[ \t]+|[ \t]+$/, "", $5); if ($5 != "done" && $5 != "n/a") print "OUTSTANDING:" $0 }'
```

- **Any output → the integration is NOT complete.** Re-run the owning gate for those capabilities. Do not
  proceed to the final build and do not print the Step 4 summary.
- **No output → every capability the developer asked for is accounted for.** Continue.
- **The section is missing entirely** (a plan written before this table existed) → reconstruct it from
  `refund_types`, `capture_types`, `incremental_auth_requested`, `tipping_requested` and
  `account_verification_requested` in the same file, then run the check. A missing table is not a pass.

> **A clean build proves nothing about scope.** An integration missing a whole refund type compiles
> perfectly — that is exactly why this check runs *before* the build and not instead of it. "Build green"
> and "built what was asked for" are independent claims, and only one of them is measured by Gradle.

### 3b. Final Build Verification

**Update the Progress Tracker:** set row `F` (Final clean build) to `in_progress`.

After all gates complete, run one final clean build to confirm everything integrates:

```bash
cd "$GRADLE_ROOT" || exit 1
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS clean "$GRADLE_MODULE_PATH:assembleDebug" \
  > /tmp/ttp-final-build.log 2>&1
FINAL_EXIT=$?
tail -40 /tmp/ttp-final-build.log
[ "$FINAL_EXIT" -eq 0 ] \
  && echo "FINAL BUILD OK (exit 0)" \
  || echo "FINAL BUILD FAILED (exit $FINAL_EXIT)"
```

> **`FINAL_EXIT` is the signal — not the text of the output.** Piping the build into `tail` would
> replace Gradle's exit status with `tail`'s, which is essentially always 0, so a failed build would
> report success and this step would certify a broken integration. See
> `references/ttp/constants/ttp-sdk-requirements.md` § *CRITICAL — never pipe the build command*.

If `FINAL_EXIT` is non-zero, spawn a **Fix Agent** with the build log and the list of files modified
across all gates, and ask it to diagnose and fix. Only report success after this passes.

**Update the Progress Tracker:** set row `F` to `done` (or `failed` if unrecoverable).

---

## Step 4 — Summary

After all gates and the final build, present a summary to the developer:

```
Tap to Pay on Android Integration Complete

SDK version:          <SELECTED_SDK_VERSION>
Repository:           <repo_url>
Android module:       <android_module_dir>   (UI: <ui_toolkit>)
Transaction currency: <TRANSACTION_CURRENCY>
Charge amount:        <the app's own expression, or the fixed fallback — see below>
Credentials:          real TEST | placeholder (nothing will work end to end)

Gate results:
  Gate 0 Baseline Build:         PASS | FAIL (accepted by developer)
  Gate 1 SDK Dependencies:       PASS | SKIP
  Gate 2 Merchant Credentials:   PASS | SKIP
  Gate 3 Device Enrollment:      PASS | PASS (on-device DEFERRED) | BLOCKED | SKIP
  Gate 4 Menu & Transactions:    PASS | PASS (listing DEFERRED) | SKIP
  Gate 5 Charge Transaction:     PASS | PASS (on-device DEFERRED) | SKIP
  Gate 6 Refund Transaction:     PASS | PASS (on-device DEFERRED) | SKIP | DECLINED
  Gate 7 Tipping:                PASS | PASS (on-device DEFERRED) | SKIP | DECLINED
  Gate 8 Pre-Auth & Capture:     PASS | PASS (on-device DEFERRED) | SKIP | DECLINED
  Gate 9 Account Verification:   PASS | PASS (on-device DEFERRED) | SKIP | DECLINED
  Gate 10 Manual Device Validation: PASS | PARTIAL | FAIL | BLOCKED | SKIPPED (no device)

Final build: PASS

Baseline comparison (what this integration is responsible for):
  Build:   baseline <pass|fail, N errors>  ->  now <pass|fail, N errors>
  Quality: <task or none> baseline <exit, N findings>  ->  now <exit, N findings>
           new rule types introduced: <N — must be 0>
           findings in files created by this integration: <N — must be 0>

What was set up:
• <2-3 bullets summarising the integration>

Not yet proven on hardware:
• <list every criterion still DEFERRED — say this plainly; a passing build is not a working tap>

Decisions taken without asking:
• <every entry from every gate's report block — omit this heading only if there were none>

Next steps:
• <if placeholder credentials> Generate an Acceptance Devices Secret Key in the Business Center
  (Payment Configuration ▸ Key Management) and put the MID + secret in local.properties
• <if Gate 10 skipped> Re-run with a compatible device connected; remember developer options must
  be disabled before enrolling — see the ordering in
  references/ttp/constants/ttp-sdk-requirements.md
• Before production: replace TEST credential loading with secure retrieval (backend/vault) and
  switch ProviderMode only after the merchant's own certification
```

**Filling in `Charge amount`.** Print what the app will actually charge, not the value of
`TRANSACTION_AMOUNT`:

| Condition | Print |
|-----------|-------|
| `PAYMENT_AMOUNT_SOURCE` non-empty | `` from the app: `<expression>` `` |
| `PAYMENT_AMOUNT_SOURCE` empty | `<TRANSACTION_AMOUNT> (fixed)` |

> This line used to read `Test amount: <TRANSACTION_AMOUNT>` unconditionally, which reported a figure
> the generated code never uses whenever the app supplies its own amount. A summary that names a
> number the app will not charge is worse than one that omits the line.

---

## Handling Developer Questions

If the developer asks a factual question at any point, fetch the relevant page from llms.txt or
read the relevant local reference and answer from it. Then resume the workflow. Do not interrupt an
active subagent to answer a question — wait for the agent to report, then answer before spawning
the next.

If the question is about an SDK class, method, or import path, answer from
`references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names* rather than from memory.
Several of those names have plausible-looking decoys on the same classpath.

---

## Scope Boundaries

This workflow covers Visa Acceptance Tap to Pay on Android SDK integration only. It does NOT cover:
- Custom payment UI (use the SDK's Default UI)
- Backend payment processing or settlement
- Visa Acceptance account setup or merchant onboarding
- Production credential management
- PCI MPoC certification of the merchant's own application
- `ProviderMode.LIVE` — this skill configures TEST only
