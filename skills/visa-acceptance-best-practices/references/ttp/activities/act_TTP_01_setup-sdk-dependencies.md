# Activity TTP-1: Set Up Tap to Pay SDK Dependencies

Configure Gradle files and the Android project so the Tap to Pay on Android (Tap to Phone / SoftPOS)
SDK is available in the build.

**Reference:** [Tap to Pay on Android — Configuring the SDK](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) (settings.gradle, build.gradle, AndroidManifest, ProGuard), `references/ttp/troubleshooting.md#tap-to-pay`, `references/ttp/constants/ttp-sdk-requirements.md`

## Critical Rules (NEVER violate these)

1. **NEVER comment out, remove, or disable the Tap to Pay SDK dependencies** as a workaround for build/resolution failures. Both `io.payworks:paybutton-android` and `io.payworks:mpos.android.taptophone` must remain in the build file. If they cannot be resolved, fix the root cause (network, proxy, or repository configuration) — do NOT work around it.
2. **NEVER declare a card-reader accessory library.** The Tap to Pay artifact is `mpos.android.taptophone`. Nothing under `mpos.android.accessories.*` belongs in a Tap to Pay project — those libraries drive external card readers, and mixing one in makes the SDK negotiate for hardware that is not there.
3. **The `io.payworks` group MUST resolve — and NEVER revert a working repository configuration.** `https://repo.visa.com/mpos-releases/` is the URL in the [official documentation](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) and the correct default. But if the project already resolves `io.payworks` through its organisation's own repository manager, that satisfies the requirement equally. **Detect an existing declaration before adding one** — see Step 1. Once a repository resolves the group, do not remove, replace, or "correct" it to match the documentation's example. If resolution fails, the problem is network/proxy access — not the URL.
4. **NEVER enable `android:allowBackup`.** The Tap to Pay SDK stores cryptographic keys in the Android Keystore. Automatic backup restores default encryption preferences and causes a functionality error in the SDK. `allowBackup` MUST be `false`.
5. **NEVER downgrade a version, and NEVER change any version without explicit developer approval** (see `references/ttp/constants/ttp-sdk-requirements.md` § Required Upgrade Consent Protocol).
6. **NEVER hardcode `app/`.** Use `$ANDROID_MODULE_DIR` from `project-plan.md`. Projects with no `app` module are common, and a path that does not exist produces zero grep matches and exit status 1 — indistinguishable from "checked and clean".

## Prerequisites

Before starting, confirm the developer has:

1. **A working Android build toolchain.** Android Studio is *recommended* for interactive development
   but is **not required to build** — a Gradle wrapper, the Android SDK, and a JDK are sufficient for a
   headless or CI run. Verify what actually matters, rather than looking for an application bundle:

   ```bash
   [ -f "$GRADLE_ROOT/gradlew" ] && echo "gradlew: OK" || echo "gradlew: MISSING"
   java -version 2>&1 | head -1
   # Android SDK location — any one of these is sufficient
   echo "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
   grep -s '^sdk.dir=' "$GRADLE_ROOT/local.properties" >/dev/null && echo "sdk.dir: set in local.properties"
   ```

   **Do not treat "not found at a default application path" as an unmet prerequisite.** Installation
   locations differ across platforms and package managers (JetBrains Toolbox, a Linux tarball, a
   per-user directory), and this skill runs on macOS, Linux and Windows. If the checks above pass, the
   prerequisite is met — record that the build is headless and continue.
2. **JDK 17 or later** installed and configured (verify with `java -version`)
3. **Network access** to a Visa-operated Maven repository (`repo.visa.com` or the project's internal
   mirror), Google Maven, and Maven Central verified. If a build fails with network errors, apply the
   remediation from `references/ttp/troubleshooting.md#tap-to-pay`.
4. An existing Android project, or willingness to create a new one, with **minSdk 31 (Android 12)** or higher
5. `project-plan.md` present, providing `ANDROID_MODULE_DIR`, `SOURCE_ROOT`, `repo_url` and
   `required_upgrades`. It is produced by `act_TTP_00_planning.md`.

## Workflow

Follow these steps in order. After each step, verify the change is correct before moving to the next.

### Step 0: Determine the SDK Version (MANDATORY)

The Visa repository keeps **only the six most recent SDK versions**. Older versions are removed and will cause build failures.

