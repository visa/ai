# Activity 2: Set Up SDK Dependencies

Configure Gradle files and the Android project so the CyberSource PAX All-in-One SDK is available in the build.

**Reference:** [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Gradle, Manifest, ProGuard), `references/pax-aio/troubleshooting.md#network-access`, `references/pax-aio/troubleshooting.md#sdk-build`

## Critical Rules (NEVER violate these)

1. **NEVER comment out, remove, or disable PAX SDK dependencies** as a workaround for build/resolution failures. The dependencies (`io.payworks:paybutton-android` and `io.payworks:mpos.android.accessories.pax`) must remain in the build file. If they cannot be resolved, fix the root cause (network, proxy, or repository configuration) — do NOT work around it.
2. **NEVER revert `settings.gradle` changes** back to a previous state (e.g., restoring old Artifactory URLs, removing the Visa Maven repository, or switching back to a different repository configuration). The `exclusiveContent` block pointing to `https://repo.visa.com/mpos-releases/` is the correct configuration per the [official CyberSource documentation](https://developer.cybersource.com/docs/cybs/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.html). If dependency resolution fails, the problem is network/proxy access — not the repository URL.
3. **NEVER skip the network verification prerequisite.** If `repo.visa.com` is not reachable, stop and fix connectivity before making any Gradle changes.

## Prerequisites

Before starting, confirm the developer has:

1. **Android Studio** installed
2. **JDK 17** installed and configured (verify with `java -version`)
3. **Network access** verified — the workflow's **Step 1c (Connectivity Pre-Check)** must
   have passed before this activity runs. Step 1c confirms that the Gradle wrapper, Google
   Maven, `repo.visa.com`, and SSL certificates all work. If a build fails with network
   errors during this activity, re-run the Step 1c checks and apply the appropriate
   remediation from `references/pax-aio/troubleshooting.md#network-access`.
4. An existing Android project, or willingness to create a new one

## Workflow

Follow these steps in order. After each step, verify the change is correct before moving to the next.

### Step 0: Determine the SDK Version (MANDATORY)

The Visa repository keeps **only the six most recent SDK versions**. Older versions are removed and will cause build failures.

**If `SELECTED_SDK_VERSION` was provided by the workflow** (from Step 1c Connectivity
Pre-Check), use it directly and skip the `curl` query below — the version has already
been discovered and selected by the developer (either as the latest or a specific choice).

**Otherwise**, query the repository to find available versions:

```bash
# List available versions (use whichever repo URL was confirmed reachable in Prerequisites)
curl -sS https://repo.visa.com/mpos-releases/io/payworks/paybutton-android/ | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -V | tail -6
```

Use the **`SELECTED_SDK_VERSION`** for all dependency declarations in the steps that follow.
If no version was pre-selected, use the **highest listed version**. Do NOT hardcode a
version without checking — previously available versions (e.g., 2.105.0) may already have
been removed.

### Step 1: Configure settings.gradle

Open the project's `settings.gradle` (or `settings.gradle.kts`) file and ensure the Visa Maven repository is declared inside `dependencyResolutionManagement`.

Fetch the code from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Configure the Project settings.gradle File" section. Apply the `exclusiveContent` block exactly as shown there.

**Important details (NOT in the official docs — integration intelligence):**
- If the project already has a `dependencyResolutionManagement` block, add only the `exclusiveContent` block inside the existing `repositories` block.
- **The ONLY group filter needed is `io.payworks`.** Do NOT add `io.mpos` — that group does not exist. Both `paybutton-android` and `mpos.android.accessories.pax` are published under `io.payworks`.
- The repository URL must be exactly `https://repo.visa.com/mpos-releases/` (with trailing slash).

### Step 2: Configure Project build.gradle

Open the root `build.gradle` (or `build.gradle.kts`). Check the version requirements in
`references/pax-aio/constants/pax-sdk-requirements.md` and the `required_upgrades` section of `project-plan.md`.

**Version rules (CRITICAL — never downgrade, never change without approval):**
- If the project's AGP version is **already >= the minimum**, keep it as-is.
- If the project's Kotlin version is **already >= the minimum**, keep it as-is.
- Only upgrade a version if it appears in `required_upgrades` in `project-plan.md`
  **AND** has been explicitly approved by the developer in Step 1b.
- Use the `target` value from `required_upgrades` (not the `minimum`) — the planning
  agent has already resolved the correct target accounting for compileSdk.
- **If a build error during this step suggests a version change that was NOT pre-approved,
  do NOT apply it.** Report it back to the workflow for developer approval first.

```gradle
// Example — only if required_upgrades lists AGP and Kotlin:
plugins {
    id("com.android.application") version "<target from required_upgrades>" apply false
    id("org.jetbrains.kotlin.android") version "<target from required_upgrades>" apply false
}
```

**Important details:**
- Both plugins must use `apply false` at the project level.
- If neither AGP nor Kotlin appears in `required_upgrades`, do NOT modify the plugins block.
- The planning agent determines the correct AGP target: minimum (`MIN_AGP_VERSION`) for
  most projects, or `RECOMMENDED_AGP_VERSION` if `compileSdk >= 36`.

### Step 3: Configure Module build.gradle

Open the app module's `build.gradle` (or `build.gradle.kts`). This step has four parts.

#### 3a. Add Packaging Exclusions

Fetch the packaging exclusions from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Configure the Module build.gradle File" step 1. Apply the `packaging { resources { excludes } }` block.

#### 3b. Set Java and minSdk Compatibility

Check `project-plan.md` for `required_upgrades`. Only modify versions that appear there.
**Never downgrade** — if the project already uses Java 21 or minSdk 28, keep those values.

```gradle
android {
    defaultConfig {
        // Only change minSdk if it appears in required_upgrades.
        // If current minSdk >= MIN_SDK_VERSION (see references/pax-aio/constants/pax-sdk-requirements.md),
        // leave it unchanged.
        minSdk = <target from required_upgrades, or keep existing>
    }
    compileOptions {
        // Only change if Java appears in required_upgrades.
        // If current Java >= REQUIRED_JAVA_VERSION, leave unchanged.
        sourceCompatibility = JavaVersion.VERSION_<target or existing>
        targetCompatibility = JavaVersion.VERSION_<target or existing>
    }
    kotlinOptions {
        jvmTarget = "<target or existing>"
    }
}
```

#### 3c. Add Build Type Matching Fallbacks

Fetch the `matchingFallbacks` configuration from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Configure the Module build.gradle File" step 3. The debug build type must fall back to `release` because the PAX SDK publishes only a release build type.

**Groovy DSL equivalent** (if project uses `.gradle` not `.gradle.kts`):
```groovy
matchingFallbacks = ['release']
```

#### 3d. Add SDK Dependencies

Fetch the dependency declarations from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Configure the Module build.gradle File" step 4. Replace the version shown in the docs with `SELECTED_SDK_VERSION` from Step 0. Both libraries must use the same version.

The correct Maven coordinates (replace version with `SELECTED_SDK_VERSION`):
```gradle
implementation("io.payworks:paybutton-android:2.112.0")
implementation("io.payworks:mpos.android.accessories.pax:2.112.0")
```

> **WARNING — Correct coordinates (do NOT hallucinate alternatives):**
> - Group: `io.payworks` (the ONLY group — there is no `io.mpos` group)
> - Artifacts: `paybutton-android` and `mpos.android.accessories.pax`
> - The `mpos` in the artifact name is NOT a group prefix. Never split it into `io.mpos.android.accessories.pax:pax-accessories`.

### Step 4: Update AndroidManifest.xml — Remove `package=` Attribute

AGP 8.6.0 turns the `package=` attribute in the source `AndroidManifest.xml` into a **hard error**. If present, remove it:

**Before:**
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.myapp">
    <!-- ... -->
</manifest>
```

**After:**
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- ... -->
</manifest>
```

Verify that the module's `build.gradle` has the `namespace` property:
```gradle
android {
    namespace = "com.example.myapp"
}
```

### Step 5: Update AndroidManifest.xml — Set Application Attributes and Permissions

Fetch the manifest configuration from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Update the AndroidManifest.xml File" section. Apply both:
1. Application attributes (`android:allowBackup="false"`, `android:largeHeap="true"`)
2. All required permissions (Default UI permissions + PAX permissions)

### Step 6: Configure ProGuard Rules (Optional)

This step is **optional** and depends on whether the integrating application uses code obfuscation.

**You MUST ask the developer** whether they want to enable ProGuard/R8 obfuscation before proceeding.

- **If yes**: Enable `isMinifyEnabled = true` in the release build type and add all ProGuard rules from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section) to `proguard-rules.pro`.
- **If no**: Skip this step entirely.

