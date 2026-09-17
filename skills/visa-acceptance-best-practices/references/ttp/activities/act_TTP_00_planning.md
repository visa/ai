# Activity TTP-0: Project Analysis and Planning

Analyse the Android project and produce a concise, project-specific implementation plan.
Do NOT implement anything. Do NOT write code snippets in the plan.

This activity is the **only producer of `project-plan.md`** — the file every other TTP activity
reads on its first line. It is also the only place the path set (`GRADLE_ROOT`,
`ANDROID_MODULE_DIR`, `GRADLE_MODULE_PATH`, `SOURCE_ROOT`, `UI_TOOLKIT`) is resolved, and the only
producer of `required_upgrades`, which the Required Upgrade Consent Protocol depends on.

The `baseline_*` fields are declared in the plan template but written by **Gate 0**, not here — this
activity must not run a build.

**Reference:** `references/ttp/constants/ttp-sdk-requirements.md`, [Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) (Gradle configuration)

## Critical Rules (NEVER violate these)

1. **NEVER implement code** — your only output is the `project-plan.md` document.
2. **NEVER include code snippets, diffs, or source blocks** — the plan must contain ONLY metadata,
   file paths, decisions, and plain-text notes. Implementation agents have their own activity files
   with full code guidance.
3. **NEVER assume an `app/` module, and NEVER assume `$(pwd)` is the Gradle root.** Resolve
   `gradle_root`, `android_module_dir`, `gradle_module_path` and `source_root` by inspection. A great
   many real projects have no `app` directory, keep sources in `src/main/kotlin`, have no
   `res/layout/` at all, and sit inside a larger build whose wrapper is in an ancestor directory.
   Recording the wrong paths here makes every downstream grep silently match nothing and every
   downstream build command fail on something no gate touched.
4. **NEVER downgrade versions** — if the project already meets or exceeds a minimum, do NOT include
   it in `required_upgrades`.
5. **NEVER stop at the first payment screen** — enumerate ALL payment entry points.
6. **NEVER mark a gate as `skip` for a partial implementation** — if the integration is incomplete
   on any screen, mark `run`.
7. **NEVER hardcode constants** — read all version minimums from
   `references/ttp/constants/ttp-sdk-requirements.md`.
8. **NEVER mark Gate 3, Gate 4 or Gate 5 as `declined`.** Enrollment, the operator menu and charge are
   the foundation every other Tap to Pay gate builds on — after Gate 4 the menu is the only place
   enrollment can be reached from, and the transaction detail page it creates is where Gates 6 and 8 put
   refund and capture. They are `run` or `skip` only. **Nothing inside Gate 4 is separately declinable
   either:** both menu entries always ship, and there is no `transactions_requested` field to record.
9. **NEVER print credential values.** If you inspect `local.properties`, report only whether a key
   is present and whether it is still a placeholder.

## Agent Prompt Template

```
You are a Tap to Pay on Android SDK integration planner. Your only job is to analyse the Android
project and produce a concise, project-specific implementation plan. Do NOT implement anything.
Do NOT write code snippets, diffs, or source blocks in the plan — only metadata, file paths,
decisions, and plain-text notes. The implementation agents have their own activity files with full
code guidance.

Invocation directory: <the directory the skill was invoked from>

> This is **not** necessarily the Gradle root, and not necessarily the app module. Task 1 below
> resolves `GRADLE_ROOT` by walking ancestors; every path in this activity is expressed against the
> values Task 1 produces, never against the invocation directory.

## Inputs injected by the workflow

SKILL_DIR=<SKILL_DIR>                        (ABSOLUTE path to this skill. EVERY `references/...`
                                             path below is relative to it, NOT to the project.
                                             Read them as "$SKILL_DIR/references/ttp/...".)
SELECTED_SDK_VERSION=<SELECTED_SDK_VERSION>            (or N/A — resolved later in Step 1c)
DEVICE_AVAILABLE=<DEVICE_AVAILABLE>                    (yes | no)
CREDENTIAL_METHOD=<CREDENTIAL_METHOD>                  (local_properties | interactive_input | placeholder)
KEY_SOURCE=<KEY_SOURCE>                                (already_have | business_center | rest_api | n/a)
PROGUARD_ENABLED=<PROGUARD_ENABLED>                    (true | false)
CHECKPOINT_MODE=<CHECKPOINT_MODE>                      (autonomous | per_gate)
REFUND_REQUESTED=<REFUND_REQUESTED>                    (true | false)
REFUND_APPROACH=<REFUND_APPROACH>                      (builtin | programmatic | N/A)
REFUND_TYPES=<REFUND_TYPES>                            (referenced_full | referenced_partial | standalone_credit | N/A)
PRE_AUTH_CAPTURE_REQUESTED=<PRE_AUTH_CAPTURE_REQUESTED>  (true | false)
CAPTURE_TYPES=<CAPTURE_TYPES>                          (set: one or more of full | partial, or N/A.
                                                        `both` is NOT a member — if you receive it,
                                                        normalise to [full, partial].)
INCREMENTAL_AUTH_REQUESTED=<INCREMENTAL_AUTH_REQUESTED> (yes | no)
PRE_AUTH_AMOUNT=<PRE_AUTH_AMOUNT>                      (fixed FALLBACK hold amount, or N/A)
PRE_AUTH_AMOUNT_SOURCE=<PRE_AUTH_AMOUNT_SOURCE>        (expression confirmed at Q7c, or "")
UI_PATTERN=<UI_PATTERN>                                (mode-selector | separate-button | N/A)
TIPPING_REQUESTED=<TIPPING_REQUESTED>                  (true | false)
TIP_ENTRY_MODE=<TIP_ENTRY_MODE>                        (percentage | tip_amount | total_amount | N/A)
TIP_PERCENTAGES=<TIP_PERCENTAGES>                      (list, or null for SDK defaults)
TIP_MAX_AMOUNT=<TIP_MAX_AMOUNT>                        (or null)
ACCOUNT_VERIFICATION_REQUESTED=<ACCOUNT_VERIFICATION_REQUESTED>  (true | false — from Q11)
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
PAYMENT_AMOUNT_SOURCE=<PAYMENT_AMOUNT_SOURCE>          (expression confirmed at Q9b, or "")
TRANSACTION_AMOUNT=<TRANSACTION_AMOUNT>                (fixed FALLBACK amount only)

> **`PAYMENT_AMOUNT_SOURCE` and `PRE_AUTH_AMOUNT_SOURCE` arrive already confirmed by the developer.**
> When either is non-empty, record it verbatim and do **not** re-derive it from your own scan — the
> developer chose that expression from a candidate list at Q9b/Q7c, and your scan can only disagree.
> Detect a source yourself **only** when the injected value is empty. If your scan finds a strong
> candidate and the injected value is empty, record it and **flag the disagreement in your report**:
> it means the Step 0 probe missed something.

Also read: "$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md" (version minimums, resolved API
names, device requirements, path-variable guidance).

---

## Your tasks

### 1. Resolve the project layout FIRST (everything else depends on it)

Do this before any other scan. Every subsequent grep in this activity, and in every downstream
gate, is expressed relative to these values.

**The directory the skill was invoked from is not necessarily the Gradle root.** An Android app
inside a larger multi-project build is normally opened at its own module directory — so
`settings.gradle[.kts]`, `gradlew`, `local.properties` and `gradle/wrapper/` all live *above* the
invocation directory, while `build.gradle[.kts]` and `src/` live *at* it. Conflating the two makes
every gate's build check fail on a project that is perfectly well configured.

#### 1a. Gradle root

```bash
# The Gradle root is the nearest ancestor holding settings.gradle[.kts].
GRADLE_ROOT=""
d=$(pwd)
while [ "$d" != "/" ]; do
  if [ -f "$d/settings.gradle.kts" ] || [ -f "$d/settings.gradle" ]; then
    GRADLE_ROOT=$d; break
  fi
  d=$(dirname "$d")
done

# Fallback: a single-project build may have gradlew but no settings file.
if [ -z "$GRADLE_ROOT" ]; then
  d=$(pwd)
  while [ "$d" != "/" ]; do
    [ -f "$d/gradlew" ] && { GRADLE_ROOT=$d; break; }
    d=$(dirname "$d")
  done
fi

[ -n "$GRADLE_ROOT" ] || echo "FAIL: no settings.gradle[.kts] or gradlew in any ancestor directory"
echo "GRADLE_ROOT=$GRADLE_ROOT"
```

If `GRADLE_ROOT` is empty, STOP and ask the developer where the Gradle build lives. Do not
substitute `$(pwd)` — that is the assumption this step exists to remove.

**Everything from here on runs from `$GRADLE_ROOT`.** `cd "$GRADLE_ROOT"` before continuing.

#### 1b. Android application module

```bash
cd "$GRADLE_ROOT" || exit 1