**If `SELECTED_SDK_VERSION` was provided by the workflow**, use it directly and skip the query below.

**Otherwise**, query the repository's `maven-metadata.xml`. This is the only sanctioned discovery
technique — do **not** scrape an HTML directory listing, because the response shape depends on the
repository product and an authenticated mirror answers with a login page rather than a listing:

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

Add `-u "<user>:<token>"` if the repository requires authentication. Ask the developer for those
values or read them from their Gradle home — never hardcode them into a project file, and never
print them.

Use the selected version for **both** dependency declarations. If no version was pre-selected,
use the **highest listed version**. Do NOT hardcode a version without checking. The value in
`references/ttp/constants/ttp-sdk-requirements.md` (`TTP_SDK_VERSION`) is the authored baseline —
verify it is still available before use.

> **A version list plus a failing build is a network problem, not a coordinate problem.** Proxying
> mirrors frequently serve `maven-metadata.xml` from cache (HTTP 200) while the `.aar`/`.pom` bytes
> behind it are unreachable. Confirm the bytes before doubting the coordinates:
>
> ```bash
> curl -sS --max-time 20 -o /dev/null -w '%{http_code}\n' \
>   "$REPO/io/payworks/mpos.android.taptophone/$VER/mpos.android.taptophone-$VER.pom"
> ```

### Step 1: Declare the Visa Maven Repository

**First, look for an existing declaration.** Some organisations do not allow builds to reach external
repositories directly, and instead proxy them through an internal repository manager. If the project
already resolves `io.payworks`, reuse that repository — adding a second one is redundant at best and
a resolution conflict at worst.

Search by artifact **group**, which finds such a repository whatever its URL:

```bash
grep -rnE 'io\.payworks|mpos-releases|repo\.visa\.com' \
  settings.gradle settings.gradle.kts build.gradle build.gradle.kts \
  gradle.properties gradle/libs.versions.toml 2>/dev/null
```

Repository declarations legitimately live in several places, and **a project with no
`dependencyResolutionManagement` block is not misconfigured**:

| Where | Shape |
|-------|-------|
| `settings.gradle[.kts]` | `dependencyResolutionManagement { repositories { … } }` |
| root `build.gradle[.kts]` | `allprojects { repositories { … } }` |
| root `build.gradle[.kts]` | `subprojects { repositories { … } }` |

- **A Visa-operated repository already resolves `io.payworks`** → change nothing. Record which one
  in the gate report and move to Step 2. Do not restructure a working setup to match the shape below.
- **No such repository** → add one, using `repo_url` from `project-plan.md` (which defaults to
  `https://repo.visa.com/mpos-releases/`).

When adding to `settings.gradle[.kts]`, apply the `exclusiveContent` block from the official docs:

```kotlin
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        google()
        exclusiveContent {
            forRepository {
                maven {
                    setUrl("https://repo.visa.com/mpos-releases/")
                }
            }
            filter {
                includeGroup("io.payworks")
            }
        }
    }
}
```

**Important details:**
- If the project already has a `dependencyResolutionManagement` block, add only the `exclusiveContent` block inside the existing `repositories` block.
- If the project declares repositories via `allprojects`/`subprojects` instead, add the equivalent
  `maven { setUrl(...) }` there rather than introducing a `dependencyResolutionManagement` block —
  the two mechanisms conflict, and `FAIL_ON_PROJECT_REPOS` will break the existing build.
- **The ONLY group filter needed is `io.payworks`.** Both `paybutton-android` and `mpos.android.taptophone` are published under it.
- The `repo.visa.com` URL requires the trailing slash. Mirror URLs may not — use `repo_url` verbatim.
- An authenticated mirror needs credentials. Read them from `~/.gradle/gradle.properties` or the
  environment; **never write credentials into a project file**, and never print them.

### Step 2: Configure Project build.gradle

Open the root `build.gradle[.kts]`. Check the version requirements in
`references/ttp/constants/ttp-sdk-requirements.md` and the `required_upgrades` section of `project-plan.md`.

The Kotlin Gradle plug-in is **required**. Kotlin **2.1+** and AGP **8.2+** are required minimums.

```kotlin
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
}
```