### Step 7: Verify the Build

Use `--parallel` and `--build-cache` to reduce first-build time:

```bash
./gradlew assembleDebug --parallel --build-cache
```

If obfuscation is enabled, also verify the release build:

```bash
./gradlew assembleRelease --parallel --build-cache
```

## Troubleshooting

If the build fails, refer to `references/pax-aio/troubleshooting.md#sdk-build` for detailed diagnosis and fixes.

**Reminder:** NEVER comment out PAX dependencies or revert `settings.gradle` as a workaround. Always fix the root cause.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. SDK version was queried from the repository (Step 0) — not hardcoded blindly
2. `settings.gradle` includes the Visa Maven repository (`https://repo.visa.com/mpos-releases/`) with `exclusiveContent` filtering for `io.payworks`
3. Project `build.gradle` declares Kotlin and AGP at or above the minimums in `references/pax-aio/constants/pax-sdk-requirements.md`
4. **No version downgrades** — project versions that already meet or exceed minimums are unchanged
5. Only versions listed in `required_upgrades` (from `project-plan.md`) **and explicitly approved by the developer** were modified
6. **No unapproved version changes** — any version change discovered during build-error resolution was surfaced to the developer for approval before being applied
7. Module `build.gradle` includes:
   - `minSdk` >= `MIN_SDK_VERSION` (see `references/pax-aio/constants/pax-sdk-requirements.md`)
   - Packaging exclusions for `META-INF/*`, `LICENSE.txt`, and `asm-license.txt`
   - Java >= `REQUIRED_JAVA_VERSION` compatibility (`sourceCompatibility`, `targetCompatibility`, `jvmTarget`)
   - `matchingFallbacks` in the `debug` build type pointing to `release`
   - SDK dependencies: `io.payworks:paybutton-android` and `io.payworks:mpos.android.accessories.pax` at the latest available version