# Collect EVERY module that applies com.android.application — never just the first.
# --exclude-dir keeps generated output and convention-plugin builds out of the candidate list:
# a build/ directory is evidence of a past run, not of current source state.
APP_BUILDS=$(grep -rl 'com\.android\.application' \
  --include='build.gradle' --include='build.gradle.kts' . \
  --exclude-dir=build --exclude-dir=.gradle --exclude-dir=.kotlin \
  --exclude-dir=buildSrc --exclude-dir=build-logic 2>/dev/null)
APP_COUNT=$(printf '%s\n' "$APP_BUILDS" | grep -c . )
echo "APP_COUNT=$APP_COUNT"
printf '%s\n' "$APP_BUILDS"
```

Branch on the count — all three branches matter:

- **Exactly one** → `ANDROID_MODULE_DIR=$(dirname "$APP_BUILDS")`, normalised to drop the leading
  `./`. Proceed.
- **More than one** → **STOP and ask the developer** which module the integration targets, listing
  the candidates. Never pick one by filesystem-walk order; that is a silent coin flip whose wrong
  answer corrupts every downstream gate.
- **Zero** → the plugin is applied through a **convention plugin**, which is how most monorepos do
  it. `--include='build.gradle*'` cannot see those by construction, because a precompiled script
  plugin is named for its plugin id (`android-app-preset.gradle.kts`), not `build.gradle.kts`.
  Resolve it in two steps:

  ```bash
  # Which convention plugins apply the application plugin?
  grep -rl 'com\.android\.application' \
    --include='*.gradle' --include='*.gradle.kts' --include='*.kt' \
    buildSrc build-logic gradle/plugins 2>/dev/null
  # For a precompiled script plugin, the plugin id is the filename minus .gradle[.kts]:
  #   buildSrc/src/main/kotlin/android-app-preset.gradle.kts  ->  id("android-app-preset")
  # Then find the modules that apply that id:
  grep -rn 'android-app-preset' --include='build.gradle' --include='build.gradle.kts' . \
    --exclude-dir=build --exclude-dir=buildSrc --exclude-dir=build-logic 2>/dev/null
  ```

  Substitute the real plugin id for `android-app-preset`. If this still yields nothing, STOP and ask
  the developer which module is the Android application — do **not** fall through to `.`.

> **`dirname ""` returns `.`, which looks like a valid answer.** That is the specific way this step
> fails silently: an empty candidate list becomes "the project root is the app module", every
> subsequent grep runs against a path that holds no sources, and each one reports zero matches with
> exit status 1 — indistinguishable from "checked and found nothing wrong". Treat an empty result as
> a hard FAIL, never as a default.

#### 1c. Gradle task path

In a multi-project build, `assembleDebug` at the root assembles **every** Android module — so a gate
pays for unrelated modules and inherits their failures as its own. Every build command must name the
module it touched.

```bash
if [ "$ANDROID_MODULE_DIR" = "." ]; then
  GRADLE_MODULE_PATH=""          # the root project IS the app module
else
  GRADLE_MODULE_PATH=":$(printf '%s' "$ANDROID_MODULE_DIR" | tr '/' ':')"
fi
echo "GRADLE_MODULE_PATH=$GRADLE_MODULE_PATH"