**Version rules (CRITICAL — never downgrade, never change without approval):**
- If the project's AGP/Kotlin version is **already >= the minimum**, keep it as-is.
- Only upgrade a version if it appears in `required_upgrades` in `project-plan.md` **AND** has been explicitly approved by the developer.
- Use `MIN_AGP_VERSION` / `MIN_KOTLIN_VERSION` from the constants file as the target when an upgrade is required.
- If a build error suggests a version change that was NOT pre-approved, do NOT apply it — report back for approval.

### Step 3: Configure Module build.gradle

Open `$ANDROID_MODULE_DIR/build.gradle[.kts]` — the module whose build file applies
`com.android.application`, as resolved by the planning gate. **This is not necessarily `app/`.**
This step has five parts.

#### 3a. Add Packaging Exclusions

```kotlin
android {
    // ...
    packaging {
        resources {
            excludes.add("META-INF/*")
            excludes.add("LICENSE.txt")
            excludes.add("asm-license.txt")
        }
    }
}
```

#### 3b. Set Java 17 Compatibility

Only modify versions that appear in `required_upgrades`. **Never downgrade** — if the project
already uses Java 21 / minSdk 34, keep those values.

**Check what is already there before adding anything** — and look in both places it can live:

```bash
SETTINGS='sourceCompatibility|targetCompatibility|jvmTarget|jvmToolchain|compilerOptions|kotlinOptions'

# 1. The module's own build file
grep -nE "$SETTINGS" "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null

# 2. Convention plugins the module APPLIES. On a multi-module build the toolchain is often set
#    once in buildSrc or an included build, and the module file says nothing about it.
grep -nE '^\s*(id\(|alias\(|kotlin\(|`)' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
grep -rnE "$SETTINGS" buildSrc/src build-logic gradle/build-logic 2>/dev/null | head -20
```

The requirement is that **the Kotlin JVM target resolves to 17 or higher** — not that any particular
block appears. A project already compiling at 17 needs no edit here, and adding one can make a clean
build worse.

> **A module-only grep under-reports, and the under-report is not harmless.** Zero matches in the
> module file reads as "nothing is configured", so the natural next move is to add a block — and if the
> convention plugin already set `jvmToolchain(21)`, adding `jvmTarget = JVM_17` beside it is a
> **downgrade**, which Critical Rule 5 and the opening line of this step both forbid. The check that
> was supposed to prevent a wrong version change is the check that causes it, because it could not see
> the value it was lowering. The second grep costs one command.

Whichever place the setting comes from, **let the build decide**: if the module already compiles at 17
or higher, change nothing, and say in the gate report *where* the target is configured. "Already at 17"
without a source is not a finding a later gate can re-check.

Java source/target compatibility:

```kotlin
android {
    // ...
    defaultConfig {
        minSdk = 31   // Android 12 — only raise if below MIN_SDK_VERSION; never lower an existing higher value
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
```

**The Kotlin JVM target — pick the form the project's toolchain actually supports.** The old
`android { kotlinOptions { } }` block is deprecated on modern AGP/Kotlin and is being removed; adding
it to a current project introduces a deprecation warning at best and an unresolvable block at worst.

| Project toolchain | Use |
|-------------------|-----|
| AGP < 8.1 / Kotlin 1.x | `android { kotlinOptions { jvmTarget = "17" } }` |
| AGP 8.1+ / Kotlin 2.x | `kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_17 } }` (needs `import org.jetbrains.kotlin.gradle.dsl.JvmTarget`) |
| Any modern project | `kotlin { jvmToolchain(17) }` — sets both the Java and Kotlin targets together |

```kotlin
// AGP 8.1+ / Kotlin 2.x — a top-level block, NOT inside android { }
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}
```

**Often no Kotlin block is needed at all.** When `compileOptions` pins source/target and AGP aligns
Kotlin's `jvmTarget` with it, the project already compiles at 17. Verify with the build rather than
adding a block speculatively — read `agp_version` and `kotlin_version` from `project-plan.md`, pick
the matching row, and if the build already passes at 17, **change nothing**.

#### 3c. Add Build Type Matching Fallbacks

The Tap to Pay SDK publishes a **release build type only** — no debug variant. The debug build type must fall back to `release`, or dependency resolution fails for debug builds.

**First check whether a `buildTypes` block exists at all.** Many projects have none — in that case
it must be *created*, not edited:

```bash
grep -n 'buildTypes' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
```

**Kotlin DSL:**
```kotlin
android {
    // ...
    buildTypes {
        getByName("debug") {
            matchingFallbacks += "release"
        }
    }
}
```

`getByName("debug")` is the form that works whether or not Gradle has generated a type-safe
accessor for the build type. A bare `debug { … }` accessor also compiles in most AGP versions, and
`matchingFallbacks.apply { clear(); add("release") }` is valid Kotlin too — but `+=` on
`getByName` is the form least likely to need adjusting per project.

**Groovy DSL equivalent:**
```groovy
buildTypes {
    debug {
        matchingFallbacks = ['release']
    }
}
```

#### 3d. Enable multiDex if the dex limit is reached

The SDK plus the Default UI plus a typical app comfortably exceeds the 64K method limit. At
`minSdk 31` the platform provides native multidex, so no support library is needed — but the flag
must still be set if the build reports a dex-limit error:

```kotlin
android {
    defaultConfig {
        multiDexEnabled = true
    }
}
```

Add it pre-emptively only if the project is already large; otherwise add it in response to a
`Cannot fit requested classes in a single dex file` error, which is otherwise a confusing failure to
attribute to a dependency addition.

Expect a **large debug APK** — around 150 MB has been observed with Compose plus this SDK. USB
installs are correspondingly slow. That is size, not breakage; do not go looking for a fault.

#### 3e. Add SDK Dependencies

**First: does the project already declare these coordinates?** Check before writing anything. A
version catalog can already define both artifacts — at a version that is not the one you selected —
and every way of handling that is silently wrong except one.

```bash
cd "$GRADLE_ROOT" || exit 1
# String literals in the module, and catalog aliases anywhere.
grep -rnE 'io\.payworks:(paybutton-android|mpos\.android\.taptophone)' \
  "$ANDROID_MODULE_DIR"/build.gradle* gradle/libs.versions.toml 2>/dev/null