8. `AndroidManifest.xml`:
   - No `package=` attribute on the `<manifest>` tag
   - `android:allowBackup="false"` and `android:largeHeap="true"` on the `<application>` tag
   - All required permissions present
9. ProGuard rules configured only if developer opted in (Q4)
10. The project builds without errors (`./gradlew assembleDebug` succeeds)

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 1 of the PAX SDK integration: SDK Gradle dependencies setup.

Working directory: <project root>

## Pre-resolved SDK version (from Step 1c Connectivity Pre-Check)

SELECTED_SDK_VERSION=<SELECTED_SDK_VERSION>

If SELECTED_SDK_VERSION is set to a valid version (e.g., `2.105.0`), use it directly for
all dependency declarations. Skip the `curl` query in Activity Step 0 — the version was
already discovered and selected (either automatically as latest, or chosen by the
developer) during the connectivity pre-check.

If SELECTED_SDK_VERSION is `N/A` or empty, fall back to Activity Step 0 and query the
repository manually.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (in the project root) — contains project context, `required_upgrades`, and GATE 1 implementation notes
2. `references/pax-aio/activities/act_01_setup-sdk-dependencies.md` — the activity definition (full implementation guidance)
3. `references/pax-aio/constants/pax-sdk-requirements.md` — version minimums and SDK constants

## Your task

Implement GATE 1 using the activity file as your primary implementation guide.
Use `project-plan.md` for project-specific metadata (DSL, file paths, `required_upgrades`, known issues).
Follow the activity file for sequencing, acceptance criteria, and SDK configuration patterns.

**Version change rule:** If a build error during this gate suggests changing a version
(Gradle wrapper, AGP, Kotlin, Java, minSdk, or any other component) that was NOT
already approved in `required_upgrades` of `project-plan.md`, do NOT apply the change
automatically. Instead, report the issue back to the workflow with the proposed
version change. The workflow will ask the developer for approval before proceeding.

If `proguard_enabled = true` in the project context:
- Set `isMinifyEnabled = true` in the release build type of `app/build.gradle`
- Write all required ProGuard keep rules to `app/proguard-rules.pro` as specified in the
  activity file's ProGuard section and [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section)
If `proguard_enabled = false`: skip ProGuard configuration entirely.

## Mandatory verification

After applying all changes, run with parallel execution and build-cache enabled to
minimise first-build time:
```bash
./gradlew assembleDebug --parallel --build-cache 2>&1
```

- If BUILD SUCCESSFUL: you are done.
- If BUILD FAILED: diagnose using `references/pax-aio/troubleshooting.md#sdk-build`, fix, rebuild.
  Repeat until the build passes. Do NOT report PASS until the build succeeds.

If `proguard_enabled = true`, also verify the release build:
```bash
./gradlew assembleRelease --parallel --build-cache 2>&1
```
If the release build fails with `ClassNotFoundException` or `NoSuchMethodError`, check
ProGuard rules against [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section).

## Required report

```
GATE 1 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED (last attempt)
Build time: Xs
SDK version used: X.X.X
ProGuard configured: YES | NO | SKIPPED (not requested)
Release build (if ProGuard): SUCCESS | FAILED | N/A
Files modified: <list>
Known issues applied: <list>
Build output (last 10 lines):
<output>
Acceptance criteria met: <list>
```
```
