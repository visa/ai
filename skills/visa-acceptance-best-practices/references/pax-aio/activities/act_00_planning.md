# Activity 0: Project Analysis and Planning

Analyse the Android project and produce a concise, project-specific implementation plan.
Do NOT implement anything. Do NOT write code snippets in the plan.

**Reference:** `references/pax-aio/constants/pax-sdk-requirements.md`, [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Gradle configuration)

## Critical Rules (NEVER violate these)

1. **NEVER implement code** — your only output is the `project-plan.md` document.
2. **NEVER include code snippets, diffs, or source blocks** — the plan must contain ONLY metadata, file paths, decisions, and plain-text notes. Implementation agents have their own activity files with full code guidance.
3. **NEVER downgrade versions** — if the project already meets or exceeds a minimum, do NOT include it in `required_upgrades`.
4. **NEVER stop at the first payment screen** — enumerate ALL payment entry points.
5. **NEVER mark a gate as `skip` for partial implementations** — if the integration is incomplete on any screen, mark `run`.
6. **NEVER hardcode constants** — read all version minimums from `references/pax-aio/constants/pax-sdk-requirements.md`.

## Agent Prompt Template

```
You are a PAX SDK integration planner. Your only job is to analyse the Android project
and produce a concise, project-specific implementation plan. Do NOT implement anything.
Do NOT write code snippets, diffs, or source blocks in the plan — only metadata,
file paths, decisions, and plain-text notes. The implementation agents have their own
activity files with full code guidance.

Working directory: <project root — current directory>

---

## Your tasks

### 1. Read the project and detect versions

Scan these files and extract the facts below:
- `settings.gradle` / `settings.gradle.kts`
- root `build.gradle` / `build.gradle.kts`
- `app/build.gradle` / `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `gradle/wrapper/gradle-wrapper.properties`
- All `.java` and `.kt` files under `app/src/main/java/`

**Also read the version requirements:**
- `references/pax-aio/constants/pax-sdk-requirements.md`

Use these explicit detection patterns to extract current project versions:

```bash
# AGP version — from root build.gradle(.kts)
grep -oE 'com\.android\.application.*version\s*"([0-9]+\.[0-9]+\.[0-9]+)"' \
  build.gradle build.gradle.kts 2>/dev/null

# Kotlin version — from root build.gradle(.kts)
grep -oE 'org\.jetbrains\.kotlin\.android.*version\s*"([0-9]+\.[0-9]+\.[0-9]+)"' \
  build.gradle build.gradle.kts 2>/dev/null

# Gradle wrapper version — from gradle-wrapper.properties
grep -oE 'gradle-([0-9]+\.[0-9]+(\.[0-9]+)?)-' \
  gradle/wrapper/gradle-wrapper.properties

# Java version — from app/build.gradle(.kts)
grep -E 'sourceCompatibility|targetCompatibility|jvmTarget' \
  app/build.gradle app/build.gradle.kts 2>/dev/null

# minSdk — from app/build.gradle(.kts)
grep -E 'minSdk' app/build.gradle app/build.gradle.kts 2>/dev/null

# compileSdk — from app/build.gradle(.kts)
grep -E 'compileSdk' app/build.gradle app/build.gradle.kts 2>/dev/null
```

### 2. Build project-context.md

Save to `project-plan.md` (project root). Include EXACTLY these fields:

```yaml
# Project Context
package:                    # e.g. com.example.myapp
language:                   # java | kotlin
gradle_dsl:                 # groovy | kotlin
agp_version:                # e.g. 8.3.2  (detected from root build.gradle)
kotlin_version:             # e.g. 2.0.0  (detected from root build.gradle)
gradle_version:             # e.g. 8.7    (detected from gradle-wrapper.properties)
min_sdk:                    # e.g. 21     (detected from app/build.gradle)
java_version:               # e.g. 17     (detected from app/build.gradle)
compile_sdk:                # e.g. 36     (detected from app/build.gradle)
has_application_class:      # true | false
application_class_file:     # relative path if exists, else ""
settings_has_repos:         # true if dependencyResolutionManagement already present
repo_url:                   # https://repo.visa.com/mpos-releases/ OR artifactory URL if found
pax_sdk_already_present:    # true | false
mposui_already_init:        # true | false
selected_sdk_version:       # e.g. 2.107.0 — from Q1 + Step 1c (pre-resolved by workflow)
proguard_enabled:           # true | false — from Q4 answer
checkpoint_mode:            # autonomous | per_gate — from Q5 answer
credential_method:          # manual | terminal | placeholder — from Q3 answer
primary_transaction_type:   # charge | pre_auth_capture | offline — from Q6 answer
charge_requested:           # true | false — true if PRIMARY = charge OR Q7a = Yes
refund_requested:           # true | false — from Q7b answer
pre_auth_capture_requested: # true | false — true if PRIMARY = pre_auth_capture OR Q7c = Yes
offline_requested:          # true | false — true if PRIMARY = offline OR Q7d = Yes

# Version upgrade analysis
# Compare detected versions against references/pax-aio/constants/pax-sdk-requirements.md.
# Only list upgrades where the project is BELOW the minimum. If the project
# already meets or exceeds a minimum, do NOT include it here.
required_upgrades:          # YAML list — empty [] if no upgrades needed, e.g.:
  # - component: AGP
  #   current: "7.4.0"
  #   minimum: "8.6.0"
  #   target: "8.7.0"         # may differ from minimum (see compileSdk rule)
  #   reason: "PAX SDK requires AGP >= 8.6.0 (Compose 1.9.0 transitive dep); project uses compileSdk 36 so 8.7.0 recommended"
  # - component: minSdk
  #   current: "21"
  #   minimum: "25"
  #   target: "25"
  #   reason: "PAX A920 runs Android 7.1 (API 25); lower minSdk causes manifest merger failure"

# Existing integration detection — determines which gates to skip
# The planning agent populates these by scanning the codebase (see task 2c below).
gate_skip_decisions:
  gate_1_sdk_deps:          # skip | run — true if paybutton-android in build.gradle AND build passes
  gate_2_merchant_config:   # skip | run — true if MposUi.create() found with AccessoryFamily.PAX
  gate_3_charge:            # skip | run | declined — "declined" if CHARGE_REQUESTED = false AND PRIMARY ≠ charge
  gate_4_refund:            # skip | run | declined — "declined" if REFUND_REQUESTED = false
  gate_5_tipping:           # skip | run | declined — "declined" if Q8 = skip tipping
  gate_6_pre_auth:          # skip | run | declined — "declined" if PRE_AUTH_CAPTURE_REQUESTED = false AND PRIMARY ≠ pre_auth_capture
  gate_7_capture:           # skip | run | declined — "declined" if PRE_AUTH_CAPTURE_REQUESTED = false AND PRIMARY ≠ pre_auth_capture
  gate_8_offline:           # skip | run | declined — "declined" if OFFLINE_REQUESTED = false AND PRIMARY ≠ offline
  gate_9_apk_install:       # skip | run — "skip" only if Q2 = no terminal
  gate_10_transaction_verify:  # skip | run | deferred — "skip" if Q2 = no terminal; "deferred" if user chose test later

# Payment entry points — MANDATORY: list ALL screens, not just the primary one  <!-- REC-01 -->
# Search criteria: any Activity/Fragment that (a) displays a price or amount field,
# (b) has a button click handler with TODO/FIXME payment comment, or
# (c) has a button whose label or id suggests purchase/pay/donate/book/checkout.
payment_entry_points:       # YAML list — one entry per screen found, e.g.:
  # - activity: DoctorDetailActivity
  #   file: app/src/main/java/com/example/DoctorDetailActivity.kt
  #   layout: app/src/main/res/layout/activity_doctor_detail.xml
  #   evidence: "displays item price; btnPay button present"
  # - activity: DonationActivity
  #   file: app/src/main/java/com/example/DonationActivity.kt
  #   layout: app/src/main/res/layout/activity_donation.xml
  #   evidence: "TODO: add payment here comment on donate button"

# Primary payment screen (first entry point — used for Gates 3 and 4)
payment_activity:           # class name of the best Activity for payment button
payment_activity_file:      # relative path to that Activity's source file
payment_layout_file:        # relative path to that Activity's layout XML
payment_ui:                 # per-item-button | fab | standalone-button
payment_amount_source:      # expression e.g. item.getPrice() | fixed e.g. "9.99"
currency:                   # from Q9a — e.g. EUR, USD, GBP
transaction_amount:         # from Q9b — e.g. "9.99" (default/fallback for test transactions)
```