# If a catalog alias exists, find the version key it points at and WHO ELSE reads that key.
# A shared version.ref is the trap: bumping it moves every artifact in the family.
grep -nE '^[a-zA-Z0-9_-]+ *= *\{ *module *= *"io\.payworks:' gradle/libs.versions.toml 2>/dev/null
grep -nE 'version\.ref *= *"[a-zA-Z0-9_-]+"' gradle/libs.versions.toml 2>/dev/null
```

| What you found | What to do |
|----------------|------------|
| nothing | add the dependencies per the block below |
| a catalog alias already at `SELECTED_SDK_VERSION` | **reuse the alias, change nothing.** Record the alias names in the gate report |
| a catalog alias at a **different** version | **do not bump the shared key, and do not add a second declaration.** Surface it as a version decision — see below |
| a string literal at a different version in this module | one declaration, one version: edit it in place after developer consent |

**When the catalog pins a different version**, treat it exactly like any other version change: list
the blast radius and get consent. Run the second grep above and report *every* alias sharing that
`version.ref` — on a real project the same key commonly feeds several `io.payworks` artifacts, so
"just bump the catalog" moves libraries this integration was never asked to touch. Then offer:

- **Keep the project's pin** (default) — declare the version module-locally so nothing shared moves,
  and re-run § *Resolution procedure* against the pinned version, because
  `"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` § *Resolved API Names* is verified
  for one version only. Record in the plan which names you confirmed.
- **Bump the shared key** — only with explicit consent, and only after the affected-alias list has
  been shown.

**Never add a hardcoded `implementation("io.payworks:…:<version>")` alongside an existing catalog
declaration of the same artifact.** Gradle resolves the conflict silently — highest version wins by
default — so the build succeeds, the catalog entry becomes untrue, and nothing reports it. The
version you read in the catalog is then not the version on the classpath.

Both libraries at the **same** version. Substitute `SELECTED_SDK_VERSION` from Step 0 — the literal
below is only an illustration, and the repository keeps just six versions, so a stale literal
becomes a build failure:

```kotlin
dependencies {
    // ...
    // Default UI dependency
    implementation("io.payworks:paybutton-android:$SELECTED_SDK_VERSION")

    // Tap to Pay dependency
    implementation("io.payworks:mpos.android.taptophone:$SELECTED_SDK_VERSION")
}
```

If the project uses a Gradle version catalog (`gradle/libs.versions.toml`), declare a single shared
version key there and reference it from both dependencies — that makes "both at the same version"
structural rather than something a reviewer has to notice.

