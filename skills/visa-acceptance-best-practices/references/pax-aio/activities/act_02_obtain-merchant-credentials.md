# Activity 1: Obtain and Configure Merchant Credentials

Configure merchant credentials and initialize the `MposUi` instance so the application is ready to process payments on PAX terminals.

**Reference:** [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (MposUi creation, secret key generation)

## Critical Rules (NEVER violate these)

1. **NEVER hardcode credentials in source code.** Always use `BuildConfig` fields sourced from `local.properties` for TEST credentials.
2. **NEVER commit `local.properties` to version control.** Ensure it's in `.gitignore`.
3. **NEVER allow payment calls before mposUi initialization.** Always verify the instance is initialized using a guard pattern (`::mposUi.isInitialized` in Kotlin, null check in Java) before any payment operation.
4. **This activity configures TEST/development environment only.** For production, developers must implement their own secure credential management (backend API, vault, etc.).
5. **ALWAYS include TODO comments in the Application class.** The TODO comment reminding developers to implement secure credential management for production is MANDATORY and must be included in all generated code. Never omit or skip these security reminder comments.
6. **NEVER use `AccessoryFamily.MOCK`.** Mock mode connects to a simulated reader with serial `999999999` which is not registered in the merchant's account — every transaction fails with `ACCESSORY_NOT_WHITELISTED` (HTTP 404). Always use `AccessoryFamily.PAX` with `.integrated()`. After writing the Application class, grep for `MOCK` and fail the phase if found.
7. **EVERY `UiConfiguration.Builder()` MUST include `.terminalParameters()`** — This is CRITICAL. If you create or modify ANY `UiConfiguration` anywhere in the codebase (not just in PaymentApplication.onCreate), it MUST include `.terminalParameters(terminalParameters)`. Without this, the SDK silently resets to MOCK mode when the configuration is applied, causing "terminal not whitelisted" errors on every transaction. This applies to:
   - Initial configuration in `PaymentApplication.onCreate()`
   - Any subsequent configuration updates (e.g., when adding summary features in later gates)
   - Any dynamic configuration changes at runtime

## Prerequisites

Before starting this activity, the developer must have completed Activity 2 (SDK Setup):

- **PAX SDK dependencies configured** — see [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md)
- **AndroidManifest.xml configured** — see [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md)

## Workflow

Follow these steps in order.

### Step 1: Gather TEST Merchant Credentials

The workflow (Step 0, Q3) determines how credentials are provided via `CREDENTIAL_METHOD`:

#### If `CREDENTIAL_METHOD = "manual"` (user edits `local.properties` directly)

The user chose to write credentials directly into `local.properties` for security (values never
appear in the terminal). Do NOT attempt to read or validate the contents of `local.properties` —
the user manages this file themselves.

Use `AskUserQuestion` to confirm the user is ready before proceeding:
```
Have you added your CyberSource TEST Merchant ID and Secret Key to local.properties?

- Yes, I've updated the file
- Not yet (I'll do it now — pause and wait for me)
```

Only proceed to Step 2 once the user confirms.

#### If `CREDENTIAL_METHOD = "terminal"` (user entered via terminal)

Credentials were already collected in Step 0 and passed as `<MERCHANT_ID>` and `<MERCHANT_SECRET>`.
Proceed directly to Step 2 to write them into `local.properties`.

#### If `CREDENTIAL_METHOD = "placeholder"` (deferred)

Use placeholder values:
- Merchant ID: `MERCHANT_ID_HERE`
- Secret Key: `MERCHANT_SECRET_HERE`

Proceed to Step 2 to write placeholders into `local.properties`.

**Production Credentials:**
For production deployments, developers should implement their own secure credential management strategy (backend API, secure vault, encrypted storage, etc.). This activity focuses on TEST/development configuration only.

### Step 2: Configure TEST Credentials in local.properties

**If `CREDENTIAL_METHOD = "manual"`:** Skip writing credentials — the user has already added them.
Only perform the `.gitignore` verification below (Important Setup Steps #2–#4).

**If `CREDENTIAL_METHOD = "terminal"` or `"placeholder"`:** Write credentials to the project's `local.properties` file:

```properties
# TEST/Sandbox credentials (for local development)
test.merchant.id=<value from user or placeholder>
test.merchant.secret=<value from user or placeholder>
```

**Important Setup Steps** (all methods):
1. Create `local.properties` in the project root if it doesn't exist (skip for `manual` — file must already exist)
2. Verify `local.properties` is in `.gitignore`:
```bash
grep -q "local.properties" .gitignore && echo "OK" || echo "WARNING: local.properties not in .gitignore - add it now!"
```
3. If `.gitignore` doesn't contain `local.properties`, add it immediately:
```bash
echo "local.properties" >> .gitignore
```
4. **Never commit** `local.properties` to version control
5. **Recommend `.claude/settings.json` deny rules** — Suggest the developer create or update
   `.claude/settings.json` in the project root to prevent Claude Code from reading sensitive
   files:
```json
{
  "permissions": {
    "deny": [
      "Read(local.properties)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/secrets/**)"
    ]
  }
}
```
Display this recommendation to the developer and offer to create the file. If
`.claude/settings.json` already exists, merge the deny rules into the existing
`permissions.deny` array without overwriting other settings.
5. **Recommend `.claude/settings.json` deny rules** — Create or update `.claude/settings.json`
   in the project root to prevent Claude Code from reading sensitive files:
```json
{
  "permissions": {
    "deny": [
      "Read(local.properties)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/secrets/**)"
    ]
  }
}
```
This ensures credentials in `local.properties` are never read by Claude Code even if
explicitly asked. Display this recommendation to the developer and offer to create the file.
If `.claude/settings.json` already exists, merge the deny rules into the existing
`permissions.deny` array without overwriting other settings.

### Step 2a: Pre-flight Check — Remove `project.findProperty()` (MANDATORY) <!-- REC-06 -->

Before writing any BuildConfig fields, check whether the project already uses `project.findProperty()`
for credentials:

```bash
grep -rn "project.findProperty\|findProperty" app/build.gradle app/build.gradle.kts 2>/dev/null
```

If **any match is found**, replace it as part of this gate — this is NOT optional. `project.findProperty()`
silently resolves to `""` at runtime (it reads Gradle project properties, NOT `local.properties`),
resulting in `BuildConfig.MERCHANT_ID = ""` and a double-slash backend URL
(`/v2/merchants//transactionSessions`) that returns HTTP 400 on every payment.

**Replacement — Groovy DSL (`build.gradle`):**
```groovy
// BEFORE (broken — silently produces empty string):
// buildConfigField "String", "MERCHANT_ID", "\"${project.findProperty('test.merchant.id')}\""

// AFTER (correct — reads local.properties explicitly):
def localProps = new Properties()
def localPropsFile = rootProject.file('local.properties')
if (localPropsFile.exists()) {
    localProps.load(localPropsFile.newInputStream())
}
// ... then inside android { buildTypes { debug { ... } } }:
buildConfigField "String", "MERCHANT_ID", "\"${localProps.getProperty('test.merchant.id', '')}\""
buildConfigField "String", "MERCHANT_SECRET", "\"${localProps.getProperty('test.merchant.secret', '')}\""
```

**Replacement — Kotlin DSL (`build.gradle.kts`):**
```kotlin
// BEFORE (broken — silently produces empty string):
// buildConfigField("String", "MERCHANT_ID", "\"${project.findProperty("test.merchant.id")}\"")

// AFTER (correct — reads local.properties explicitly):
val localProps = java.util.Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) {
    localProps.load(localPropsFile.inputStream())
}
// ... then inside android { buildTypes { debug { ... } } }:
buildConfigField("String", "MERCHANT_ID",
    "\"${localProps.getProperty("test.merchant.id", "")}\"")
buildConfigField("String", "MERCHANT_SECRET",
    "\"${localProps.getProperty("test.merchant.secret", "")}\"")
```

After replacing, run:
```bash
grep -rn "project.findProperty\|findProperty" app/build.gradle app/build.gradle.kts 2>/dev/null \
  && echo "FAIL: findProperty still present" || echo "OK"
```
If `findProperty` still appears, fix it before continuing.

> **Note:** This check is done during integration (Gate 2) — do NOT modify the baseline app
> repository directly. The fix is applied only as part of this skill's integration pass.

### Step 3: Add BuildConfig Fields in build.gradle

Add `buildConfigField` entries to the app module's build file so TEST credentials are available at compile time.

**CRITICAL:** `project.findProperty()` does NOT read `local.properties` and will produce an empty `BuildConfig.MERCHANT_ID` at runtime, causing HTTP 400/500 errors. Always load `local.properties` explicitly. If Step 2b found and replaced `findProperty`, the fields below replace that block.

**Kotlin DSL (`build.gradle.kts`):**
```kotlin
val localProps = java.util.Properties()
val localPropsFile = rootProject.file("local.properties")
if (localPropsFile.exists()) {
    localProps.load(localPropsFile.inputStream())
}

android {
    buildTypes {
        debug {
            buildConfigField("String", "MERCHANT_ID",
                "\"${localProps.getProperty("test.merchant.id", "")}\"")
            buildConfigField("String", "MERCHANT_SECRET",
                "\"${localProps.getProperty("test.merchant.secret", "")}\"")
        }
    }
}
```

**Groovy DSL (`build.gradle`):**
```groovy
def localProps = new Properties()
def localPropsFile = rootProject.file('local.properties')
if (localPropsFile.exists()) {
    localProps.load(localPropsFile.newInputStream())
}

android {
    buildTypes {
        debug {
            buildConfigField "String", "MERCHANT_ID", "\"${localProps.getProperty('test.merchant.id', '')}\""
            buildConfigField "String", "MERCHANT_SECRET", "\"${localProps.getProperty('test.merchant.secret', '')}\""
        }
    }
}
```

**Note**: For production builds, implement your own secure credential management strategy. This configuration is for development/testing only.

### Step 4: Create mposUi in Application Class

Create or update the Application class to create the `MposUi` instance with terminal parameters.

**IMPORTANT:** You MUST include the TODO comments in the code. These comments are security reminders that BuildConfig is for TEST/development only and that production requires secure credential management. Never omit these comments.

<!-- REC-04 REC-05 -->
**Kotlin:**
```kotlin
import io.mpos.accessories.parameters.AccessoryParameters
import io.mpos.accessories.AccessoryFamily
import io.mpos.provider.ProviderMode
import io.mpos.paybutton.MposUi
import io.mpos.paybutton.UiConfiguration

class PaymentApplication : Application() {

    companion object {
        lateinit var mposUi: MposUi
            private set

        fun isMposUiReady(): Boolean = ::mposUi.isInitialized
    }

    override fun onCreate() {
        super.onCreate()

        // TODO: Implement your credential retrieval strategy
        // Options: Backend API, secure vault, encrypted storage, BuildConfig (dev only), etc.
        // For TEST/development, BuildConfig is used here as an example:
        val merchantId = BuildConfig.MERCHANT_ID
        val merchantSecret = BuildConfig.MERCHANT_SECRET

        // Step 1: Configure terminal parameters for integrated PAX device
        val terminalParameters = AccessoryParameters.Builder(AccessoryFamily.PAX)
            .integrated()
            .build()

        // Step 2: Build UiConfiguration with terminal parameters (SDK 2.106+: NOT a create() arg)
        // CRITICAL: .terminalParameters() is MANDATORY in EVERY UiConfiguration.Builder()
        // Without it, SDK silently reverts to MOCK mode → ACCESSORY_NOT_WHITELISTED on every transaction
        val uiConfiguration = UiConfiguration.Builder()
            .terminalParameters(terminalParameters)  // ← REQUIRED in ALL UiConfiguration instances
            .build()

        // Step 3: Create mposUi with 3-arg form (SDK 2.106+)
        mposUi = MposUi.create(
            providerMode = ProviderMode.TEST,
            merchantId = merchantId,
            merchantSecret = merchantSecret
        )

        // Step 4: Apply UiConfiguration — sets terminal parameters and other settings
        mposUi.configuration = uiConfiguration
    }
}
```

**Java:**
```java
import io.mpos.accessories.parameters.AccessoryParameters;
import io.mpos.accessories.AccessoryFamily;
import io.mpos.provider.ProviderMode;
import io.mpos.paybutton.MposUi;
import io.mpos.paybutton.UiConfiguration;

public class PaymentApplication extends Application {

    private static MposUi mposUi;

    public static MposUi getMposUi() { return mposUi; }
    public static boolean isMposUiReady() { return mposUi != null; }

    @Override
    public void onCreate() {
        super.onCreate();

        // TODO: Implement your credential retrieval strategy
        // Options: Backend API, secure vault, encrypted storage, BuildConfig (dev only), etc.
        // For TEST/development, BuildConfig is used here as an example:
        String merchantId = BuildConfig.MERCHANT_ID;
        String merchantSecret = BuildConfig.MERCHANT_SECRET;

        // Step 1: Configure terminal parameters for integrated PAX device
        AccessoryParameters terminalParameters = new AccessoryParameters.Builder(AccessoryFamily.PAX)
                .integrated()
                .build();

        // Step 2: Build UiConfiguration with terminal parameters (SDK 2.106+: NOT a create() arg)
        // CRITICAL: .terminalParameters() is MANDATORY in EVERY UiConfiguration.Builder()
        // Without it, SDK silently reverts to MOCK mode → ACCESSORY_NOT_WHITELISTED on every transaction
        UiConfiguration uiConfiguration = new UiConfiguration.Builder()
                .terminalParameters(terminalParameters)  // ← REQUIRED in ALL UiConfiguration instances
                .build();

        // Step 3: Create mposUi with 3-arg form (SDK 2.106+)
        mposUi = MposUi.create(
                ProviderMode.TEST,
                merchantId,
                merchantSecret
        );

        // Step 4: Apply UiConfiguration — sets terminal parameters and other settings
        mposUi.setConfiguration(uiConfiguration);
    }
}
```

### Step 5: Register Application Class in AndroidManifest.xml

Ensure the `<application>` tag in `AndroidManifest.xml` references the Application class:

```xml
<application
    android:name=".PaymentApplication"
    android:allowBackup="false"
    android:largeHeap="true">
    <!-- your activities here -->
</application>
```

### Step 6: Add Guard Patterns Before Using MposUi

Before using the `mposUi` instance anywhere in the application, verify it is initialized:

**Kotlin:**
```kotlin
fun someFunction() {
    require(PaymentApplication.isMposUiReady()) {
        "mposUi must be initialized before use. " +
        "Ensure PaymentApplication.onCreate() has completed."
    }
    val ui = PaymentApplication.mposUi
    // ... use ui for SDK operations
}
```

**Java:**
```java
void someFunction() {
    if (!PaymentApplication.isMposUiReady()) {
        throw new IllegalStateException(
            "mposUi must be initialized before use."
        );
    }
    MposUi ui = PaymentApplication.getMposUi();
    // ... use ui for SDK operations
}
```

### Step 7: Build and Verify

```bash
./gradlew clean build
```

If the build fails, verify import statements use correct package paths:
- `io.mpos.paybutton.MposUi` (not `io.mpos.ui.shared.MposUi`)
- `io.mpos.provider.ProviderMode`
- `io.mpos.accessories.parameters.AccessoryParameters`
- `io.mpos.accessories.AccessoryFamily`

## Troubleshooting

See `references/pax-aio/troubleshooting.md#merchant-credentials` for credential and initialization errors, including the critical `ACCESSORY_NOT_WHITELISTED` issue caused by missing `.terminalParameters()` in `UiConfiguration`.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. `project.findProperty()` is NOT present in `app/build.gradle` or `app/build.gradle.kts` — pre-flight check (Step 2b) was run and any matches replaced <!-- REC-06 -->
2. TEST merchant credentials are stored in `local.properties` (not hardcoded in source)
3. `BuildConfig` fields are defined for debug build type, reading from `local.properties` via `Properties().load()`
4. `MposUi.create()` is called in `Application.onCreate()` with:
   - `providerMode = ProviderMode.TEST` for debug builds
   - `merchantId` and `merchantSecret` from `BuildConfig`
   - `UiConfiguration` applied via `mposUi.configuration = uiConfig` (Kotlin) or `mposUi.setConfiguration(uiConfig)` (Java), with `terminalParameters(AccessoryParameters.Builder(AccessoryFamily.PAX).integrated().build())`
5. **TODO comments are present in Application class** reminding developers to implement secure credential management for production (Critical Rule #5)
6. Application class is registered in `AndroidManifest.xml`
7. Guard pattern exists to verify initialization before payment calls
8. `local.properties` is in `.gitignore`
9. All imports use correct package paths
10. Project builds successfully without compilation errors (`./gradlew clean build`)
11. Placeholder credential check was executed (Step 2a) and warning displayed to the developer if `MERCHANT_ID_HERE` or `MERCHANT_SECRET_HERE` is present in `local.properties`

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 2 of the PAX SDK integration: merchant credentials and MposUi initialisation.

Working directory: <project root>

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — contains project context and GATE 2 implementation notes
2. `references/pax-aio/activities/act_02_obtain-merchant-credentials.md` — the activity definition (full implementation guidance)

Credential method: <CREDENTIAL_METHOD>
- Merchant ID: <MERCHANT_ID>
- Merchant Secret: <MERCHANT_SECRET>

### Credential handling by method:

- If `CREDENTIAL_METHOD = "manual"`: The developer manages `local.properties` directly.
  Do NOT read or write credentials yourself. Ask the developer to confirm they have added
  their credentials, then proceed.

- If `CREDENTIAL_METHOD = "terminal"`: Credentials were entered in Step 0 and are provided
  above. Write them to `local.properties` in Step 2.

- If `CREDENTIAL_METHOD = "placeholder"`: Write placeholder values as-is to `local.properties`
  — do NOT prompt the developer for credentials.

## Your task

Implement GATE 2 using the activity file as your primary implementation guide.
Use `project-plan.md` for project-specific metadata (package, language, file paths, Application class status).
Follow Step 1 of the activity file based on the `CREDENTIAL_METHOD` above.

Critical constraints:
1. Use `Properties().load()` to read `local.properties` — NEVER use `project.findProperty()`. See `references/pax-aio/troubleshooting.md#sdk-build`.
2. **EVERY `UiConfiguration.Builder()` MUST include `.terminalParameters()`** — even if terminal parameters were passed to `MposUi.create()`. Without this, the SDK silently resets to MOCK mode when the configuration is applied, causing "terminal not whitelisted" errors.

<!-- REC-07 -->
After creating `PaymentApplication`, grep for `AccessoryFamily.MOCK`:
```bash
grep -rn "AccessoryFamily.MOCK\|ProviderMode.MOCK" app/src --include="*.kt" --include="*.java"
```
If MOCK appears anywhere, fix it — use `AccessoryFamily.PAX` with `.integrated()`.

**Verify terminalParameters is configured** (CRITICAL — prevents ACCESSORY_NOT_WHITELISTED):
```bash
# Find the PaymentApplication file (matches class that extends Application)
PAYMENT_APP_FILE=$(grep -rl "class.*Application.*Application()" app/src --include="*.kt" --include="*.java" | head -1)

if [ -z "$PAYMENT_APP_FILE" ]; then
  echo "ERROR: Could not locate PaymentApplication file"
  exit 1
fi

# Extract the UiConfiguration.Builder() block and check if it includes terminalParameters
EXTRACTED_CONFIG=$(sed -n '/UiConfiguration\.Builder()/,/\.build()/p' "$PAYMENT_APP_FILE")

if [ -z "$EXTRACTED_CONFIG" ]; then
  echo "FAIL: UiConfiguration.Builder() not found in $PAYMENT_APP_FILE"
  exit 1
fi

if ! echo "$EXTRACTED_CONFIG" | grep -q "\.terminalParameters("; then
  echo "FAIL: .terminalParameters() missing in UiConfiguration.Builder()"
  echo "File: $PAYMENT_APP_FILE"
  echo "Impact: SDK silently reverts to MOCK mode — ACCESSORY_NOT_WHITELISTED"
  exit 1
fi

echo "OK: terminalParameters configured in UiConfiguration.Builder() in $PAYMENT_APP_FILE"
```

**Verify Kotlin property syntax** (CRITICAL — prevents `unresolved reference: setConfiguration`):

If the project's language is Kotlin, the `PaymentApplication.kt` MUST use the property
assignment form (`mposUi.configuration = uiConfiguration`), NOT the Java-style setter
(`mposUi.setConfiguration(uiConfiguration)`). The setter does not exist on `MposUi` from
Kotlin and will fail to compile.

```bash
PAYMENT_APP_KT=$(grep -rl "class.*Application.*Application()" app/src --include="*.kt" | head -1)

if [ -n "$PAYMENT_APP_KT" ]; then
  if grep -q "mposUi\.setConfiguration(" "$PAYMENT_APP_KT"; then
    echo "FAIL: mposUi.setConfiguration(...) found in Kotlin file $PAYMENT_APP_KT"
    echo "Impact: Kotlin source cannot call setConfiguration() on MposUi."
    echo "        Build will fail with 'Unresolved reference: setConfiguration'."
    echo "Fix:    Replace  mposUi.setConfiguration(uiConfiguration)"
    echo "        With     mposUi.configuration = uiConfiguration"
    echo "Reference: references/pax-aio/troubleshooting.md#sdk-build"
    exit 1
  fi
  echo "OK: Kotlin property syntax (mposUi.configuration = ...) used correctly in $PAYMENT_APP_KT"
fi
```

## Mandatory verification

**1. Build the project:**
Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

## Required report

```
GATE 2 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED
Build time: Xs
MposUi.create() used (not initialize()): YES | NO
AccessoryFamily.PAX + .integrated(): YES | NO
MOCK present in source: YES (FAIL) | NO (OK)
terminalParameters() in UiConfiguration: YES | NO
Kotlin property syntax (no setConfiguration in .kt): YES | NO | N/A (Java project)
TODO comments in Application class: YES | NO
Files modified: <list>
Acceptance criteria met: <list>
```
```