### 2b. Enumerate ALL payment entry points (MANDATORY) <!-- REC-01 -->

Before writing `project-plan.md`, run these searches and record every match:

```bash
# Find all button click handlers in Activity/Fragment source files
grep -rn "setOnClickListener\|OnClickListener\|onClick" app/src/main/java/ --include="*.kt" --include="*.java"

# Find TODO/FIXME comments mentioning payment, purchase, charge, donate, book, checkout
grep -rni "TODO.*pay\|TODO.*charge\|TODO.*purchase\|TODO.*donat\|TODO.*checkout\|FIXME.*pay" \
  app/src/main/java/ --include="*.kt" --include="*.java"

# Find layout files containing price/amount fields or pay/donate/buy button IDs
grep -rni "price\|amount\|total\|btn_pay\|btn_buy\|btn_donate\|btn_book\|btn_checkout\|btnPay\|btnBuy" \
  app/src/main/res/layout/ --include="*.xml"
```

Compile results into the `payment_entry_points` list in `project-plan.md`. This list MUST contain
every screen found — **do not stop at the first match**. The implementation agents will integrate
PAX payment into **all** of these screens.

If only one screen is found, explicitly note: `payment_entry_points: [single screen — <class>]`.

### 2c. Detect existing integrations (gate skip decisions)

Run these checks to determine which gates can be skipped. Record results in the
`gate_skip_decisions` section of `project-plan.md`. Each check must produce a clear
`skip`, `run`, or `declined` verdict with evidence.

**Check Q6, Q7, Q8 answers first** — if the developer declined a transaction type,
mark the corresponding gate(s) as `declined` immediately without scanning code:
- Q8 = "No, skip tipping" → `gate_5_tipping = declined`
- `CHARGE_REQUESTED = false` AND `PRIMARY_TRANSACTION_TYPE ≠ charge` → `gate_3_charge = declined`
- `REFUND_REQUESTED = false` → `gate_4_refund = declined`
- `PRE_AUTH_CAPTURE_REQUESTED = false` AND `PRIMARY_TRANSACTION_TYPE ≠ pre_auth_capture` → `gate_6_pre_auth = declined`, `gate_7_capture = declined`
- `OFFLINE_REQUESTED = false` AND `PRIMARY_TRANSACTION_TYPE ≠ offline` → `gate_8_offline = declined`