> **WARNING — Correct coordinates (do NOT hallucinate alternatives):**
> - Group: `io.payworks` (the ONLY group)
> - Artifacts: `paybutton-android` and `mpos.android.taptophone`
> - Do NOT declare any `mpos.android.accessories.*` artifact — that namespace holds card-reader
>   accessory libraries, not Tap to Pay.
> - If such an artifact is **already present** in this project, do not silently remove it. It is not
>   yours to remove — report it and ask.

### Step 4: Update AndroidManifest.xml — Application Attributes

The manifest is at `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`.

Set the required application attributes:

```xml
<application
    ...
    android:allowBackup="false"
    android:largeHeap="true">
    ...
</application>
```

- `android:allowBackup="false"` — **mandatory** (see Critical Rule #4; backup corrupts Keystore-held crypto keys).
- `android:largeHeap="true"` — required for terminal updates that transfer large volumes of data.

If a `package=` attribute is present on the `<manifest>` tag (a hard error on AGP 8.x), remove it and ensure the module `build.gradle` sets `namespace`.

#### The SDK changes one host-app attribute you did not set: `android:supportsRtl`

`io.payworks:paybutton-android` declares this in its own manifest:

```xml
<application
    android:allowBackup="false"
    android:supportsRtl="false"
    tools:replace="android:supportsRtl" >
```

`tools:replace` means the SDK does not merely supply a *default* — it **wins the merge**. Two
consequences, and the second is easy to miss:

| Host app declares | Result after merge |
|-------------------|--------------------|
| nothing | app becomes `supportsRtl="false"`, plus a benign-looking warning: `application@android:supportsRtl was tagged at AndroidManifest.xml:N to replace other declarations but no other declaration present` |
| `android:supportsRtl="true"` | **silently overridden to `false`** — RTL layout mirroring is disabled app-wide |

For an app that supports Arabic, Hebrew, Farsi or Urdu, that is a visible, app-wide layout regression
introduced by adding a dependency. **Surface it to the developer as a product decision** — it is not
this skill's to make:

```bash
# Inspect the MERGED manifest, not just the source one. The source manifest will not show it.
# Resolve the path — AGP 7.x and 8.x write it to different places, and a hardcoded path plus
# 2>/dev/null returns empty output on the version it does not know, which reads as "clean".
# See references/ttp/constants/ttp-sdk-requirements.md § Locating the merged manifest.
MERGED_MANIFEST=$(find "$ANDROID_MODULE_DIR/build/intermediates" \
  -path '*merged_manifest*' -name AndroidManifest.xml 2>/dev/null | grep -i '/debug' | head -1)

if [ -z "$MERGED_MANIFEST" ]; then
  echo "supportsRtl: UNMEASURED — no merged manifest. Run assembleDebug, then re-check."
else
  echo "reading $MERGED_MANIFEST"
  grep -n 'supportsRtl' "$MERGED_MANIFEST" \
    || echo "supportsRtl absent from the merged manifest — report that, do not assume the default"
fi

# Who contributed the value:
grep -n -A2 'supportsRtl' \
  "$ANDROID_MODULE_DIR"/build/intermediates/manifest_merge_blame_file/debug/*/manifest-merger-blame-debug-report.txt 2>/dev/null
# And what the app itself asked for:
grep -n 'supportsRtl' "$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml" 2>/dev/null \
  || echo "host app does not declare supportsRtl — it will inherit false from the SDK"
```

A host app that needs RTL can assert its own priority:

```xml
<application
    android:supportsRtl="true"
    tools:replace="android:supportsRtl" >
```

**This is standard Android manifest-merger behaviour, not a documented SDK guarantee.** Whether the
SDK's own screens render correctly under RTL is **not established** — report the override and let the
developer decide; do not silently add the counter-override on their behalf, and do not claim the SDK
supports RTL if it is overridden back.

> **This is an always-fires decision** — `workflow.md` § *Always-fires decisions*. It is not scoped
> to `CHECKPOINT_MODE = per_gate`. It does have a safe default: **leave the SDK's value alone.** On an
> autonomous run, take that default and record it in the gate report's *Decisions taken without
> asking* block with the reversal (add the `tools:replace` snippet above). Do not stop the run for it,
> and do not resolve it in the other direction — adding the counter-override is the branch that makes
> an undocumented claim about the SDK's own screens.

### Step 5: Update AndroidManifest.xml — Permissions

Add the permissions required by the Default UI:

```xml
<manifest ... >
    ...
    <!-- Needed for Default UI -->
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <uses-permission android:name="android.permission.READ_PHONE_STATE"/>
    ...
</manifest>
```

### Step 6: Configure ProGuard Rules (Optional)

This step is **optional** and depends on whether the app uses code obfuscation.

**Read `PROGUARD_ENABLED` from the agent prompt (or `proguard_enabled` in `project-plan.md`).**
The workflow already asked this question at Step 0 — **do NOT ask the developer again.** Only ask
if the value is genuinely absent, which means this activity is being run standalone without a
workflow.

- **`true`**: enable minification in the release build type and add the keep rules below.
- **`false`**: skip this step entirely.

```kotlin
buildTypes {
    release {
        isMinifyEnabled = true
        proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
}
```

Add these rules to `proguard-rules.pro`:

```proguard
# OkHttp
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn com.squareup.okhttp.**
-keep class com.squareup.okhttp.* { *; }
-dontwarn okio.**

# Acceptance Devices
-keep class io.mpos.** { *; }
-dontwarn io.mpos.**
-keep class com.visa.vac.tc.** {*;}
-keep class com.nimbusds.jose.** {*;}
-keep class org.bouncycastle.** {*;}
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-keep class com.visa.auth.** { *; }
-dontwarn com.visa.auth.**
-keep class androidx.** { *; }

# Visa Sensory Branding
-keep class com.visa.SensoryBrandingView

# Mastercard Sonic Branding
-keep class com.mastercard.sonic.BuildConfig {*;}
```

### Step 7: Verify the Build

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

If obfuscation is enabled, also verify the release build:

```bash
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleRelease" \
  --parallel --build-cache > /tmp/ttp-build-release.log 2>&1
RELEASE_EXIT=$?
tail -30 /tmp/ttp-build-release.log
[ "$RELEASE_EXIT" -eq 0 ] || echo "RELEASE BUILD FAILED (exit $RELEASE_EXIT)"
```

## Troubleshooting

If the build fails, refer to `references/ttp/troubleshooting.md#tap-to-pay` for detailed diagnosis and fixes (network access, `allowBackup` conflict, `matchingFallbacks`, dependency resolution).

**Reminder:** NEVER comment out the Tap to Pay dependencies, revert `settings.gradle`, or enable `allowBackup` as a workaround. Always fix the root cause.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. SDK version was queried from the repository's `maven-metadata.xml` (Step 0) — not hardcoded blindly, and not scraped from an HTML directory listing
2. The `io.payworks` group resolves from a declared repository — either one the project already had (reused, not replaced) or `https://repo.visa.com/mpos-releases/` newly added with `exclusiveContent` filtering for `io.payworks`. The gate report names which.
3. Project `build.gradle` declares Kotlin and AGP at or above the minimums in `references/ttp/constants/ttp-sdk-requirements.md`
4. **No version downgrades** — project versions that already meet or exceed minimums are unchanged
5. Only versions listed in `required_upgrades` (from `project-plan.md`) **and explicitly approved by the developer** were modified
6. `$ANDROID_MODULE_DIR/build.gradle` includes:
   - `minSdk` >= `MIN_SDK_VERSION` (31 / Android 12)
   - Packaging exclusions for `META-INF/*`, `LICENSE.txt`, and `asm-license.txt`
   - Java 17 compatibility: `sourceCompatibility` / `targetCompatibility` set, and the **Kotlin JVM
     target resolves to 17 or higher by whichever mechanism the project's toolchain uses**
     (`compilerOptions`, `jvmToolchain`, legacy `kotlinOptions`, or AGP's own alignment with
     `compileOptions`). Do NOT require a literal `jvmTarget` line — that fails a correctly
     configured modern project, and adding a deprecated `kotlinOptions` block to satisfy it is a
     regression
   - `matchingFallbacks` in the `debug` build type pointing to `release` — in a `buildTypes` block that was created if it did not exist
   - SDK dependencies: `io.payworks:paybutton-android` and `io.payworks:mpos.android.taptophone` at the **same** version (`SELECTED_SDK_VERSION`), with no stale literal left in place
7. `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`:
   - No `package=` attribute on the `<manifest>` tag
   - `android:allowBackup="false"` and `android:largeHeap="true"` on the `<application>` tag
   - The **merged** manifest was inspected for `android:supportsRtl`, and if the SDK's
     `tools:replace` override changed the host app's value, the developer was told — it is an
     app-wide layout decision, not a build detail
   - `INTERNET`, `ACCESS_NETWORK_STATE`, and `READ_PHONE_STATE` permissions present
8. ProGuard rules configured only if `PROGUARD_ENABLED = true` — and the developer was **not** re-asked
9. No path in any modified file or verification command assumes an `app/` module — all use `$ANDROID_MODULE_DIR`
10. The project builds without errors (`$GRADLE_MODULE_PATH:assembleDebug` succeeds with **exit status 0**)
11. If a dex-limit error occurred, `multiDexEnabled = true` was added rather than dependencies being removed

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 1 of the Tap to Pay on Android integration: SDK Gradle dependencies setup.

Working directory: <project root>

## Pre-resolved configuration (do NOT re-ask for any of these)

SELECTED_SDK_VERSION=<SELECTED_SDK_VERSION>
REPO_URL=<REPO_URL>                          (the repository that will serve io.payworks)
PROGUARD_ENABLED=<PROGUARD_ENABLED>          (true | false — already answered at Step 0)
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

If SELECTED_SDK_VERSION is a valid version (e.g., `2.115.0`), use it directly for both
dependency declarations and skip the curl query in Activity Step 0. If it is `N/A` or empty,
fall back to Activity Step 0 and query `maven-metadata.xml`.

**Never hardcode `app/`.** Every path you read or write is relative to `$ANDROID_MODULE_DIR`. A grep
against a path that does not exist returns zero matches and exit status 1, which looks exactly like
"checked and clean" — that is how a gate passes on a project it never actually read.

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context, `android_module_dir`, `source_root`,
   `repo_url`, `required_upgrades`, and TTP GATE 1 notes. It is produced by
   `references/ttp/activities/act_TTP_00_planning.md`; if it is missing, stop and report — do not
   invent the values.
2. `$SKILL_DIR/references/ttp/activities/act_TTP_01_setup-sdk-dependencies.md` — the activity definition (full implementation guidance)
3. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — version minimums, SDK coordinates, resolved API names, device requirements

## Your task

Implement TTP GATE 1 using the activity file as your primary implementation guide.
Use `project-plan.md` for project-specific metadata (DSL, file paths, `required_upgrades`, known issues).

**Coordinate rule:** Use `io.payworks:paybutton-android` AND `io.payworks:mpos.android.taptophone`.
Never declare any `mpos.android.accessories.*` artifact — those are card-reader accessory libraries,
not Tap to Pay.

**allowBackup rule:** `android:allowBackup` MUST be `false`. Never enable it — it corrupts
the Keystore-held cryptographic keys the SDK depends on.

**Version change rule:** If a build error suggests changing a version (AGP, Kotlin, Java, minSdk,
or any other component) that was NOT already approved in `required_upgrades`, do NOT apply the
change automatically. Report it back to the workflow for developer approval first.

If PROGUARD_ENABLED = true: set `isMinifyEnabled = true` in the release build type and write
all keep rules from the activity file's ProGuard section to
`$ANDROID_MODULE_DIR/proguard-rules.pro`.
If PROGUARD_ENABLED = false: skip ProGuard configuration entirely. **Do not ask the developer** —
the question was already answered at workflow Step 0.

## Mandatory verification

After applying all changes:
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
- If BUILD SUCCESSFUL: you are done.
- If BUILD FAILED: diagnose using `references/ttp/troubleshooting.md#tap-to-pay`, fix, rebuild.
  Do NOT report PASS until the build succeeds.

If `proguard_enabled = true`, also verify `$GRADLE_MODULE_PATH:assembleRelease`.

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
TTP GATE 1 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED (last attempt)
Build time: Xs
SDK version used: X.X.X
Repository serving io.payworks: <url> (REUSED existing declaration | ADDED)
Android module: <ANDROID_MODULE_DIR>
matchingFallbacks: ADDED to existing buildTypes | buildTypes block CREATED | already present
multiDex: not needed | enabled (dex limit hit)
Card-reader accessory artifact also present: NO | YES (<coordinate> — reported, not removed)
ProGuard configured: YES | NO | SKIPPED (PROGUARD_ENABLED = false)
Release build (if ProGuard): SUCCESS | FAILED | N/A
Files modified: <list>
Acceptance criteria met: <list>
Build output (last 10 lines):
<output>
```
```
