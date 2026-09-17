# Activity TTP-2: Obtain Merchant Credentials (MID + Secret Key)

Generate and configure the merchant credentials — a **Merchant ID (MID)** and an **Acceptance
Devices Secret Key** — that the Tap to Pay SDK requires. These values are supplied to the
`MposUi.create()` call (`merchantId` and `merchantSecret`) that the device-enrollment activity
(`act_TTP_03`) and all transaction activities depend on.

**Reference:** [Generating a Secret Key for an Existing Merchant ID](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md), `references/ttp/constants/ttp-sdk-requirements.md`, `references/ttp/troubleshooting.md#tap-to-pay`

## Critical Rules (NEVER violate these)

1. **NEVER hardcode the MID or secret key in source code.** Store TEST credentials in `local.properties` and surface them via `BuildConfig` fields. For production, the developer must implement their own secure credential management (backend service, vault, etc.).
2. **NEVER commit `local.properties` to version control.** Ensure it is listed in `.gitignore`.
3. **The secret key is shown only once.** In the Business Center, after leaving the Key Generation page the same secret key can never be retrieved again. Instruct the developer to copy/download and store it immediately; a lost key requires generating a new one.
4. **NEVER log, echo, or print the secret key to the terminal.** Do not read back the contents of `local.properties`. The developer manages secret values themselves.
5. **This activity configures the TEST/sandbox environment only** (`apitest.visaacceptance.com` / `ProviderMode.TEST`). Never test against production.
6. **Always include a production-credential TODO reminder** in any generated credential-loading code.

## Prerequisites

Before starting this activity, the developer must have:

- Completed `act_TTP_01` (SDK dependencies configured, project builds)
- A **Visa Acceptance / Business Center account** with an existing **Merchant ID (MID)**
- For the REST API path: REST authentication configured (shared secret key or certificate) — see [Getting Started with REST](https://developer.visaacceptance.com/docs/vas/en-us/platform/developer/all/rest/rest-getting-started/restgs-intro.md)

## Workflow

There are **two supported ways** to generate the secret key. Ask the developer which they prefer
(`CREDENTIAL_METHOD`), then follow the matching path. Both produce a MID + secret key pair that
is stored the same way in Step 3.

### Step 1 (Option A): Generate the Secret Key in the Business Center

The Business Center UI path — best for developers who prefer a guided, no-code flow.

1. In the **Business Center**, open the left navigation panel and choose **Payment Configuration ▸ Key Management**. The Key Management page appears.
2. From the **Merchant** drop-down list, choose the MID for which to generate a secret key.
3. Click **Generate Key**.
4. In the **Recommended Key Types** list, scroll down and choose **Acceptance Devices Secret Key**.
5. Click **Generate Key**. The Key Generation page appears.
6. Click **Generate Key** again. Your MID and secret key appear on the page.
7. Click the **Copy** or **Download** icon to save the MID and secret key locally.

> **IMPORTANT:** If you copy (rather than download) the secret key, save it immediately. After
> you leave the Key Generation page you cannot retrieve the same key again — you would have to
> restart the key-generation process to obtain a new one.

### Step 1 (Option B): Generate the Secret Key via REST API

The programmatic path — best for automated/repeatable provisioning. Each request must be
authenticated with a REST shared secret key or certificate (see Prerequisites).

**Endpoints:**

| Environment | Request |
|-------------|---------|
| Test | `POST https://apitest.visaacceptance.com/kms/v2/keys-sym-pos` |
| Production | `POST https://api.visaacceptance.com/kms/v2/keys-sym-pos` |

**Required field:** `keyInformation.organizationId` — the transacting MID.

**Request body:**

```json
{
    "keyInformation": [
        {
            "organizationId": "transacting_MID"
        }
    ]
}
```

**Successful response** (the `key` field is the secret key, `externalOrganizationId` is the MID):

```json
{
    "submitTimeUtc": "2023-08-07T13:07:17Z",
    "status": "ACCEPTED",
    "keyInformation": [
        {
            "organizationId": "transacting_MID",
            "externalOrganizationId": "MerchantId",
            "key": "SecretKey",
            "keyId": "af922a42-6d2c-41fd-92f7-09d908647de4",
            "status": "ACTIVE",
            "expirationDate": "2033-08-07T13:07:17Z"
        }
    ]
}
```

Extract `externalOrganizationId` (MID) and `key` (secret key) from the response. Treat the
response body as sensitive — do not print it to the terminal or write it to logs.

### Step 2: Confirm the Credential Pair

You now have two values:

- **Merchant ID (MID)** — e.g. `externalOrganizationId` from the REST response, or the value shown in the Business Center.
- **Secret Key** — the `key` from the REST response, or the value copied/downloaded from the Business Center.

These are consumed by `MposUi.create(merchantId = ..., merchantSecret = ...)` in `act_TTP_03`.

### Step 3: Store Credentials Securely (TEST)

1. Add the credentials to `local.properties` (never committed):

   ```properties
   TTP_MERCHANT_ID=MerchantId
   TTP_MERCHANT_SECRET=SecretKey
   ```

2. Ensure `local.properties` is in `.gitignore`.

3. **Enable `buildConfig` — this is a separate, mandatory step.**

   On AGP 8+ (including AGP 9) `android.buildFeatures.buildConfig` defaults to **false**.
   `BuildConfig.TTP_MERCHANT_ID` simply does not exist until it is switched on, and the compiler
   reports `unresolved reference: BuildConfig` — which reads like a missing import rather than a
   missing feature flag, and sends agents hunting in the wrong place.

   Check first, because many projects have a `buildFeatures` block that enables something else
   (commonly `compose = true`) and no `buildConfig` line at all:

   ```bash
   grep -nE 'buildFeatures|buildConfig' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
   ```

   Then ensure the flag is present, adding it to an existing `buildFeatures` block rather than
   creating a second one:

   ```kotlin
   android {
       buildFeatures {
           buildConfig = true    // MANDATORY — off by default on AGP 8+
       }
   }
   ```

4. Expose the values as `BuildConfig` fields by reading `local.properties` with
   `Properties().load(...)` in `$ANDROID_MODULE_DIR/build.gradle[.kts]` (do **NOT** use
   `project.findProperty()`).

   ```kotlin
   import java.util.Properties
   import java.io.FileInputStream

   val localProps = Properties().apply {
       val f = rootProject.file("local.properties")
       if (f.exists()) load(FileInputStream(f))
   }

   android {
       defaultConfig {
           buildConfigField("String", "TTP_MERCHANT_ID", "\"${localProps.getProperty("TTP_MERCHANT_ID", "MERCHANT_ID_HERE")}\"")
           buildConfigField("String", "TTP_MERCHANT_SECRET", "\"${localProps.getProperty("TTP_MERCHANT_SECRET", "MERCHANT_SECRET_HERE")}\"")
       }
       buildFeatures {
           buildConfig = true
       }
   }
   ```

   > There is no `buildConfigFeatures` property. `buildConfig` is enabled only via the
   > `android.buildFeatures { }` block — never from inside `defaultConfig`.

5. Add a **mandatory** production-credential reminder near where the values are consumed:

   ```kotlin
   // TODO(production): Do NOT ship TEST credentials. Replace this with secure
   // credential retrieval (backend service / vault). Never hardcode the secret key.
   ```

### Step 4: Placeholder / Deferred Credentials

If the developer does not yet have credentials, write placeholders (`MERCHANT_ID_HERE`,
`MERCHANT_SECRET_HERE`) so the build compiles, and clearly warn that enrollment (`act_TTP_03`)
and all transactions will fail until real TEST credentials are supplied.

#### Tell the developer what the placeholder path actually looks like at runtime

This matters because the failure is **silent from the application's point of view**, and the log it
produces looks alarming enough to send someone debugging the SDK.

Observed on real hardware with placeholder credentials:

- `MposUi.create()` **returns normally.** No exception, synchronous or otherwise.
- `isMposUiReady()` therefore returns `true` — the readiness guard reports the SDK as healthy while
  it is not. **`isMposUiReady()` is not a credential check**; it only means the object was built.
- About two seconds later, this appears in logcat:

```
E PayButtonFeature: Actor occurred an error for action:
  MerchantConfigurationReceived(merchantConfiguration=MerchantConfiguration(schemes=[], supportedButtons=[]))
E PayButtonFeature: java.lang.NullPointerException
  at io.mpos.paybutton.obfuscated.…
  at io.mpos.feature.BaseFeature.updateState(…)
```

An empty `MerchantConfiguration` (no schemes, no supported buttons) triggers an unhandled
`NullPointerException` **inside the SDK**, on the SDK's own coroutine dispatcher. It is non-fatal —
the app keeps running — and **no application-side `try`/`catch` can intercept it**, because it is
not raised on the caller's thread.

Say this to the developer explicitly:

> With placeholder credentials the app builds and launches, but you will see a
> `PayButtonFeature` `NullPointerException` in logcat a couple of seconds after start. That is the
> SDK reacting to an empty merchant configuration — it means "no credentials". It is expected on
> this path and is not a defect to debug. Enrollment cannot succeed and no transaction can
> complete until real TEST credentials are in place.

The signal worth observing instead of `isMposUiReady()` is
`TapToPhone.getMerchantInformation()` / `merchantInformationFlow()`: an empty `supportedCurrencies`
means the merchant configuration never loaded.

`getMerchantInformation()` is **`@Nullable`**, so read it as
`getMerchantInformation()?.supportedCurrencies.orEmpty()` — the non-null form does not compile. A
null result and an empty set are the same condition: not loaded. See
`references/ttp/constants/ttp-sdk-requirements.md` § *Three Readiness States* and
§ *`TapToPhone` nullability*.

## Troubleshooting

See `references/ttp/troubleshooting.md#tap-to-pay` for credential-related issues (invalid/expired
key, wrong key type generated, MID/secret mismatch producing enrollment or auth failures).

## Acceptance Criteria

This activity is complete when all of the following are true:

1. A MID + **Acceptance Devices Secret Key** pair was obtained via the Business Center **or** the `POST /kms/v2/keys-sym-pos` REST API (test endpoint for sandbox)
2. Credentials are stored in `local.properties` — **not** hardcoded in source
3. `local.properties` is listed in `.gitignore`
4. `android.buildFeatures { buildConfig = true }` is present — verified by grep, in the
   `buildFeatures` block and **not** inside `defaultConfig`. There is no `buildConfigFeatures`
   property; if one appears anywhere, it is a defect to remove.
5. `BuildConfig` fields (`TTP_MERCHANT_ID`, `TTP_MERCHANT_SECRET`) are defined, read via `Properties().load()` (not `project.findProperty()`)
6. A production-credential TODO reminder is present in the generated code
7. The secret key was never logged, echoed, or printed to the terminal
8. If credentials were deferred, placeholders are in place **and** the developer was told the
   specific runtime symptom — `PayButtonFeature` NPE from an empty `MerchantConfiguration` — so they
   do not spend time debugging it
9. The project still builds successfully (`$GRADLE_MODULE_PATH:assembleDebug`), and `BuildConfig.TTP_MERCHANT_ID` actually resolves — a build that never references it does not prove step 4

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 2 of the Tap to Pay on Android integration: merchant credentials (MID + Acceptance Devices Secret Key).

Working directory: <project root>

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context and TTP GATE 2 notes
2. `$SKILL_DIR/references/ttp/activities/act_TTP_02_obtain-credentials.md` — the activity definition (full implementation guidance)
3. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — SDK constants

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
ANDROID_MODULE_DIR=<ANDROID_MODULE_DIR>   (the com.android.application module — NOT necessarily "app")
SOURCE_ROOT=<SOURCE_ROOT>                 (may be src/main/kotlin, not src/main/java)

(ANDROID_MODULE_DIR and SOURCE_ROOT are relative to GRADLE_ROOT. cd "$GRADLE_ROOT"
before running any command. Build with:
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" > /tmp/ttp-build.log 2>&1
then check $? — never pipe the build.)

Credential method: <CREDENTIAL_METHOD>   (local_properties | interactive_input | placeholder)
                   ^ how the credentials REACH THE BUILD
Key source:        <KEY_SOURCE>          (already_have | business_center | rest_api | n/a)
                   ^ how the secret key was OBTAINED — a different axis. Do not conflate them.
- Merchant ID: <MERCHANT_ID>
- Merchant Secret: <MERCHANT_SECRET>

### Credential handling

**`CREDENTIAL_METHOD` — how the values reach the build:**

- `local_properties`: the developer writes `TTP_MERCHANT_ID` / `TTP_MERCHANT_SECRET` into
  `local.properties` themselves. Verify presence and non-placeholder status; **never read or print the
  values**. This is the preferred route — the secret never enters the terminal or shell history.
  On this path `<MERCHANT_ID>` / `<MERCHANT_SECRET>` are sentinels, not credentials: `already-configured`
  means Step 0 already confirmed real values are in the file, and `pending-manual-entry` means the
  developer has yet to add them. Both take the same action — verify, write nothing. **Never write a
  sentinel into `local.properties`**; if `already-configured` reached the file, working credentials
  were just destroyed.
- `interactive_input`: the values were pasted into the terminal and injected as `<MERCHANT_ID>` /
  `<MERCHANT_SECRET>`. Write them into `local.properties`, then never echo them again.
- `placeholder`: write `MERCHANT_ID_HERE` / `MERCHANT_SECRET_HERE` and warn per Step 4.

**`KEY_SOURCE` — how the key was obtained. Only act on this when it is not `already_have`:**


- `already_have`: the developer already has a key. **Do NOT generate a new one** — on some accounts that
  invalidates the existing key and breaks other integrations using it. Store and verify only.
- `business_center`: The developer generates the key in the Business Center UI (Payment
  Configuration ▸ Key Management ▸ Acceptance Devices Secret Key) and provides the MID + secret.
  Guide them through the steps, then store the values.
- `rest_api`: Generate the key via `POST https://apitest.visaacceptance.com/kms/v2/keys-sym-pos`
  with `keyInformation.organizationId = <transacting MID>`. Extract `externalOrganizationId`
  (MID) and `key` (secret) from the response. Treat the response as sensitive.
- `n/a`: `CREDENTIAL_METHOD = placeholder`; there is no key to obtain yet. Write
  `MERCHANT_ID_HERE` / `MERCHANT_SECRET_HERE` and warn that enrollment and
  transactions will fail until real TEST credentials are supplied. Do NOT prompt for real values.

## Your task

Implement TTP GATE 2 using the activity file as your primary guide.

Critical constraints:
1. NEVER hardcode the MID/secret in source. Store TEST values in `local.properties`, expose via
   `BuildConfig` using `Properties().load()` — NEVER `project.findProperty()`.
2. Ensure `local.properties` is in `.gitignore`.
3. NEVER log, echo, or print the secret key. Do not read back `local.properties` contents.
4. Include a production-credential TODO reminder in generated code.
5. TEST/sandbox only (`apitest.visaacceptance.com`, `ProviderMode.TEST`). Never use production.
6. Set `android.buildFeatures { buildConfig = true }`. It is OFF by default on AGP 8+, so
   `BuildConfig.TTP_MERCHANT_ID` will not exist without it. Add it to any existing `buildFeatures`
   block rather than creating a second one. There is no `buildConfigFeatures` property — do not
   write one.
7. Write to `$ANDROID_MODULE_DIR/build.gradle[.kts]`, not `app/build.gradle`.
8. If CREDENTIAL_METHOD = placeholder, tell the developer the specific runtime symptom (an SDK-side
   `PayButtonFeature` NullPointerException from an empty `MerchantConfiguration`) so they do not
   debug it as a fault. See the activity's Step 4.

## Mandatory verification

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
# buildConfig must be enabled in buildFeatures — not in defaultConfig, and not misspelled
grep -nE 'buildConfig *= *true' "$ANDROID_MODULE_DIR"/build.gradle* \
  && echo "OK" || echo "FAIL: buildConfig not enabled — BuildConfig.TTP_MERCHANT_ID will not exist"

# there is no such property; if it is present, remove it
grep -n 'buildConfigFeatures' "$ANDROID_MODULE_DIR"/build.gradle* \
  && echo "FAIL: buildConfigFeatures is not a real property — remove it" || echo "OK"

# credentials must not be hardcoded in sources (presence check only — never print values)
grep -rln 'TTP_MERCHANT_SECRET *= *"' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: secret hardcoded in source" || echo "OK"
```

Do NOT report PASS unless the build succeeds and credentials are stored per the rules above.

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
TTP GATE 2 REPORT
Status: PASS | FAIL
Credential method (supply):  local_properties | interactive_input | placeholder
Key source (obtained via):   already_have | business_center | rest_api | n/a
Credentials stored in local.properties: YES | NO
local.properties in .gitignore: YES | NO
buildConfig = true present in buildFeatures: YES | NO (was it already enabled, or added?)
buildConfigFeatures pseudo-property found: NO (must be NO) | REMOVED
BuildConfig fields defined: YES | NO
Placeholder runtime symptom explained to developer: YES | N/A (real credentials)
Secret key exposed in any output: NO (must be NO)
Build: SUCCESS | FAILED
Files modified: <list>
Acceptance criteria met: <list>
```
```