**The primary transaction type gate is NEVER declined** — it is either `run` or `skip`
(if the planning agent detects it's already implemented).

Only run the grep checks below for gates that are NOT already `declined`.

```bash
# Gate 1 — SDK Dependencies: check if PAX SDK deps are already in build.gradle
grep -rn "paybutton-android\|mpos.android.accessories.pax" \
  app/build.gradle app/build.gradle.kts 2>/dev/null
# If found → candidate for skip (verify with ./gradlew assembleDebug)

# Gate 2 — Merchant Config: check for MposUi initialisation with PAX accessory
grep -rn "MposUi.create\|MposUi.initialize" app/src --include="*.kt" --include="*.java"
grep -rn "AccessoryFamily.PAX" app/src --include="*.kt" --include="*.java"
# If both found → candidate for skip

# Gate 3 — Charge: check for charge transaction implementation
grep -rn "startCharge\|ChargeTransactionParameters\|createTransactionIntent" \
  app/src --include="*.kt" --include="*.java"
# If found with onActivityResult handling → candidate for skip

# Gate 4 — Refund: check for refund implementation
grep -rn "REFUND_TRANSACTION\|RefundTransactionParameters\|performRefund" \
  app/src --include="*.kt" --include="*.java"
# If REFUND_TRANSACTION in UiConfiguration → candidate for skip

# Gate 5 — Tipping: check for tipping implementation
grep -rn "TippingProcessStepParameters\|ADJUST_TIP\|getIncludedTipAmount" \
  app/src --include="*.kt" --include="*.java"
# If found → candidate for skip. Also check Q8 answer — if "skip tipping", mark "declined"

# Gate 6 — Pre-auth: check for pre-authorization implementation
grep -rn "autoCapture.*false\|startPreAuth" app/src --include="*.kt" --include="*.java"
# If autoCapture(false) found with pre-auth intent handling → candidate for skip

# Gate 7 — Capture: check for capture implementation
grep -rn "CAPTURE_TRANSACTION\|CaptureTransactionParameters\|startCapture" \
  app/src --include="*.kt" --include="*.java"
# If CAPTURE_TRANSACTION in UiConfiguration → candidate for skip

# Gate 8 — Offline Transactions: check for offline implementation
grep -rn "getOfflineModule\|OfflineTransactionConfiguration\|submitOfflineTransactionBatchIntent" \
  app/src --include="*.kt" --include="*.java"
# If found with connectivity monitoring → candidate for skip. Also check Q7d — if "No", mark "declined"
```

**Skip decision rules:**

| Gate | Mark as `skip` when | Mark as `run` when | Mark as `declined` when |
|------|--------------------|--------------------|------------------------|
| 1 | `paybutton-android` in build.gradle AND build passes | SDK deps not found or build fails | never |
| 2 | `MposUi.create()` + `AccessoryFamily.PAX` + `.integrated()` all present | Any of the three missing | never |
| 3 | `startCharge(` present in ALL `payment_entry_points` screens | Missing from any screen | `CHARGE_REQUESTED = false` AND `PRIMARY ≠ charge` |
| 4 | `REFUND_TRANSACTION` in UiConfiguration AND refund button in all screens | Code absent but requested | `REFUND_REQUESTED = false` |
| 5 | Tipping code present (type matches Q8) | Q8 wants tipping but code absent | Q8 = "skip tipping" |
| 6 | `autoCapture(false)` in pre-auth context + identifier persisted | Code absent but requested | `PRE_AUTH_CAPTURE_REQUESTED = false` AND `PRIMARY ≠ pre_auth_capture` |
| 7 | `CAPTURE_TRANSACTION` in UiConfiguration + capture wiring present | Code absent but requested | same as Gate 6 |
| 8 | `getOfflineModule()` + `OfflineTransactionConfiguration` + connectivity monitoring present | Code absent but requested | `OFFLINE_REQUESTED = false` AND `PRIMARY ≠ offline` |
| 9 | Q2 = "No / Not yet" → `skip` | Q2 = "Yes" → `run` (always run if terminal connected) | never |
| 10 | Q2 = "No / Not yet" → `skip` | Q2 = "Yes" → `run` (always run if terminal connected) | never |

For each gate, record the evidence (grep output or build result) in the `gate_skip_decisions`
section as a comment. This evidence is shown to the developer in Step 1b for approval.

**Important:** A gate is only `skip` if the integration is **complete and correct** for that
gate. Partial implementations (e.g., charge works on one screen but not another) should be
marked `run` — the implementation agent will detect and preserve existing work.

### 3. Detect known issues and note required adaptations

Read `references/pax-aio/constants/pax-sdk-requirements.md` for minimum version values.
Compare the detected project versions against those constants and populate `required_upgrades`.

Based on the project context, note which of these apply:

- `needs_matchingFallbacks_groovy`: true if gradle_dsl=groovy (use `matchingFallbacks = ['release']`)
- `needs_omit_kotlinOptions`: true if language=java (omit the kotlinOptions block)
- `needs_supportsRtl_fix`: always note it — check if manifest already has `tools:replace`
- `needs_jvm_heap`: note if project is large (add `org.gradle.jvmargs=-Xmx4096m`)
- `credentials_in_local_properties`: true | false (check if local.properties already exists)
- `needs_proguard`: true if `proguard_enabled` is true (from Q4 answer). When true, note it as
  a flag — the Gate 1 implementation agent will handle ProGuard rules from its own activity file.
- `proguard_already_configured`: true if `proguard-rules.pro` already contains PAX keep rules
  (`io.payworks` or `io.mpos`). Check with:
  ```bash
  grep -l "io.payworks\|io.mpos" app/proguard-rules.pro 2>/dev/null
  ```
  NOTE: `io.mpos` here refers to the **runtime Java package** used in ProGuard keep rules,
  NOT a Maven group. The Maven group for ALL SDK artifacts is `io.payworks` only.

**Version upgrade decisions** (populate `required_upgrades` in project-plan.md):

Apply the rules from `references/pax-aio/constants/pax-sdk-requirements.md`. For each component, compare
the detected project version against the minimum. Only add to `required_upgrades` if the
project is BELOW the minimum. Never downgrade a version that already meets the requirement.

For AGP specifically, apply the compileSdk conditional:
```
if agp_version < MIN_AGP_VERSION:
    if compile_sdk >= 36:
        target = RECOMMENDED_AGP_VERSION
    else:
        target = MIN_AGP_VERSION
    add to required_upgrades

if target AGP >= RECOMMENDED_AGP_VERSION AND gradle_version < MIN_GRADLE_VERSION:
    add Gradle wrapper to required_upgrades
```

### 4. Write implementation notes for each gate (NO code snippets)

Append a `# Gate Implementation Notes` section to `project-plan.md`. For each gate,
list ONLY the project-specific decisions and file targets. Do NOT write any code blocks,
diffs, or source snippets — the implementation agents have their own activity files with
full domain knowledge and will generate correct code from the project metadata above.

#### GATE 1 — SDK Setup

Note these items (text only, no code):
- Which files need modification: `settings.gradle`, root `build.gradle`, `app/build.gradle`,
  `AndroidManifest.xml`, and `gradle-wrapper.properties` (only if in `required_upgrades`)
- The `repo_url` to use in the exclusiveContent block
- Which versions from `required_upgrades` will be applied (reference the entries, don't repeat values)
- Whether ProGuard is needed (`proguard_enabled` + `proguard_already_configured` status).
  If `proguard_enabled = false`, note: "ProGuard skipped (Q4: developer declined)."
- Relevant known issues: `needs_matchingFallbacks_groovy`, `needs_supportsRtl_fix`, etc.

#### GATE 2 — Merchant Credentials

Note these items (text only, no code):
- Target file for `PaymentApplication` class: `app/src/main/java/<package-path>/PaymentApplication.<kt|java>`
- Whether an Application class already exists (`has_application_class`)
- Build config strategy: `Properties().load()` from `local.properties`
- Critical constraint: UiConfiguration with `terminalParameters(AccessoryFamily.PAX + .integrated())`
  must be applied immediately after `MposUi.create()` — without this the SDK reverts to MOCK.
  Import must be `io.mpos.paybutton.UiConfiguration` (not `io.mpos.paybutton.configuration.UiConfiguration`). <!-- REC-05 -->

#### GATE 3 — Charge Transaction

Only include if `charge_requested = true`. If declined, note: "Charge skipped (developer declined)."

Note these items (text only, no code):
- List of screens to integrate (from `payment_entry_points`) — one bullet per screen with:
  - Activity class name and file path
  - Layout file path
  - UI element type (`payment_ui`)
  - Amount source expression (`payment_amount_source`) or fixed amount (`transaction_amount`)
- Currency: `<TRANSACTION_CURRENCY>`
- Reminder: each screen gets its own integration — do NOT apply a single generic approach <!-- REC-01 -->

#### GATE 4 — Refund Transaction

Only include if `refund_requested = true`. If declined, note: "Refund skipped (developer declined)."

Note these items (text only, no code):
- Screens that need refund buttons (same as `payment_entry_points` list from Gate 3) <!-- REC-01 -->
- Approach: SDK Built-in Refund via `SummaryFeature.REFUND_TRANSACTION`

#### GATE 5 — Tipping

Only include if developer wants tipping (Q8 ≠ "No, skip tipping for now"). If declined, note: "Tipping skipped (Q8: developer declined)."

Note these items (text only, no code):
- Tipping type: on-reader | on-receipt (from Q8)
- For on-reader: tip entry mode (`TIP_ENTRY_MODE`), custom percentages (`TIP_PERCENTAGES` or "SDK defaults"), max tip amount (`TIP_MAX_AMOUNT` or "none")
- For on-receipt: note that `.autoCapture(false)` + `.tipAdjustable(true)` + `SummaryFeature.ADJUST_TIP` are required

#### GATE 6 — Pre-Authorization

Only include if `pre_auth_capture_requested = true`. If declined, note: "Pre-auth skipped (developer declined)."

Note: screens from `payment_entry_points` that need pre-auth capability.

#### GATE 7 — Capture Transaction

Only include if `pre_auth_capture_requested = true`. If declined, note: "Capture skipped (developer declined)."

Note: screens that need capture functionality (same as Gate 6).

#### GATE 8 — Offline Transactions

Only include if `offline_requested = true`. If declined, note: "Offline skipped (developer declined)."

Note: screens from `payment_entry_points` and connectivity monitoring strategy.

**STOP — Do NOT add any additional sections with code.** The plan must NOT contain:
- ProGuard rules (the Gate 1 agent reads these from its activity file and the PAX AIO docs)
- `settings.gradle` / `build.gradle` code blocks (the Gate 1 agent generates these)
- `PaymentApplication` class source (the Gate 2 agent generates this)
- Transaction method implementations (Gates 3-8 agents generate these)
- Any other code blocks, diffs, or source snippets

### 5. Generate the Progress Tracker

Append a `# Progress Tracker` section to `project-plan.md`. This serves as a persistent
task list so the developer can see what has been done and what remains. If the session is
interrupted and resumed, the workflow reads this section to resume without re-probing.

Use this exact format — one row per gate, plus rows for planning and final verification:

```markdown
# Progress Tracker

<!-- This section is updated automatically by the workflow as each gate completes.
     If a session is interrupted, the workflow reads this table to resume. -->

| # | Task | Status | Notes |
|---|------|--------|-------|
| 0 | Planning & project analysis | done | plan written to project-plan.md |
| 1 | SDK Dependencies | pending | |
| 2 | Merchant Credentials & MposUi | pending | |
| 3 | Charge Transaction | pending | |
| 4 | Refund Transaction | pending | |
| 5 | Tipping | pending | |
| 6 | Pre-Authorization | pending | |
| 7 | Capture Transaction | pending | |
| 8 | Offline Transactions | pending | |
| 9 | APK Installation | pending | |
| 10 | Runtime Payment Verification | pending | |
| F | Final clean build | pending | |
```

**Status values:** `pending`, `in_progress`, `done`, `skipped`, `failed`

Mark any gate that Step 0 answers indicate should be skipped as `skipped` with a note
(e.g., "detected: SDK already configured" or "Q8: tipping declined" or "Q7b: refund
declined" or "Q7c: pre-auth/capture declined" or "Q7d: offline declined" or "Q2: no terminal").

### 6. Final output

When done, print:

```
PLANNING COMPLETE

Project: <package>
Language: <language>
DSL: <gradle_dsl>
Payment screen: <payment_activity>
Known issues to pre-apply: <comma-separated list>
Plan written to: project-plan.md (includes Progress Tracker)
```
```

## Acceptance Criteria

- [ ] `project-plan.md` exists in the project root
- [ ] All fields in the Project Context section are populated
- [ ] `payment_entry_points` lists ALL screens (not just the first found)
- [ ] `gate_skip_decisions` has a verdict for every gate with evidence
- [ ] `required_upgrades` only lists components BELOW the minimum
- [ ] Every GATE section contains project-specific implementation notes (file targets, decisions) — NO code snippets
- [ ] Progress Tracker section is present with correct initial statuses
- [ ] The agent prints `PLANNING COMPLETE` at the end