# Confirm it against Gradle itself — settings.gradle may remap a module's directory,
# in which case the path is NOT derivable from the directory name.
./gradlew -q projects 2>/dev/null | grep -i "$(basename "$ANDROID_MODULE_DIR")"
```

`"$GRADLE_MODULE_PATH:assembleDebug"` is valid in both cases: `:app:assembleDebug` for a submodule,
`:assembleDebug` for the root project. If `gradlew -q projects` shows a different path than the one
derived above, record **Gradle's** answer.

#### 1d. Source root and UI toolkit

```bash
# Kotlin projects commonly use src/main/kotlin instead of src/main/java. Both can exist.
# Strip a "./" prefix so the recorded value is clean when the root is the app module.
SOURCE_ROOT=""
for d in java kotlin; do
  cand="$ANDROID_MODULE_DIR/src/main/$d"; cand=${cand#./}
  [ -d "$cand" ] && SOURCE_ROOT="$cand"
done

# Compose, Views, or both? This decides which wiring branch Gates 3-8 take.
# Scope this to sources, not the whole module: build/ holds generated Compose code and would
# make a Views project look like a Compose one.
HAS_COMPOSE=$(grep -rqE 'androidx\.compose|@Composable' "$SOURCE_ROOT" "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null && echo yes || echo no)
HAS_LAYOUTS=$([ -d "$ANDROID_MODULE_DIR/src/main/res/layout" ] && echo yes || echo no)

echo "ANDROID_MODULE_DIR=$ANDROID_MODULE_DIR"
echo "SOURCE_ROOT=$SOURCE_ROOT"
echo "HAS_COMPOSE=$HAS_COMPOSE HAS_LAYOUTS=$HAS_LAYOUTS"
```

Map the toolkit:
- `HAS_COMPOSE=yes`, `HAS_LAYOUTS=no`  → `ui_toolkit: compose`
- `HAS_COMPOSE=no`,  `HAS_LAYOUTS=yes` → `ui_toolkit: views`
- both yes → `ui_toolkit: mixed` (record which target screens are which)

**Sanity-check before writing anything.** If `SOURCE_ROOT` is empty, STOP and ask the developer
where the module's sources live. Guessing here corrupts every downstream gate, and the corruption is
silent, for the reason given in 1b.

#### 1e. Record all five, and state the convention

Write `gradle_root` (absolute), and `android_module_dir`, `source_root` and `gradle_module_path`
**relative to `gradle_root`** — not to the invocation directory. The two are different on a
submodule invocation, and a plan that does not say which it means is unusable.

Every downstream gate opens with the path preamble in
`references/ttp/constants/ttp-sdk-requirements.md` § *Project Path Variables*, which `cd`s to
`$GRADLE_ROOT` first. That is what makes the relative paths well-defined.

### 2. Detect versions and build configuration

Scan these files (using the resolved paths, not `app/`):
- `settings.gradle` / `settings.gradle.kts`
- root `build.gradle` / `build.gradle.kts`
- `$ANDROID_MODULE_DIR/build.gradle[.kts]`
- `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`
- `gradle/wrapper/gradle-wrapper.properties`
- all `.java` / `.kt` files under `$SOURCE_ROOT`

```bash
# AGP and Kotlin — check the version catalog too; many projects declare them there
grep -rnE 'com\.android\.application|org\.jetbrains\.kotlin\.android' \
  build.gradle build.gradle.kts 2>/dev/null
grep -nE 'agp|android-gradle|kotlin' gradle/libs.versions.toml 2>/dev/null

grep -oE 'gradle-([0-9]+\.[0-9]+(\.[0-9]+)?)-' gradle/wrapper/gradle-wrapper.properties

grep -E 'sourceCompatibility|targetCompatibility|jvmTarget' \
  "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
grep -E 'minSdk|compileSdk|multiDexEnabled' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null

# buildConfig is OFF by default on AGP 8+ — BuildConfig.TTP_MERCHANT_ID will not exist
# until it is enabled, and the error reads like a missing import.
grep -nE 'buildFeatures|buildConfig' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null

# Repository configuration can live in several places. Find whichever the project uses.
# Search by artifact GROUP, not by hostname — a project may resolve io.payworks through its
# organisation's own repository manager under any URL, and that is a valid configuration.
grep -rnE 'io\.payworks|mpos-releases|repo\.visa\.com|dependencyResolutionManagement|allprojects|subprojects' \
  settings.gradle settings.gradle.kts build.gradle build.gradle.kts \
  gradle/libs.versions.toml 2>/dev/null

# How does that repository authenticate? Record it as repo_credential_source.
# A block reading System.getProperty(...) resolves ONLY when those JVM system properties are
# supplied — a bare gradlew invocation gets 401, which reads like a wrong coordinate and is not.
grep -rn -A6 'maven *{\|repositories' build.gradle* settings.gradle* 2>/dev/null \
  | grep -nE 'System\.getProperty|System\.getenv|providers\.gradleProperty|credentials'
```

Map the result to `repo_credential_source`:

| Found | Value | Consequence for the gates |
|-------|-------|---------------------------|
| nothing, or no `credentials` block | `none` | `gradle_args: ""` |
| `providers.gradleProperty(...)` / bare property | `gradle-properties` | credentials come from the developer's Gradle home |
| `System.getenv(...)` | `environment` | must be present in the shell running the gates |
| **`System.getProperty(...)`** | `system-properties` | **Step 1c must populate `gradle_args`**, or every gate fails on `401` |
| a credentials plugin / helper | `helper` | flag it for the developer; do not guess |

Record only the **mechanism**. Never read, print, or copy the credential values.

### 2b. Resolve `repo_url` — the repository that will actually serve `io.payworks`

`repo_url` has one job: name the repository that serves the **`io.payworks` group**. Every later
version query and every gate's dependency resolution is built on it, so a plausible-but-wrong value
does not fail here — it fails two gates later as a `404` that reads exactly like a wrong coordinate.

The grep above returns a *candidate list*, not an answer. Three traps make the obvious reading of it
wrong.

**1. Plugin repositories are not dependency repositories.** A `pluginManagement { repositories { … } }`
block in `settings.gradle[.kts]` resolves *plugin markers* — AGP, Kotlin, convention plugins. It never
serves `io.payworks:mpos.android.taptophone`. A mirror appearing only inside `pluginManagement` is not
a candidate, however apt its name. Find the block's extent so you can tell which matches fall inside it:

```bash
cd "$GRADLE_ROOT" || exit 1
for f in settings.gradle settings.gradle.kts; do
  [ -f "$f" ] || continue
  awk -v F="$f" '
    /pluginManagement[[:space:]]*\{/ && !inblk { inblk=1; start=NR; depth=0 }
    inblk { depth += gsub(/\{/,"{") - gsub(/\}/,"}")
            if (depth <= 0) { print F ": pluginManagement spans lines " start "-" NR; inblk=0 } }
  ' "$f"
done
# Any repository match inside that range is plugin-only. Drop it from the candidate list.
```

**2. One project can declare several mirrors of the same host, holding different things.** A
`-staging` or `-snapshot` mirror carries development builds (`2.117.0-20260813-…`, `3.00.00-…`); a
`-releases` mirror carries the published versions that this skill's version numbers refer to. Naming
the staging mirror produces a `404` for a documented release.

**3. A helper function hides the URL.** Repository blocks are frequently generated, in which case the
literal URL exists only in the helper's definition and the *choice* of repository only at the call site:

```kotlin
fun RepositoryHandler.visaRepository(name: String) = maven { url = uri("https://<host>/$name") }
fun RepositoryHandler.addDependencyRepositories() { visaRepository("mpos-releases"); /* … */ }
```

A grep for a URL finds neither. Grep for the helper too — including `buildSrc` and `build-logic`,
where convention plugins live:

```bash
grep -rnE 'fun +[A-Za-z]*\.?[a-zA-Z]*[Rr]epositor(y|ies)|addDependencyRepositories' \
  build.gradle build.gradle.kts buildSrc build-logic gradle 2>/dev/null | head -20
```

**Then decide by asking the repository, not by reading its name.** One request per candidate settles
it, against a gate that would otherwise burn a full build cycle to find out:

```bash
# Replace the two example URLs with the DEPENDENCY-repository candidates from the steps above.
# Add -u "<user>:<token>" when the repository requires authentication — take those from the
# developer's Gradle home or ask for them. NEVER print, echo, or record the values.
for CANDIDATE in "https://mirror.example.com/mpos-releases" "https://mirror.example.com/mpos-staging"; do
  CODE=$(curl -sS --max-time 20 -o /tmp/ttp-meta.xml -w '%{http_code}' \
    "$CANDIDATE/io/payworks/mpos.android.taptophone/maven-metadata.xml" 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    echo "$CANDIDATE -> 200: $(grep -oE '<version>[^<]+</version>' /tmp/ttp-meta.xml \
      | sed -E 's/<\/?version>//g' | sort -Vu | tail -6 | tr '\n' ' ')"
  else
    echo "$CANDIDATE -> $CODE (does not serve the artifact, or wants credentials)"
  fi
done
```

Record as `repo_url` the candidate that returns `200` **and** lists plain release versions. If more
than one qualifies, prefer the one the target module's own dependency resolution already uses. If none
does, do not guess a mirror: fall back to the documented default and let Step 1c own the network
failure.

> **A `401` is not a "no".** It means the repository exists and wants credentials — the same finding as
> `repo_credential_source` above, seen from the other side. Keep it as a candidate whose credentials
> are missing; do not read it as evidence that the mirror is wrong.

### 3. Write `project-plan.md`

Save to `project-plan.md` at **`$GRADLE_ROOT/project-plan.md`**. Include EXACTLY these fields:

```yaml
# Project Context
package:                    # e.g. com.example.myapp
language:                   # java | kotlin
gradle_dsl:                 # groovy | kotlin
# --- Paths. All four RESOLVED in task 1. The three relative values are relative to
# --- gradle_root, NOT to the directory the skill was invoked from.
gradle_root:                # ABSOLUTE — holds settings.gradle[.kts], gradlew, gradle/wrapper/
android_module_dir:         # e.g. app, ., android-testerapp, apps/pos — holds build.gradle[.kts], src/
gradle_module_path:         # e.g. :app, :apps:pos, or "" when the root project is the app module
source_root:                # e.g. app/src/main/java, src/main/kotlin
ui_toolkit:                 # views | compose | mixed

# --- Baseline. Written by Gate 0, NOT by this activity. Declared here so the
# --- structure is fixed and later gates know what to compare against.
baseline_build:             # pass | fail          (Gate 0)
baseline_build_errors:      # count + file list if non-zero
baseline_quality_task:      # the KOTLIN tool: detekt | ktlintCheck | spotlessCheck | none
baseline_quality_exit:      # 0 | non-zero | n/a
baseline_quality_findings:  # count + rule types
baseline_quality_task_2:    # the ANDROID tool: lintDebug | lint | none. A module can legitimately
                            # expose both families; they lint disjoint file sets, so Gate 0 records
                            # both rather than picking. See workflow.md § 0.2 Baseline quality gate.
baseline_quality_exit_2:    # 0 | non-zero | n/a
baseline_quality_findings_2:  # count + rule types
baseline_accepted_by_developer:  # true only if they chose "proceed anyway" on a failing baseline
agp_version:                # detected
kotlin_version:             # detected
gradle_version:             # detected from gradle-wrapper.properties
min_sdk:                    # detected
java_version:               # detected
compile_sdk:                # detected
multidex_enabled:           # true | false | absent
build_config_enabled:       # true | false — android.buildFeatures.buildConfig
has_application_class:      # true | false
application_class_file:     # relative path if it exists, else ""
application_class_owner:    # "" | hilt | koin | dagger | custom — who owns it, if anyone
di_framework:               # "" | hilt | koin | dagger | custom-component — who owns object
                            # construction, INDEPENDENTLY of has_application_class. A DI-first app
                            # can own the whole lifecycle graph with no Application subclass at all,
                            # and that combination is the third branch of the holder recipe in
                            # ttp-sdk-requirements.md, executed by act_TTP_03 Step 2.
di_singleton_module_file:   # relative path to the module/file holding the app's other singletons,
                            # or "" — where Gate 5 adds the MposUi provider on the DI branch
mpos_accessor:              # WRITTEN BY GATE 3, left empty by planning. The symbol every later gate
                            # uses to reach MposUi: "PaymentApplication.mposUi", "<Existing>.mposUi",
                            # or the injected reference on the DI branch. Gates 4-8 substitute it for
                            # the literal PaymentApplication.mposUi in their code samples.
                            #
                            # GATE 3, not Gate 5: enrollment is the first gate that needs an MposUi, and
                            # Gate 4 (the next one to run) queries transactionModule through the same
                            # instance. Gate 5 only VERIFIES the holder and extends its configuration.
                            # An empty value after Gate 3 is a Gate 3 FAIL — Gate 4 cannot run without it.
repo_config_location:       # settings-drm | root-allprojects | root-subprojects | none
gradle_args:                # extra args EVERY build command must carry, or "" — set at Step 1c.
                            # Populated when the repository block reads credentials from JVM system
                            # properties. NEVER record the credential values themselves here.
repo_credential_source:     # gradle-properties | environment | system-properties | helper | none
repo_url:                   # the repository that will serve io.payworks — an existing declaration if
                            # the project already has one, else the documented default
                            # https://repo.visa.com/mpos-releases/
                            # RESOLVED IN TASK 2b, by asking each candidate for maven-metadata.xml.
                            # Never chosen by reading a mirror's name, and never a pluginManagement
                            # mirror — those serve plugin markers, never io.payworks.
repo_is_existing_decl:      # true | false — true if the project already resolved io.payworks
ttp_sdk_already_present:    # true | false
mposui_already_init:        # true | false
enrollment_already_impl:    # true | false
selected_sdk_version:       # from the workflow (pre-resolved) or N/A. On a project that already pins
                            # io.payworks, this is the EXISTING pin unless the developer chose to
                            # change it at Q1 — see probe P2 in references/ttp/constants/ttp-questions.md
proguard_enabled:           # from PROGUARD_ENABLED
checkpoint_mode:            # from CHECKPOINT_MODE
credential_method:          # from CREDENTIAL_METHOD — how credentials reach the build
key_source:                 # from KEY_SOURCE — how the secret key was obtained. A SEPARATE axis
                            # from credential_method; persisted so a resumed session can recover it
                            # without re-asking, and without risking a needless key regeneration
device_available:           # from DEVICE_AVAILABLE
refund_requested:           # from REFUND_REQUESTED
refund_approach:            # from REFUND_APPROACH
refund_types:               # from REFUND_TYPES
pre_auth_capture_requested: # from PRE_AUTH_CAPTURE_REQUESTED
capture_types:               # from CAPTURE_TYPES — a SET, e.g. [full, partial]
incremental_auth_requested: # from INCREMENTAL_AUTH_REQUESTED
pre_auth_amount:            # from PRE_AUTH_AMOUNT — fixed fallback only
ui_pattern:                 # from UI_PATTERN
tipping_requested:          # from TIPPING_REQUESTED
tip_entry_mode:             # from TIP_ENTRY_MODE
tip_percentages:            # from TIP_PERCENTAGES
tip_max_amount:             # from TIP_MAX_AMOUNT
account_verification_requested:  # from ACCOUNT_VERIFICATION_REQUESTED — true | false.
                            # Gate 9 is `declined` when false. This is the ONLY transaction type whose
                            # recommended answer is "no"; do not read `false` as an oversight.
currency:                   # from TRANSACTION_CURRENCY
transaction_amount:         # from TRANSACTION_AMOUNT — fixed fallback only. Gate 5 must not emit
                            # this when payment_amount_source is non-empty.

# Version upgrade analysis
# Compare detected versions against references/ttp/constants/ttp-sdk-requirements.md.
# Only list components where the project is BELOW the minimum. Never downgrade.
required_upgrades:          # YAML list — empty [] if none needed, e.g.:
  # - component: minSdk
  #   current: "25"
  #   minimum: "31"
  #   target: "31"
  #   reason: "Tap to Pay requires Android 12 (API 31); this is a hard SDK floor with no workaround"
  #   product_impact: "drops all devices below Android 12 from the app's addressable market"

# Gate 4 — existing operator UI. Recorded SEPARATELY per artefact, because Gate 4's Step 0 asks one
# question per artefact that exists. A merged verdict cannot drive that.
existing_menu:              # file path of the app's navigation surface, or "" if none
existing_history:           # file path of a transaction-history surface, or "" if none
existing_enroll_controls:   # YAML list of files carrying an enroll affordance — [] if none.
                            # Gate 4 Step 5 removes every one outside the Device Status screen.
                            #
                            # There is deliberately NO transactions_requested field. Gate 4 ships BOTH
                            # menu entries unconditionally (act_TTP_04 Critical Rule 9), because Gates 6
                            # and 8 attach refund and capture to the transaction detail page it creates.
                            # The question that used to make it optional (Q10) was withdrawn — see
                            # references/ttp/constants/ttp-questions.md. Do not reintroduce the field.

# Existing integration detection — determines which gates can be skipped
gate_skip_decisions:
  gate_1_sdk_deps:            # skip | run
  gate_2_credentials:         # skip | run
  gate_3_enrollment:          # skip | run          — NEVER declined
  gate_4_menu:                # skip | run          — NEVER declined. Owns the ONLY enrollment
                              #   entry point after Gate 4, so declining it leaves no way to enroll.
                              #   Nothing inside it is separately declinable either: both menu
                              #   entries always ship (act_TTP_04 Critical Rule 9).
  gate_5_charge:              # skip | run          — NEVER declined
  gate_6_refund:              # skip | run | declined — "declined" if REFUND_REQUESTED = false
  gate_7_tipping:             # skip | run | declined — "declined" if TIPPING_REQUESTED = false
  gate_8_pre_auth_capture:    # skip | run | declined — "declined" if PRE_AUTH_CAPTURE_REQUESTED = false
  gate_9_account_verification:  # skip | run | declined — "declined" if
                              #   ACCOUNT_VERIFICATION_REQUESTED = false
  gate_10_device_validation:   # run | skipped        — "skipped" only if DEVICE_AVAILABLE = no

# Payment entry points — MANDATORY: list ALL screens, not just the primary one
payment_entry_points:       # YAML list — one entry per screen found, e.g.:
  # - screen: CheckoutActivity
  #   file: app/src/main/java/com/example/CheckoutActivity.kt
  #   ui: views
  #   trigger: "R.id.btn_pay in activity_checkout.xml"
  #   evidence: "displays item price; btn_pay present"
  # - screen: PosScreen
  #   file: android-testerapp/src/main/kotlin/com/example/pos/PosScreen.kt
  #   ui: compose
  #   trigger: "Button(onClick = { ... }) labelled \"Charge\""
  #   evidence: "amount TextField; TODO(payment) comment"

# Primary payment screen (used where an activity needs a single target)
payment_activity:           # class name of the best screen for the payment trigger
payment_activity_file:      # relative path to that source file
payment_layout_file:        # relative path to the layout XML, or "" for Compose
payment_ui:                 # per-item-button | fab | standalone-button | composable-button
payment_amount_source:      # expression e.g. item.price, orderTotal — or "" to use transaction_amount
payment_amount_type:        # Double | Float | BigDecimal | Int/Long minor units | String
                            # The SDK requires BigDecimal at scale 2. Recording the SOURCE type is what
                            # lets Gate 5 convert correctly instead of guessing: BigDecimal(double)
                            # inherits floating-point error, and parsing a locale-formatted string
                            # throws wherever the decimal separator differs. See the constants file
                            # § Money.
pre_auth_amount_source:     # expression for the PRE-AUTH hold, or "" to use PRE_AUTH_AMOUNT.
                            # Usually the SAME expression as payment_amount_source — an app whose sale
                            # uses the cart total but whose pre-auth holds a fixed test amount is
                            # inconsistent, and the inconsistency is invisible until a real hold is
                            # placed for the wrong value.

# Controls that IMPLY a transaction type this run may not implement
# Selecting one of these and pressing pay must never silently fall through to a charge.
unimplemented_controls:     # YAML list — empty [] if none. TWO kinds, which fail differently:
  # - screen: PosScreen
  #   control: "RadioButton \"Refund\""
  #   kind: type                # wrong TYPE goes through
  #   implies: refund
  #   gate: 6
  #   status: implemented | not-implemented-must-guard
  #   unavailable_reason: not-implemented | unsupported | n/a
  #     # not-implemented -> TTP CAN do it; disable with a reason, never remove
  #     # unsupported     -> TTP CANNOT do it, ever; remove from the UI + exhaustive else
  #     # Resolve from ttp-sdk-requirements.md § What the Tap to Pay path can initiate.
  #     # NEVER infer this from whether a gate covers it — see task 3c.
  # - screen: PosScreen
  #   control: "RadioButton \"Ask for Tip on Device\""
  #   kind: modifier            # wrong AMOUNT goes through, and it reports SUCCESS
  #   implies: tipping
  #   gate: 7
  #   status: not-implemented-must-guard

# Inputs the payment path being REPLACED consumed, vs those the Tap to Pay path consumes.
# Every input in the first list and not the second is silently dropped at runtime.
old_call_site_inputs:       # e.g. [transactionType, tipType, workflowType, token, originalTxnId]
new_call_site_inputs:       # e.g. [amount]  — the asymmetry is the thing to check
```

### 3b. Enumerate ALL payment entry points (MANDATORY)

Run these searches — note that every path comes from task 1, and the Compose and Views branches
look for completely different things:

```bash
# --- Views projects: click handlers and layout affordances
grep -rn "setOnClickListener\|OnClickListener\|android:onClick" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rni "price\|amount\|total\|btn_pay\|btn_buy\|btn_donate\|btn_checkout\|btnPay\|btnBuy" \
  "$ANDROID_MODULE_DIR/src/main/res/layout" --include="*.xml" 2>/dev/null

# --- Compose projects: there is no layout XML and no findViewById to find
grep -rn "Button(\|OutlinedButton(\|TextButton(\|Modifier.clickable\|onClick *=" \
  "$SOURCE_ROOT" --include="*.kt" 2>/dev/null
grep -rn "@Composable" "$SOURCE_ROOT" --include="*.kt" 2>/dev/null

# --- Either toolkit: unfinished payment intentions
grep -rni "TODO.*pay\|TODO.*charge\|TODO.*purchase\|TODO.*donat\|TODO.*checkout\|TODO.*tap\|FIXME.*pay" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
```

Record every match in `payment_entry_points`. **Do not stop at the first.** If a search path does
not exist, say so in the plan — do not record it as "no matches found", because those two
conclusions look identical in a grep exit code and only one of them is trustworthy.

If only one screen is found, note it explicitly: `payment_entry_points: [single screen — <class>]`.

### 3c. Inventory controls that imply UNIMPLEMENTED transaction types

This check exists because of a specific, silent, money-moving failure mode.

Many POS-style screens already ship inert UI for transaction types the developer has not asked you
to implement — a Refund / Pre-Auth / Verification radio group, or a set of tipping mode buttons. If
Gate 5 wires the pay button to `startCharge()` and those controls are left inert, then **selecting
"Refund" and pressing pay puts a charge through**. The UI says one thing and the money does another.

For every screen in `payment_entry_points`, search for controls naming a transaction type:

```bash
grep -rniE 'refund|credit|pre-?auth|preauthor|verification|account.?verif|capture|increment|tip' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
# Views projects — also check the layouts:
grep -rniE 'refund|credit|pre-?auth|verification|capture|tip' \
  "$ANDROID_MODULE_DIR/src/main/res/layout" --include="*.xml" 2>/dev/null
```

Also search for **transaction-modifier** controls, which are orthogonal to transaction type and so
are missed entirely by a type-based search:

```bash
grep -rniE 'tip|gratuity|cashback|cash.?back|surcharge|installment|instalment|convenience.?fee|currency.?select' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rniE 'tip|gratuity|cashback|surcharge|installment|instalment|convenience.?fee' \
  "$ANDROID_MODULE_DIR/src/main/res/layout" --include="*.xml" 2>/dev/null
```

For each control found, record its `kind` and whether the corresponding gate is running:

| `kind` | Controls | Failure if left unguarded |
|--------|----------|---------------------------|
| `type` | Refund, Pre-Auth, Capture, Verification, Reversal selectors | the **wrong type** goes through |
| `modifier` | tipping mode, cashback, surcharge, installments, currency selection | the **wrong amount** goes through, **and the transaction reports success** |

- The gate is running → `status: implemented`
- The gate is `declined` or `skip`-not-present → `status: not-implemented-must-guard`

`kind: modifier` entries are the higher risk and must never be dismissed as "not a transaction type,
so it is fine". A wrong-amount charge that reports success is harder to notice than a wrong-type one,
because nothing anywhere reports that the setting was ignored.

Finally, record `old_call_site_inputs` and `new_call_site_inputs`. Read the payment call being
replaced and list every value it consumed, then list what the Tap to Pay path consumes (usually just
the amount). Anything in the first list and not the second is a control the shopper can still change
and the transaction will silently ignore — that difference is what Gate 5's Question D acts on.

Every `not-implemented-must-guard` entry becomes a requirement on the gate that owns that screen:
the control must either be disabled/hidden or must route to an explicit "not implemented" message.
It must never fall through to a charge.

#### Record *why* a control is unavailable — the two reasons need opposite handling

"Cannot be used" hides two different facts, and the remedies are not interchangeable. Set
`unavailable_reason` on every entry:

| `unavailable_reason` | Means | Remedy | Example |
|---------------------|-------|--------|---------|
| `not-implemented` | Tap to Pay **can** do it; **this run** does not implement it, because the developer declined that gate | **Disable with a reason.** Keep it visible and greyed out, labelled "not implemented in this integration" | a `Refund` option when `REFUND_REQUESTED = false`; an `Increase hold` control when `INCREMENTAL_AUTH_REQUESTED = no`; a `Verify card` control when `ACCOUNT_VERIFICATION_REQUESTED = false` |
| `unsupported` | Tap to Pay **cannot** do it, and no future gate will | **Remove it from the UI**, and keep an exhaustive `else` as defence in depth | on-receipt tipping — no SDK equivalent exists at all. Gift-card activation / balance inquiry / cashout — the accessory does not accept them |

> **Every capability the Tap to Pay path supports now has a gate.** Charge (5), refund and stand-alone
> credit (6), tipping (7), pre-auth / increment / capture (8), account verification (9). So
> `not-implemented` no longer means "the skill has a hole here" — it means **the developer said no to that
> gate**. Which of the two reasons applies is therefore decided by the *answers*, not by the skill's
> coverage, and it can differ between two runs on the same codebase.

Resolve every entry against the capability table in
`references/ttp/constants/ttp-sdk-requirements.md` § *What the Tap to Pay path can initiate — and what
it cannot*, then cross-check the gate answer. **Do not infer `unsupported` from the fact that a gate is
not running**, and do not infer it from the control's name.

> **Both directions of this mistake have been observed on a real integration.** One run removed an
> account-verification control believing the platform could not do it — it can, and as of `act_TTP_09` the
> skill implements it, so that run silently dropped a capability twice over. The same run initially kept
> an on-receipt tipping option and merely warned about it — nothing will ever implement it, so the warning
> was permanent UI noise. Getting the membership wrong is easy; that is why the table is authoritative and
> this field is recorded.

> **A control marked `not-implemented` because its gate was declined must be re-checked if the developer
> changes their mind.** On a re-run with `ACCOUNT_VERIFICATION_REQUESTED = true`, `act_TTP_09` AC 12
> requires the disabled state and the reason string to be **removed**. A stale "not implemented in this
> integration" label on a working control is the same class of defect as the reverse.

Removing an `unsupported` control is a **change to the app's feature surface**. Say so in the gate
report and name what was removed — do not present it as a detail of the integration.

### 3d. Detect existing integrations (gate skip decisions)

**Check the workflow's transaction answers first.** If a transaction type was declined, mark its
gate `declined` immediately without scanning code:
- `REFUND_REQUESTED = false` → `gate_6_refund = declined`
- `TIPPING_REQUESTED = false` → `gate_7_tipping = declined`
- `PRE_AUTH_CAPTURE_REQUESTED = false` → `gate_8_pre_auth_capture = declined`
- `ACCOUNT_VERIFICATION_REQUESTED = false` → `gate_9_account_verification = declined`

Gates 3, 4 and 5 are never declined. Gate 10 is `run` when `DEVICE_AVAILABLE = yes`, else `skipped`.

Then run the grep checks for gates that are not already `declined`:

```bash
# Re-bind the path set. Shell state does NOT survive between tool calls: the `cd` and the variables
# from Task 1 are gone in this new shell. An unset $SOURCE_ROOT makes every grep below search the
# wrong place — or nothing at all — and report zero matches, which reads as "checked and clean".
cd "$GRADLE_ROOT" || exit 1
[ -n "$SOURCE_ROOT" ] && [ -d "$SOURCE_ROOT" ] \
  || { echo "FAIL: SOURCE_ROOT unset or missing — re-run Task 1 before these checks"; exit 1; }

# Gate 1 — SDK dependencies. "Present" means CONSUMED BY THIS MODULE, not merely declared.
#
# A version catalog can define both coordinates, at one shared version, while the target module
# references neither alias. Grepping the catalog then reports "both artifacts present" and Gate 1 is
# marked skip — after which every later gate fails on unresolved SDK imports, a long way from the cause.
#
# Step 1: where are the coordinates declared at all?
grep -rnE 'io\.payworks:(paybutton-android|mpos\.android\.taptophone)' \
  "$ANDROID_MODULE_DIR"/build.gradle* gradle/libs.versions.toml 2>/dev/null

# Step 2: if they are only in the catalog, find the ALIAS names and check the module consumes them.
#   gradle/libs.versions.toml:  mpos-ui = { module = "io.payworks:paybutton-android", ... }
#   alias "mpos-ui" is referenced from Kotlin DSL as libs.mpos.ui (dashes become dots)
grep -nE '^[a-zA-Z0-9_-]+ *= *\{ *module *= *"io\.payworks:' gradle/libs.versions.toml 2>/dev/null

# Step 3: THE AUTHORITATIVE CHECK — ask Gradle what is actually on the module's classpath.
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:dependencies" \
  --configuration debugRuntimeClasspath > /tmp/ttp-deps.log 2>&1
DEPS_EXIT=$?
if [ "$DEPS_EXIT" -eq 0 ]; then
  grep -cE 'io\.payworks:paybutton-android' /tmp/ttp-deps.log
  grep -cE 'io\.payworks:mpos\.android\.taptophone' /tmp/ttp-deps.log
else
  echo "note: dependency report unavailable (exit $DEPS_EXIT) — fall back to the grep evidence and
say so in the plan. Do NOT record 'present' on catalog evidence alone."
fi
# A card-reader accessory artifact appearing here is a defect, not a skip signal:
grep -rn 'mpos\.android\.accessories\.' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null

# Gate 2 — credentials wired through BuildConfig (never hardcoded)
grep -rn 'TTP_MERCHANT_ID\|TTP_MERCHANT_SECRET' \
  "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
grep -qE '^TTP_MERCHANT_ID=' local.properties 2>/dev/null \
  && echo "local.properties: TTP_MERCHANT_ID present" \
  || echo "local.properties: TTP_MERCHANT_ID absent"
# Placeholder check — report presence only, NEVER the value
grep -qE '^TTP_MERCHANT_ID=(MERCHANT_ID_HERE|pending-manual-entry)$' local.properties 2>/dev/null \
  && echo "credentials: PLACEHOLDER" || echo "credentials: set or absent"

# Gate 3 — enrollment
grep -rn 'enrollDevice\|getEnrollDeviceIntent\|isDeviceEnrolled\|EnrollResultIntent' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null

# Gate 4 — operator menu, transaction history, and where enrollment is PRESENTED.
# Three independent artefacts. Record each separately: Gate 4's Step 0 asks one question per
# artefact that EXISTS, so a merged "some UI exists" verdict cannot drive it.
grep -rniE 'NavigationDrawer|ModalNavigationDrawer|DrawerLayout|BottomNavigation|NavigationBar|TopAppBar|Toolbar|onCreateOptionsMenu|NavigationRail' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rniE '<menu|NavigationView|BottomNavigationView|MaterialToolbar' \
  "$ANDROID_MODULE_DIR/src/main/res" 2>/dev/null
grep -rniE 'transactionModule|queryTransactions|lookupTransaction' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rniE 'transactionHistory|TransactionList|pastTransactions|OrderHistory' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
# `gate_4_menu = skip` requires ALL THREE: a menu listing Transactions then Device Status, a history
# backed by transactionModule, and no enrollment control outside that menu. A menu on its own is not
# a skip signal — most apps have one and it has nothing to do with Tap to Pay.

# Gate 5 — charge + the MposUi holder
grep -rn 'MposUi\.create\|createTransactionIntent\|startCharge' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rn 'AccessoryFamily\.' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
# every match must be AccessoryFamily.TAP_TO_PHONE — any other family is a defect to report

# Gate 6 — refund. `REFUND_TRANSACTION` is an SDK enum member; `.refund(` and `startRefund` are
# ordinary method names an app's own payment code plausibly already has. Qualify the weak ones.
grep -rn 'REFUND_TRANSACTION' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
for f in $(grep -rlE '\.refund\(|startRefund' "$SOURCE_ROOT" \
             --include="*.kt" --include="*.java" 2>/dev/null); do
  grep -q 'io\.mpos' "$f" && echo "SDK refund: $f" || echo "app's own refund (NOT SDK): $f"
done

# Gate 7 — tipping. Two of these three patterns are SDK type names and prove SDK code; the third
# does not. `includedTipAmount` is ordinary POS domain vocabulary — an app's own data class can carry
# that exact field name for its own payment rail, and it is the ONLY one of the three that can match a
# project with zero SDK integration. OR'd together, one weak pattern reports "tipping present" on an
# app that has never seen this SDK.
grep -rn 'TippingProcessStepParameters\|TransactionProcessParameters' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null

# The weak pattern, qualified: only count it where the same file also resolves the SDK.
for f in $(grep -rl 'includedTipAmount' "$SOURCE_ROOT" \
             --include="*.kt" --include="*.java" 2>/dev/null); do
  grep -q 'io\.mpos' "$f" \
    && echo "SDK tip usage: $f" \
    || echo "app's own field (NOT evidence of SDK tipping): $f"
done

# Gate 8 — pre-auth and capture. Same split: `autoCapture`, `CAPTURE_TRANSACTION` and
# `incrementalAuthorization` are SDK-specific; `.capture(` is not.
grep -rn 'autoCapture\|CAPTURE_TRANSACTION\|incrementalAuthorization' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
for f in $(grep -rlE '\.capture\(' "$SOURCE_ROOT" \
             --include="*.kt" --include="*.java" 2>/dev/null); do
  grep -q 'io\.mpos' "$f" && echo "SDK capture: $f" || echo "app's own capture (NOT SDK): $f"
done
```

> **A match on a generic name is evidence to confirm, not a conclusion.** Weigh the two kinds of
> pattern differently: an SDK *type* or *enum member* (`TippingProcessStepParameters`,
> `REFUND_TRANSACTION`, `MposUi`, `EnrollResultIntent`) cannot appear in an app that has never
> integrated this SDK, so a match is proof. A *method or field name drawn from payment domain
> vocabulary* (`includedTipAmount`, `.refund(`, `.capture(`, `.charge(`) can appear in any POS
> codebase, so a match proves only that the app handles payments — which is not the question.
>
> Where a weak pattern is the only hit, the gate is **`run`**, not `skip`. Record the file in the plan
> as an app-owned name so the implementation gate does not mistake it for a partial SDK integration and
> try to "complete" it.

**Skip decision rules:**

| Gate | `skip` when | `run` when | `declined` when |
|------|-------------|-----------|-----------------|
| 1 | both `io.payworks` artifacts are **on `$GRADLE_MODULE_PATH`'s runtime classpath** at the same version AND the build passes | either artifact absent from the module's classpath, versions differ, or the build fails | never |
| 2 | `BuildConfig` fields wired via `Properties().load()` AND `buildConfig = true` AND non-placeholder values | any of those missing | never |
| 3 | `enrollDevice`/`getEnrollDeviceIntent` + result handling + `isDeviceEnrolled()` all present | any missing | **never** |
| 4 | ALL THREE: a menu listing `Transactions` then `Device Status`, a history backed by `transactionModule`, AND no enroll control outside that menu | any of the three missing — a menu alone is not a skip signal | **never** |
| 5 | `MposUi.create()` with `TAP_TO_PHONE` + `startCharge(` present in **all** `payment_entry_points` | missing from any screen | **never** |
| 6 | refund path present for every requested `REFUND_TYPES` entry | absent but requested | `REFUND_REQUESTED = false` |
| 7 | tipping step wired into **every** charge call site, matching `TIP_ENTRY_MODE` | absent but requested, or wired into only some call sites | `TIPPING_REQUESTED = false` |
| 8 | pre-auth + capture both present, identifier persisted across process death | either absent | `PRE_AUTH_CAPTURE_REQUESTED = false` |
| 9 | `.verification(` present with a distinct verification affordance and its own result branch | absent but requested | `ACCOUNT_VERIFICATION_REQUESTED = false` |
| 10 | never `skip` | `DEVICE_AVAILABLE = yes` | `skipped` when `DEVICE_AVAILABLE = no` |

Record the evidence (grep output or build result) as a comment beside each verdict. That evidence is
shown to the developer for approval at the workflow's Step 1b.

> **A declaration is not a dependency.** `gate_1_sdk_deps = skip` requires evidence that the artifacts
> resolve **for this module** — a catalog alias nobody references, a `dependencyResolutionManagement`
> entry, or a coordinate in a sibling module all satisfy the grep and none of them puts a class on
> `$ANDROID_MODULE_DIR`'s classpath. Record which evidence you used: `classpath` (authoritative) or
> `declaration-only` (weak — prefer `run`).

**A gate is only `skip` if the integration is complete and correct for that gate.** Partial
implementations — charge working on one screen but not another, tipping on one call site out of
three — must be marked `run`. The implementation agent detects and preserves existing work.

### 4. Detect known issues and required adaptations

Read `"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` for minimums, then note which apply:

- `needs_matchingFallbacks`: the SDK publishes a **release variant only**, so the `debug` build type
  must fall back to `release`. Note whether a `buildTypes` block exists at all — if not, it must be
  created, not edited.
- `needs_buildconfig_enable`: true when `build_config_enabled` is false or absent. On AGP 8+ this is
  off by default and `BuildConfig.TTP_MERCHANT_ID` will not exist.
- `needs_multidex`: note if the project is large or already near the dex limit.
- `needs_allowbackup_fix`: check whether the manifest sets `android:allowBackup="false"`. Absent
  counts as a defect — the platform default is `true`, which corrupts the Keystore-held keys.
- `needs_largeheap`: check for `android:largeHeap="true"`.
- `application_class_conflict`: true when `has_application_class` is true. Record the owner. If DI
  (Hilt/Koin/Dagger) owns the `Application` subclass, Gate 5 must **extend the existing class**, not
  create a new one — changing `android:name` on an app with a live Application subclass is a
  breaking edit.
- `di_framework` / `di_singleton_module_file`: **detect these even when `has_application_class` is
  false.** The two are independent, and the combination `has_application_class: false` +
  `di_framework: dagger` is a real project shape, not a contradiction — a DI-first app builds its
  object graph through a component and never needs an `Application` subclass. Gate 5's Step 1 has a
  dedicated branch for it, and that branch only fires if planning recorded the framework.

  ```bash
  grep -rn '@HiltAndroidApp\|@Component\|@Singleton\|startKoin\|dagger\.' "$SOURCE_ROOT" \
    --include="*.kt" --include="*.java" | head -20
  ```

  For `di_singleton_module_file`, name the file that already holds the app's *other* singleton
  providers — Gate 5 adds `MposUi` beside them rather than starting a new module. Leave it `""` if
  you cannot identify one; do not guess a path.

  > **Recording `di_framework: ""` on a project that has one sends Gate 5 down the wrong branch**, and
  > the result is a new `Application` subclass competing with the component for ownership of the same
  > object's lifetime. That is the failure Critical Rule 15 exists to prevent, arrived at from the one
  > direction the rule's own wording does not cover.
- `credentials_in_local_properties`: whether `local.properties` already exists and is gitignored.
- `proguard_already_configured`: whether the keep rules are already present:
  ```bash
  grep -l 'io\.mpos\|com\.visa\.vac\.tc' "$ANDROID_MODULE_DIR"/proguard-rules.pro 2>/dev/null
  ```
  NOTE: `io.mpos` here is the **runtime Java package** used in keep rules, NOT a Maven group. The
  Maven group for all SDK artifacts is `io.payworks` only.
- `accessory_artifact_present`: the coordinate of any `mpos.android.accessories.*` artifact found, else
  `false`. Report it to the developer and ask; it is not yours to remove. Tap to Pay does not need one,
  and this skill has no opinion on why it is there.
- `preexisting_java_util_currency`: list any files that already import `java.util.Currency` for
  reasons unrelated to the SDK (currency formatting, locale lists). Gate 5's Currency check must
  not flag these.
  ```bash
  grep -rln 'java\.util\.Currency' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
  ```
- `currency_import_collision`: the subset of the list above that is **also** in
  `payment_entry_points`. Compute it explicitly — this is the set of files where Gate 5 must not add a
  bare `import io.mpos.transactions.Currency`, because two imports of the same simple name in one
  Kotlin file is a **conflicting-import error**, not a warning. The overlap is common rather than
  exotic: the screen that shows prices is usually the screen that takes payment.
  ```bash
  # Files that use the JDK type AND are payment entry points.
  for f in $(grep -rl 'java\.util\.Currency' "$SOURCE_ROOT" \
               --include="*.kt" --include="*.java" 2>/dev/null); do
    grep -qE 'MposUi|createTransactionIntent|startCharge|<pay-button-id>' "$f" && echo "COLLISION: $f"
  done
  ```
  If the list is non-empty, say so in the plan in those words — Gate 5 reads this field to decide
  between aliasing the SDK type and fully-qualifying it.

**Version upgrade decisions** — populate `required_upgrades`:

Compare each detected version against the minimum in the constants file. Add an entry **only**
where the project is BELOW the minimum. Never downgrade a version that already qualifies.

For `minSdk` specifically, also fill in `product_impact`. Raising `minSdk` to 31 is not a build
tweak — it removes devices from the app's addressable market, and the developer needs to weigh that
rather than approve it as routine.

### 5. Write implementation notes for each gate (NO code snippets)

Append a `# Gate Implementation Notes` section. For each gate, list ONLY project-specific decisions
and file targets. No code blocks, diffs, or source snippets — the implementation agents have their
own activity files and generate correct code from the metadata above.

#### GATE 1 — SDK Dependencies
- Files to modify: repository declaration (at `repo_config_location`),
  `$ANDROID_MODULE_DIR/build.gradle[.kts]`, `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`
- `repo_url` to use, and whether it is an existing mirror to reuse rather than add to
- Which `required_upgrades` entries apply
- `needs_matchingFallbacks` (and whether the `buildTypes` block must be created)
- `needs_multidex`, `needs_allowbackup_fix`, `needs_largeheap`
- ProGuard: `proguard_enabled` + `proguard_already_configured`. If `proguard_enabled = false`, note
  "ProGuard skipped (developer declined at Step 0)" — Gate 1 must not re-ask.

#### GATE 2 — Merchant Credentials
- Target: `local.properties` + `BuildConfig` fields in `$ANDROID_MODULE_DIR/build.gradle[.kts]`
- `needs_buildconfig_enable` — call this out explicitly; it is the most common silent failure here
- `credential_method`, and whether current values are placeholders
- Constraint: read via `Properties().load()`, never `project.findProperty()`

#### GATE 3 — Device Enrollment
- Target screen/class for the enrollment entry point
- `ui_toolkit` — Compose projects must use the Activity Result API with
  `getEnrollDeviceIntent(...)`; the legacy `enrollDevice(activity, requestCode)` +
  `onActivityResult` path is for Views projects, and some lint configurations reject it outright
- Where the returned serial number will be persisted (needed for re-enrollment)
- Note if `credential_method = placeholder`: enrollment code can be written and built, but
  on-device enrollment is BLOCKED, not merely deferred
- **The `MposUi` holder is this gate's, and it decides `mpos_accessor` for the whole run.** State which
  of the three branches applies from what you detected — `has_application_class`,
  `application_class_owner` and `di_framework` between them determine it:
  - `has_application_class = true` → EXTEND that class (name it, and name its owner if any)
  - `has_application_class = false`, `di_framework` empty → create `PaymentApplication`
  - `has_application_class = false`, `di_framework` non-empty → singleton-scoped provider in
    `di_singleton_module_file` (name the file)
- Note that `mpos_accessor` must be written back to `project-plan.md` by this gate. Gate 4 runs next and
  reads it; Gates 5–9 substitute it into their samples

#### GATE 4 — Menu: Transactions and Device Status
- `existing_menu`, `existing_history`, `existing_enroll_controls` — reproduce each verbatim from the
  detection above. Gate 4's Step 0 asks **one question per artefact that exists**, so a merged verdict
  ("some operator UI present") cannot drive it. Where all three are empty, say so explicitly: that is the
  greenfield path and Step 0 asks nothing
- Which file will host the menu, and whether it is the app's own navigation surface or a new one
- `ui_toolkit` — `ModalNavigationDrawer` (Compose) vs `DrawerLayout` + `res/menu/*.xml` (Views). On
  `mixed`, say which of the two the host screen uses
- `mpos_accessor` — expected to be non-empty by the time this gate runs (Gate 3 writes it). If Gate 3 is
  `skip`, flag that this gate has no accessor yet and Gate 4 will have to stop and report
- **Do not note a "transactions declined" case. There is none** — both entries always ship
  (`act_TTP_04` Critical Rule 9), because Gates 6 and 8 attach their actions to the transaction detail
  page this gate creates
- Note that the transaction detail actions slot must be left **empty** here; refund is Gate 6's and
  capture is Gate 8's
- This gate edits `res/` — so the ANDROID quality task must be re-run at its boundary, not just the
  Kotlin one

#### GATE 5 — Charge Transaction
- One bullet per screen from `payment_entry_points`: class, file, trigger, amount source
- **The holder already exists by now — Gate 3 built it.** Note the expected `mpos_accessor` and that
  Gate 5 verifies rather than creates. Flag the one case where it *does* create: `gate_3_enrollment = skip`
  on a project whose own enrollment code has no durable holder (Gate 5 Step 1.1a)
- `ui_toolkit` per screen (relevant when `mixed`)
- `currency`, `payment_amount_source` (+ `payment_amount_type`) or `transaction_amount`, and
  `pre_auth_amount_source` where pre-auth is in scope
- Every `unimplemented_controls` entry on these screens that needs guarding
- `preexisting_java_util_currency` file list, so the Currency check is scoped correctly

#### GATE 6 — Refund
Only if `refund_requested = true`, else note "Refund skipped (developer declined)."
- `refund_approach`, `refund_types`, and the screens needing refund affordances

#### GATE 7 — Tipping
Only if `tipping_requested = true`, else note "Tipping skipped (developer declined)."
- `tip_entry_mode`, `tip_percentages`, `tip_max_amount`
- **Every** charge call site found in task 3d — tipping modifies each of them, and a call site left
  at one argument keeps taking untipped payments silently

#### GATE 8 — Pre-Auth and Capture
Only if `pre_auth_capture_requested = true`, else note "Pre-auth/capture skipped (developer declined)."
- `capture_type`, `incremental_auth_requested`, `pre_auth_amount`, `ui_pattern`
- Where the pre-auth identifier will be persisted — `SharedPreferences`, not a member field, since
  the capture can happen days later

#### GATE 9 — Account Verification
Only if `account_verification_requested = true`, else note "Account verification skipped (developer
declined)." — and note that `false` is the *recommended* answer, so this is the expected case.
- Which screen will host the `Verify card` action. The card-on-file use case usually lives with a
  customer or account record rather than the till, so `payment_entry_points` is **context, not the
  answer**; `act_TTP_09` Step 5 asks the developer
- Any existing verification control found by task 3c, with its `unavailable_reason`. If one was recorded
  as `not-implemented`, note that this gate **enables** it and must delete its reason string
- Where the verification identifier will be persisted
- **State explicitly that this gate has NO amount**: `.verification(currency)` takes none, and
  `payment_amount_source` / `transaction_amount` / `payment_amount_type` are all irrelevant to it. Do not
  copy the Gate 5 amount bullets into this section

#### GATE 10 — Manual Device Validation
- `device_available`, and the device model/OS if known
- Which criteria the earlier gates will defer here
- Reminder: developer options must be disabled before enrolling, which costs adb access

**STOP — do NOT add any section containing code.** The plan must NOT contain ProGuard rules,
Gradle blocks, `PaymentApplication` source, transaction method bodies, or any other code.

### 6. Generate the Progress Tracker

Append this section. It is the persistent task list, and the workflow reads it to resume an
interrupted session.

**Reproduce the header exactly — four columns, `| # | Task | Status | Notes |`.** Folding `Notes`
into `Status` produces a table that still parses and still resumes, so nothing fails today; it just
means two runs of this workflow on the same project write structurally different plan files, and the
next thing to read one of them has no fixed shape to rely on.

```markdown
# Progress Tracker

<!-- Updated automatically by the workflow as each gate completes.
     If a session is interrupted, the workflow reads this table to resume. -->

| # | Task | Status | Notes |
|---|------|--------|-------|
| P | Planning & project analysis | done | plan written to project-plan.md |
| 0 | Baseline build & quality gate | pending | measured BEFORE any change |
| 1 | SDK Dependencies | pending | |
| 2 | Merchant Credentials | pending | |
| 3 | Device Enrollment | pending | |
| 4 | Menu: Transactions & Device Status | pending | |
| 5 | Charge Transaction | pending | |
| 6 | Refund Transaction | pending | |
| 7 | Tipping | pending | |
| 8 | Pre-Auth & Capture | pending | |
| 9 | Account Verification | pending | |
| 10 | Manual Device Validation | pending | |
| F | Final clean build | pending | |
```

**Status values:** `pending`, `in_progress`, `done`, `skipped`, `failed`, `blocked`

Mark any gate the analysis says should be skipped as `skipped`, with the reason (e.g. "detected:
SDK already configured", "developer declined refunds", "no compatible device").

**These same rows are mirrored into the harness's session task list once the plan is approved** — see
`workflow.md` § *Mirroring the tracker into the task list*. That mirror exists so the developer can see
where the run is without opening a file; **this table remains the source of truth**, and the mirror is
never read back.

### 6a. Generate the Requested Capabilities checklist

Append this section too. **It is not a duplicate of the Progress Tracker, and it is not optional.**

The Progress Tracker records *what an agent reported*. This table records *what the developer asked
for* — and several gates carry more than one capability. Gate 6 alone can hold up to three refund
types. With only the gate table, a Gate 6 that built one of three requested types is written down as
`done` and is indistinguishable from a complete one: no error, no failed build, and the missing
capability surfaces months later when a merchant needs it. **This table is what makes `done`
falsifiable.**

Write one row per capability, expanding every set-valued answer into its own row. Set `Requested` from
the recorded answer and `Status` to `pending` for requested rows, `n/a` for the rest:

```markdown
# Requested Capabilities

<!-- One row per capability the developer asked for. The Progress Tracker says what an agent
     reported; this table says whether the requested thing exists. A gate may NOT be marked `done`
     in the Progress Tracker while any row it owns is still `pending` or `missing`. -->

| Capability | Gate | Requested | Status |
|------------|------|-----------|--------|
| Charge | 5 | yes | pending |
| Refund — referenced, full amount | 6 | <yes if referenced_full in refund_types, else no> | pending |
| Refund — referenced, partial amount | 6 | <yes if referenced_partial in refund_types, else no> | pending |
| Refund — stand-alone credit | 6 | <yes if standalone_credit in refund_types, else no> | pending |
| Tipping | 7 | <tipping_requested> | pending |
| Capture — full | 8 | <yes if full in capture_types, else no> | pending |
| Capture — partial | 8 | <yes if partial in capture_types, else no> | pending |
| Incremental authorization | 8 | <incremental_auth_requested> | pending |
| Account verification | 9 | <account_verification_requested> | pending |
```

**Capability status values:** `pending`, `done`, `missing`, `n/a`.

- `pending` — requested, not yet implemented
- `done` — requested and verified present in the code
- `missing` — requested, the owning gate has run, and it is **not** there. This is a `FAIL`, never a
  footnote
- `n/a` — not requested

> **Expand the sets, never collapse them.** A single row reading `Refund types | 6 | [full, partial,
> standalone] | pending` defeats the purpose: it can be marked `done` while two thirds of it is missing.
> One row per capability is the whole mechanism.

> **Rows are never deleted, only set to `n/a`.** A capability the developer declined must stay visible as
> a deliberate `no`, so a later session can tell "declined" from "forgotten".

### 7. Final output

When done, print:

```
PLANNING COMPLETE

Project:           <package>
Language / DSL:    <language> / <gradle_dsl>
UI toolkit:        <ui_toolkit>
Gradle root:       <gradle_root>
Android module:    <android_module_dir>   (task path <gradle_module_path>)
Source root:       <source_root>
Payment screens:   <count> — <list>
Unguarded controls implying unimplemented types: <count> — <list or none>
Required upgrades: <count> — <components, or none>
Device available:  <device_available>
Plan written to:   project-plan.md (includes Progress Tracker)
```
```

## Acceptance Criteria

- [ ] `project-plan.md` exists at `$GRADLE_ROOT/project-plan.md`
- [ ] `gradle_root` is absolute and was resolved by walking ancestors for `settings.gradle[.kts]` —
      **not** assumed to be the invocation directory
- [ ] `gradle_module_path` is populated and was cross-checked against `./gradlew -q projects`
- [ ] `android_module_dir`, `source_root` and `ui_toolkit` are populated and were **verified to
      exist** — not assumed to be `app/` and `src/main/java`
- [ ] The application-module search found exactly one candidate, or the developer was asked. A zero
      count was resolved through the convention-plugin branch and **never** allowed to default to `.`
- [ ] All fields in the Project Context section are populated
- [ ] `payment_entry_points` lists ALL screens, with the correct `ui` value per screen
- [ ] `unimplemented_controls` lists every transaction-type control on those screens, each marked
      `implemented` or `not-implemented-must-guard`
- [ ] `gate_skip_decisions` has a verdict for every gate, with evidence
- [ ] Gates 3, 4 and 5 are `run` or `skip` — never `declined`
- [ ] `required_upgrades` lists only components BELOW the minimum, and `minSdk` entries carry a
      `product_impact` note
- [ ] `preexisting_java_util_currency` records any non-SDK `java.util.Currency` users
- [ ] Every GATE section has project-specific notes (file targets, decisions) — NO code snippets
- [ ] Progress Tracker is present with correct initial statuses, and its header is the four-column
      `| # | Task | Status | Notes |` from § 6 — not a three-column variant with the notes folded in
- [ ] No credential value was printed anywhere in the output or the plan
- [ ] The agent printed `PLANNING COMPLETE`
