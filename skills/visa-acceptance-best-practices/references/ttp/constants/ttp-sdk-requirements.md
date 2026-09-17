# Tap to Pay on Android SDK — Version, API & Device Requirements

> **Single source of truth** for all version constraints, resolved API names, and device
> requirements enforced by the Tap to Pay (Tap to Phone / SoftPOS) integration path of the skill.
> All workflow logic, activity files, and troubleshooting documents reference this file
> instead of hardcoding version numbers or class names.
>
> When a requirement changes, update ONLY this file — all other documents inherit.
>
> **Doc source:** [Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md)

---

## SDK Coordinates

The Tap to Pay on Android SDK is published to the Visa Maven repository under the
`io.payworks` group. **Two** dependencies are required:

| Constant | Value | Purpose |
|----------|-------|---------|
| `TTP_MAVEN_REPO` | `https://repo.visa.com/mpos-releases/` | Visa Maven repo (trailing slash required) |
| `TTP_MAVEN_GROUP` | `io.payworks` | The ONLY group filter needed in `exclusiveContent` |
| `TTP_UI_DEPENDENCY` | `io.payworks:paybutton-android` | Default UI library |
| `TTP_SDK_DEPENDENCY` | `io.payworks:mpos.android.taptophone` | Tap to Pay on Android library |

> **WARNING — correct coordinates (do NOT hallucinate alternatives):**
> - The Tap to Pay artifact is `mpos.android.taptophone`. It is **not** under
>   `mpos.android.accessories.*` — that namespace holds card-reader accessory libraries, and none of
>   them belongs in a Tap to Pay project. `paybutton-android` is shared UI and is required.
> - Both libraries must be declared at the **same** version.
> - `io.payworks` is the only group — there is no `io.payworks`-vs-`io.mpos` group choice
>   (see § *Maven group vs package root* below).

### A repository mirror is acceptable — the requirement is that `io.payworks` resolves

`https://repo.visa.com/mpos-releases/` is the URL in the official documentation, and it is the
correct default. But the **requirement is that the `io.payworks` group resolves**, not that this
exact URL appears in the build files.

Many organisations do not allow builds to reach external repositories directly, and instead proxy
them through an internal repository manager (Artifactory, Nexus, or similar). A project configured
that way is correctly configured.

**Detect an existing declaration before adding anything.** If the project already resolves
`io.payworks`, reuse whatever repository does so — adding a second one is redundant at best and a
resolution conflict at worst. Search by artifact group, which finds a mirror under any hostname:

```bash
# Any repository already declared for this group, whatever it is called.
# Run this from $GRADLE_ROOT — these files live there, not in the module directory. From the
# module directory it matches nothing and reports "no repository declared", which leads to
# adding a redundant (and possibly unreachable) second repository.
cd "$GRADLE_ROOT" || exit 1
grep -rnE 'io\.payworks|mpos-releases|repo\.visa\.com' \
  settings.gradle settings.gradle.kts build.gradle build.gradle.kts \
  gradle.properties gradle/libs.versions.toml 2>/dev/null

# Ask Gradle what it would actually use, rather than inferring from a URL
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:dependencies" \
  --configuration debugRuntimeClasspath 2>/dev/null | grep -i payworks
```

If the project resolves through an internal mirror, that repository's URL and credentials are the
organisation's to supply — this skill does not choose them. **Never write credentials into a project
file, and never print them.**

#### Where repository credentials come from — four patterns, not two

A mirror that requires authentication can be fed from any of these. Establish which one the project
uses **before** running a build, because the failure mode of guessing wrong looks nothing like an
auth problem.

| # | Pattern | Where it lives | How the build gets it |
|---|---------|----------------|----------------------|
| 1 | Gradle properties | `~/.gradle/gradle.properties` | `providers.gradleProperty("…")` or a bare property reference |
| 2 | Environment variables | the developer's shell | `System.getenv("…")` |
| 3 | **JVM system properties** | passed on the command line, or `systemProp.*` in `~/.gradle/gradle.properties` | `System.getProperty("…")` |
| 4 | A credentials helper / plugin | varies | plugin-specific |

**Pattern 3 is the one that breaks gates**, and it is common in enterprise Gradle builds. Read the
repository block to spot it:

```bash
grep -rn -A6 'repositories\|maven *{' "$GRADLE_ROOT"/build.gradle* "$GRADLE_ROOT"/settings.gradle* 2>/dev/null \
  | grep -nE 'System\.getProperty|System\.getenv|providers\.gradleProperty|credentials'
```

A block reading `System.getProperty("…")` resolves **only** when those properties are supplied:

```bash
# Either on every invocation …
"$GRADLE_ROOT/gradlew" -D<propertyName>=<value> -D<otherProperty>=<value> "$GRADLE_MODULE_PATH:assembleDebug"

# … or once, non-interactively, in the developer's Gradle home:
#   ~/.gradle/gradle.properties
#   systemProp.<propertyName>=<value>
```

Substitute the property names the project actually uses — they are project-specific and this skill
cannot guess them. Ask the developer, or read them out of the repository block. **Never print the
values, and never copy them into a file inside the project.** `systemProp.*` in the developer's
Gradle home is the right answer for a non-interactive run, because it keeps the secret outside the
repository and out of shell history.

#### `GRADLE_ARGS` — resolve once, append everywhere

When the build needs extra arguments to resolve dependencies at all, every gate needs them. Resolve
them **once**, at Step 1c of the workflow, and record them:

```bash
# Empty for most projects. Populated when the project's repository block demands
# system properties that are not already in the developer's Gradle home.
GRADLE_ARGS=""
```

Every build command in this skill is written `"$GRADLE_ROOT/gradlew" $GRADLE_ARGS …` so that a
project needing them works without editing seven activity files.

> **A `401`/`Unauthorized` from the mirror is an authentication problem, not a coordinate problem.**
> Do **not** edit the dependency block, do not "correct" the artifact names, and do not add a second
> repository. The coordinates in this file are verified; if they resolved for anyone they are right.
> This is the same class of trap as the metadata-200/artifact-404 asymmetry above: the error surfaces
> at the dependency line, so it reads as a dependency mistake, and an agent that starts "fixing"
> correct coordinates makes a working configuration worse. Fix the credentials instead.

Repository declarations also legitimately live outside `dependencyResolutionManagement` — for
example in a root `build.gradle[.kts]` via `allprojects { repositories { … } }` or
`subprojects { repositories { … } }`. A project with no `dependencyResolutionManagement` block is
**not** misconfigured. Do not restructure a working repository setup to match the documentation's
example shape.

## SDK Version

| Constant | Value | Reason |
|----------|-------|--------|
| `TTP_SDK_VERSION` | `2.115.0` | Latest release published by the repository when last verified (2026-08-06); the available window at that point was `2.110.0`–`2.115.0`. This is also the version all API names in this file were resolved from. |

> **Stay current — six-version window.** The Visa repository keeps **only the six most
> recent SDK versions**. When a new version is released, the oldest is removed and can no
> longer be used for new builds. Do NOT hardcode `2.115.0` blindly — query the repository
> for the latest available version and update this constant.

### Version discovery — always use `maven-metadata.xml`

This is the **only** sanctioned version-discovery technique. Do not scrape HTML directory
listings: the response shape depends on the repository product and changes without notice, and an
authenticated mirror serves a login page rather than a listing.

```bash
# REPO defaults to the documented repository; substitute your own mirror's base URL if the
# project resolves through one. Add -u "<user>:<token>" if that mirror requires authentication.
# REPO_URL is NOT set by the shell — read it out of project-plan.md first. Without this the
# documented default silently wins even on a project that correctly declares a mirror, and the
# resulting failure is against a host the project never intended to contact.
REPO_URL=$(grep -E '^repo_url:' "$GRADLE_ROOT/project-plan.md" 2>/dev/null \
  | sed -E 's/^repo_url:[[:space:]]*//; s/[[:space:]]*#.*$//')
REPO="${REPO_URL:-https://repo.visa.com/mpos-releases}"

curl -sS --max-time 20 \
  "$REPO/io/payworks/mpos.android.taptophone/maven-metadata.xml" \
  | grep -oE "<version>[^<]+</version>"
```

> **Diagnostic note — metadata and artifacts can fail independently.** A proxying repository often
> serves `maven-metadata.xml` from cache (HTTP 200) while the `.aar`/`.pom` bytes behind it are
> unreachable (HTTP 404 or `Connection reset`). Visible versions plus unresolvable artifacts reads
> like a coordinate typo but is a network problem. Confirm the bytes before doubting the
> coordinates:
>
> ```bash
> V=<version>
> curl -sS --max-time 20 -o /dev/null -w '%{http_code}\n' \
>   "$REPO/io/payworks/mpos.android.taptophone/$V/mpos.android.taptophone-$V.pom"
> ```
>
> See `references/ttp/troubleshooting.md#tap-to-pay`.

## Resolved API Names (verified against `2.115.0`)

**These names were read out of the resolved artifacts, not from documentation.** The Tap to Pay
documentation ships Kotlin-only samples with **no `import` statements anywhere**, so the fully
qualified paths cannot be quoted from any published page. The table below is the substitute.

> **Scope of this guarantee:** verified for `2.115.0` only. If the project resolves a different
> version, re-run the resolution procedure below before trusting an entry. A passing
> `$GRADLE_MODULE_PATH:assembleDebug` remains the final acceptance signal either way.
>
> **The version that matters is the one on the classpath, not the one you selected.** A project that
> already pins these coordinates in a version catalog resolves *its* version, not
> `SELECTED_SDK_VERSION` — and nothing in the build says so. Confirm which version is actually
> resolved before relying on this table:
>
> ```bash
> "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:dependencies" \
>   --configuration debugRuntimeClasspath > /tmp/ttp-deps.log 2>&1
> grep -oE 'io\.payworks:(paybutton-android|mpos\.android\.taptophone):[0-9.]+' /tmp/ttp-deps.log | sort -u
> ```
>
> If the resolved version is not `2.115.0` and the developer keeps that pin, run the resolution
> procedure and record in `project-plan.md` which names you confirmed against it. See
> `act_TTP_01_setup-sdk-dependencies.md` § *3e* for the pin-vs-bump decision.

### Maven group vs package root

| Constant | Value | Status |
|----------|-------|--------|
| `TTP_PACKAGE_ROOT` | `io.mpos` | **Confirmed** — the official ProGuard rules for this SDK are `-keep class io.mpos.** { *; }` / `-dontwarn io.mpos.**` |

Artifacts are published under group `io.payworks`; the classes inside them live under the
`io.mpos` package root. Both are correct — do not "fix" one to match the other.

### Verified fully-qualified names

| Type | Fully-qualified name |
|------|----------------------|
| `MposUi` | `io.mpos.paybutton.MposUi` *(an interface, not a class)* |
| `UiConfiguration` | `io.mpos.paybutton.UiConfiguration` |
| `SummaryFeature` | `io.mpos.paybutton.UiConfiguration.SummaryFeature` **(nested — see below)** |
| `TapToPhone` | `io.mpos.paybutton.TapToPhone` |
| `TapToPhoneConfiguration` | `io.mpos.paybutton.TapToPhoneConfiguration` |
| `SerialNumberInputMethod` | `io.mpos.paybutton.SerialNumberInputMethod` |
| `ConfirmationScreenOption` | `io.mpos.paybutton.ConfirmationScreenOption` |
| `ProviderMode` | `io.mpos.provider.ProviderMode` |
| `AccessoryParameters` | `io.mpos.accessories.parameters.AccessoryParameters` |
| `AccessoryFamily` | `io.mpos.accessories.AccessoryFamily` |
| `TransactionParameters` | `io.mpos.transactions.parameters.TransactionParameters` *(an interface; `.Builder` is nested on it)* |
| `ChargeBuilder` | `io.mpos.transactions.parameters.ChargeBuilder` |
| `Currency` | `io.mpos.transactions.Currency` *(an enum — `Currency.EUR`, `Currency.USD`, …)* |
| `Transaction` | `io.mpos.transactions.Transaction` *(a final class)* |
| `TransactionDetails` | `io.mpos.transactions.TransactionDetails` |
| `TransactionStatus` | `io.mpos.transactions.TransactionStatus` |
| `TransactionProcessParameters` | `io.mpos.transactionprovider.processparameters.TransactionProcessParameters` |
| `TippingProcessStepParameters` | `io.mpos.transactionprovider.processparameters.steps.tipping.TippingProcessStepParameters` |
| `EnrollResultIntent` | `io.mpos.taptophone.EnrollResultIntent` **(`taptophone`, not `paybutton`)** |
| `MerchantInformation` | `io.mpos.taptophone.MerchantInformation` |

### CRITICAL — the decoy table

Every row below is a **real, resolvable class on the compile classpath**. Picking the wrong one
does not always fail at the import line — it fails later, at a builder call site, with a confusing
type error. These are the traps, in descending order of how plausible the wrong answer looks:

| Correct | Decoys on the same classpath | Why the decoy is tempting |
|---------|------------------------------|---------------------------|
| `io.mpos.transactions.parameters.TransactionParameters` | `io.mpos.taptophone.TransactionParameters` | On a *Tap to Phone* integration, `io.mpos.taptophone.*` is the most attractive guess. It is a TTP-internal type. `createTransactionIntent` takes the `transactions.parameters` one. |
| `io.mpos.transactions.Currency` | `java.util.Currency`, `com.visa.utils.Currency` | `java.util.Currency` is the JDK reflex. `com.visa.utils.Currency` (shipped in `io.payworks:utils`) looks authoritative on a **Visa** integration. Neither satisfies `.charge(BigDecimal, Currency)`. |
| `io.mpos.transactions.Transaction` | `io.mpos.backend.api.Transaction`, `com.visa.kic.sdk.connector.data.Transaction` | The `com.visa.kic.*` one ships with the Tap to Pay kernel connector — the very component this product depends on. |
| `io.mpos.paybutton.SerialNumberInputMethod` | `io.mpos.taptophone.SerialNumberInputMethod` | Both exist. `TapToPhoneConfiguration` is a `paybutton` type, so its constructor needs the `paybutton` variants. |
| `io.mpos.paybutton.ConfirmationScreenOption` | `io.mpos.taptophone.ConfirmationScreenOption` | Same trap as the row above. |
| `io.mpos.paybutton.UiConfiguration.SummaryFeature` | *(none — but there is no top-level `SummaryFeature`)* | Every doc sample writes the bare name `SummaryFeature.REFUND_TRANSACTION`. It does not resolve without the nested import. |

**Rule of thumb:** when a name exists in both `io.mpos.paybutton` and `io.mpos.taptophone`, the
`paybutton` variant is the public API and the `taptophone` variant is internal.

> **A gate agent reporting a *new* decoy is a claim to verify, not a row to add.** Inspect the jars
> for the project's resolved version before recording it anywhere — the plan, a gate report, or this
> table:
>
> ```bash
> for j in $(find ~/.gradle/caches/modules-2 -name '*taptophone*.jar' -o -name '*paybutton*.jar' \
>              2>/dev/null | grep -F "$SELECTED_SDK_VERSION"); do
>   echo "== $j"; unzip -l "$j" | grep -i '<TheClassName>'
> done
> ```
>
> This is not a hypothetical. A gate agent reported `io.mpos.taptophone.TapToPhone` as a decoy
> alongside `io.mpos.paybutton.TapToPhone`, hedged honestly that it had fixed the import before
> building and so had no failing compile to show — and jar inspection at 2.115.0 found no
> `TapToPhone.class` in either taptophone jar at all. There is no such decoy. A wrong import there
> fails to compile immediately, which is the *opposite* of what this table is for: every row here is a
> pair that compiles either way and fails later. Adding a fast-failing name would train readers to
> distrust the rows that matter.
>
> The two `paybutton`/`taptophone` rows above were confirmed by the same method — both classes present,
> byte-for-byte separately, in both packages at 2.115.0. **"Both exist" is a claim about bytes.** Check
> the bytes.

### `SummaryFeature` is nested — import it accordingly

There is **no** top-level `SummaryFeature`. Use either form:

```kotlin
import io.mpos.paybutton.UiConfiguration
import io.mpos.paybutton.UiConfiguration.SummaryFeature   // nested import

configuration = UiConfiguration(summaryFeatures = setOf(SummaryFeature.REFUND_TRANSACTION))
```

```kotlin
// …or qualify it at the use site, with no second import
configuration = UiConfiguration(
    summaryFeatures = setOf(UiConfiguration.SummaryFeature.REFUND_TRANSACTION)
)
```

**Complete member list** (the documentation never publishes it):

`CAPTURE_TRANSACTION`, `PRINT_CUSTOMER_RECEIPT`, `PRINT_MERCHANT_RECEIPT`,
`REFUND_TRANSACTION`, `SEND_RECEIPT_VIA_EMAIL`, `SHOW_TOTAL_PREAUTHORIZED`,
`RETRY_TRANSACTION`, `PAY_BY_LINK`, `ADJUST_TIP`, `INCREMENT_TRANSACTION`.

### `MposUi.create()` — verified signature and parameter names

`MposUi` is an **interface**; `create` is a companion `@JvmStatic` with **two** overloads:

```
MposUi.create(ProviderMode, String, String)
MposUi.create(ProviderMode, String, String, AccessoryParameters)   // ← the one Tap to Pay needs
```

The Kotlin parameter names are **verified** (read from the `@kotlin.Metadata` annotation on
`MposUi$Companion` — see the resolution procedure), so named arguments are safe:

| Position | Parameter name | Type |
|----------|----------------|------|
| 1 | `providerMode` | `io.mpos.provider.ProviderMode` |
| 2 | `merchantId` | `String` |
| 3 | `merchantSecret` | `String` |
| 4 | `terminalParameters` | `io.mpos.accessories.parameters.AccessoryParameters` |

`ProviderMode` members: `UNKNOWN`, `MOCK`, `TEST`, `LIVE`, `JUNGLE`, `TEST_FIXED`, `LIVE_FIXED`.
This skill uses `TEST` only.

`AccessoryFamily` members include `UNKNOWN`, `TAP_TO_PHONE`, `MOCK`, and several families that identify
external card-reader hardware. **Tap to Pay uses `TAP_TO_PHONE` only** — every other member compiles
cleanly and then makes the SDK negotiate for hardware that is not present, so the failure surfaces at
the gateway rather than at build time.

### The `MposUi` holder — one instance, one owner, created by Gate 3

**`act_TTP_03` (Device Enrollment) owns this.** It is the first gate that needs an `MposUi`, and every
gate after it needs the same one: Gate 4 reads `transactionModule` for the transaction history, Gate 5
starts charges, Gates 6–9 refund, tip, capture and verify. Building it once, in the earliest gate that needs it,
is what makes `mpos_accessor` available to all of them.

> **This section is the canonical recipe. Both `act_TTP_03` (which creates the holder) and `act_TTP_05`
> (which verifies it and extends its configuration) point here rather than restating it.** A second copy
> of a three-branch decision is a second thing to drift.

Take the import paths from § *Verified fully-qualified names* and § *CRITICAL — the decoy table* above. Do not guess
them, and do not accept an IDE auto-import without checking it against the table: the IDE picks one
candidate and never tells you the others existed.

#### First: does an `Application` subclass already exist?

```bash
grep -n 'android:name=' "$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml" | grep -i application
grep -rn ': *Application()\|extends Application' "$SOURCE_ROOT" --include="*.kt" --include="*.java"
```

Then check who owns object construction, because the answer to that changes the first answer:

```bash
# A DI framework may own the lifecycle graph without any Application subclass at all.
grep -rn '@HiltAndroidApp\|@Component\|@Singleton\|startKoin\|dagger\.' "$SOURCE_ROOT" \
  --include="*.kt" --include="*.java" | head -20
```

Three branches, not two:

- **An `Application` subclass exists** → **extend it. Do not create a second one and do not repoint
  `android:name`.** Add the `MposUi` construction to the existing class's `onCreate()` (after its own
  `super.onCreate()` and after any DI graph is built) and expose the same accessors. If the class is
  owned by Hilt/Koin/Dagger — check for `@HiltAndroidApp` or a DI component built in `onCreate()` —
  changing `android:name` breaks injection app-wide, and not always loudly.
- **None exists, and no DI framework owns the graph** → create `PaymentApplication` as below and
  register it. This is the worked example every activity file's samples assume.
- **None exists, and a DI framework owns the graph** (Hilt, Koin, or a hand-rolled Dagger component)
  → **add `MposUi` as a singleton-scoped provider in that graph. Do not create an `Application`
  subclass whose only job is to hold one field.** See § *The DI-owned branch* below.

> **The third branch is a real and not-uncommon project shape**, not an edge case to squeeze into one
> of the other two. A DI-first app constructs everything through its component and never needs an
> `Application` subclass. Creating one anyway adds a second, competing owner of the same object's
> lifetime — the exact thing `act_TTP_03` Critical Rule 7 forbids when the class already exists, for
> the same reason.

#### The DI-owned branch

Add the provider to the module that already holds the app's other singletons, in that file's own
style. A hand-rolled Dagger component looks like this:

```kotlin
@Module
class AppModule {
    @Provides
    @Singleton
    fun provideMposUi(): MposUi? =
        try {
            MposUi.create( /* exactly the arguments in the worked example below */ )
                .apply { configuration = UiConfiguration(
                    summaryFeatures = setOf(SummaryFeature.REFUND_TRANSACTION)) }
        } catch (t: Throwable) {
            // Same guard, same reason — see act_TTP_03 Critical Rule 8. The nullable return is what
            // replaces isMposUiReady() here: null IS "not ready".
            Log.e("AppModule", "Tap to Pay SDK initialisation failed", t)
            null
        }
}
```

**Two things move when construction moves, and both are easy to miss:**

1. **The initialisation guard fires at first *access*, not at process start.** In the worked
   example `create()` runs in `Application.onCreate()`, so a failure is known before any screen
   renders. A `@Provides` is typically lazy: the first call that injects `MposUi` is where the throw
   would happen — often inside composition or an Activity's `onCreate`. Guard *there*. A `try`/`catch`
   placed where the object is *declared* rather than where it is *first built* catches nothing.
2. **`isMposUiReady()` has no natural home.** A nullable provider is the idiomatic replacement:
   `mposUi == null` means exactly what `isMposUiReady() == false` meant. Every guard in Gates 4–9
   reads `isMposUiReady()`; on this branch that becomes a null check, and `isDeviceEnrolled()` becomes
   `mposUi?.tapToPhone?.isDeviceEnrolled() == true`. Keep the two-guards-in-order rule — SDK-ready
   first, then enrolled — however you spell it.

#### Record the accessor — this is what makes the holder reusable

**Record the accessor you chose in `project-plan.md` as `mpos_accessor`.** Gate 3 writes it; Gates 4–9
read it:

| Branch | `mpos_accessor` |
|--------|-----------------|
| Created `PaymentApplication` | `PaymentApplication.mposUi` |
| Extended an existing `Application` | `<ExistingClass>.mposUi` |
| DI-owned | the injected reference as the project names it, e.g. `mposUi` (constructor- or field-injected) |

> **Gates 4, 5, 6, 7 and 8 spell their samples `PaymentApplication.mposUi` — roughly 90 times between
> them.** On the DI branch, read every one of those as `mpos_accessor`. This is a substitution, not
> an invitation to introduce the class: if a later gate emits a literal `PaymentApplication.`
> reference into a project that has no such class, the build breaks on a name no gate created.

> **An empty `mpos_accessor` after Gate 3 is a `FAIL`, not a detail to fix later.** Gate 4 is the next
> gate to run and it cannot query `transactionModule` without it. A gate that reports `PASS` while
> leaving the field blank hands the failure to the gate after it, where it reads as Gate 4's bug.

#### The worked example

**Kotlin (`PaymentApplication.kt`) — recommended for this class in every project:**

```kotlin
import io.mpos.paybutton.MposUi
import io.mpos.paybutton.UiConfiguration
import io.mpos.paybutton.UiConfiguration.SummaryFeature   // NESTED — no top-level SummaryFeature
import io.mpos.provider.ProviderMode
import io.mpos.accessories.AccessoryFamily
import io.mpos.accessories.parameters.AccessoryParameters

class PaymentApplication : Application() {

    // Catching Throwable is the point here, not an oversight: SDK initialisation can fail with an
    // Error (native library loading, hardware keystore unavailable) as readily as an Exception, and
    // either one reaching the framework from onCreate() kills the process on launch. Narrowing this
    // to Exception would reintroduce exactly the crash the guard exists to prevent.
    @Suppress("TooGenericExceptionCaught")
    override fun onCreate() {
        super.onCreate()

        // Guarded deliberately. create() runs here, so an exception would kill the process
        // before any UI renders — and isMposUiReady(), whose entire job is to show a friendly
        // message, would never get the chance to run. A guard that dies first is no guard.
        try {
            // TODO(production): TEST credentials only. Replace with secure credential
            // retrieval (backend service / vault) before shipping. Never ship a secret key.
            mposUi = MposUi.create(
                providerMode = ProviderMode.TEST,          // never ProviderMode.LIVE
                merchantId = BuildConfig.TTP_MERCHANT_ID,
                merchantSecret = BuildConfig.TTP_MERCHANT_SECRET,
                terminalParameters = AccessoryParameters
                    .Builder(AccessoryFamily.TAP_TO_PHONE) // never MOCK, never a reader family
                    .integrated()
                    .build()
            ).apply {
                // Activity TTP-6 ADDS to this set; Activity TTP-8 ADDS to it again.
                // Never rebuild the set from scratch in a later activity.
                configuration = UiConfiguration(
                    summaryFeatures = setOf(SummaryFeature.REFUND_TRANSACTION)
                )
            }
        } catch (t: Throwable) {
            // Leave isMposUiReady() == false so the payment guards show a message
            // instead of the app dying on launch.
            Log.e("PaymentApplication", "Tap to Pay SDK initialisation failed", t)
        }
    }

    companion object {
        lateinit var mposUi: MposUi
            private set

        fun isMposUiReady(): Boolean = ::mposUi.isInitialized

        /** True only when the SDK is ready AND this phone is enrolled. */
        fun isDeviceEnrolled(): Boolean =
            isMposUiReady() && mposUi.tapToPhone.isDeviceEnrolled()
    }
}
```

The named arguments above are **verified** against the SDK artifact — see § *`MposUi.create()` —
verified signature and parameter names* directly above, including the two overloads and why Tap to Pay
needs the 4-argument one.

> **`isMposUiReady()` is not a credential check.** It reports only that the object was constructed.
> With wrong or placeholder credentials, `create()` returns normally, `isMposUiReady()` returns
> `true`, and the real failure surfaces ~2 s later as an SDK-internal `NullPointerException` on the
> SDK's own dispatcher — which no application-side `try`/`catch` can intercept. The `catch` above
> handles construction failure only; it cannot see that one. To detect bad credentials, observe
> `tapToPhone.getMerchantInformation()` / `merchantInformationFlow()` for an empty
> `supportedCurrencies`. See § *Three Readiness States* below.

**Register it in `AndroidManifest.xml`** (at
`$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`) — without this the class never runs and every
payment call hits the `isMposUiReady()` guard. **Skip this step entirely if you extended an existing
`Application` subclass**, which is already registered:

```xml
<application
    android:name=".PaymentApplication"
    ... >
```

#### Java projects: keep this one class in Kotlin

`UiConfiguration` is a Kotlin type constructed with **named arguments and default values**
(`UiConfiguration(summaryFeatures = setOf(...))`), not a builder. Kotlin default arguments do not
exist in Java bytecode, so from Java you cannot supply `summaryFeatures` alone — you must pass
every positional parameter of whichever constructor overload the artifact actually publishes.

Two acceptable resolutions, in order of preference:

1. **Write `PaymentApplication` in Kotlin even in an otherwise-Java project** (add the
   `org.jetbrains.kotlin.android` plugin; the SDK already requires Kotlin ≥ the minimum in
   § *Minimum Build-Tool Requirements*). All the developer's other code stays Java —
   `PaymentApplication.getMposUi()` and `PaymentApplication.isMposUiReady()` are callable from Java
   unchanged. **This is the recommended path.**
2. **If the project must stay Java-only,** first read the constructor signature the artifact
   publishes, then write the call to match it exactly:

   ```bash
   # After ./gradlew assembleDebug has resolved the SDK — see § Resolution procedure for the
   # artifact path. Print the real constructor signatures rather than assuming one:
   javap -classpath /tmp/ttp-classes.jar <fully.qualified.UiConfiguration>
   ```

   Do **not** hand-write a `new UiConfiguration(...)` call speculatively. If the published
   signature cannot be read, use resolution 1.

Every activity file's other Java samples are ordinary Android code and are safe to use verbatim.

### What the Tap to Pay path can initiate — and what it cannot

The public builder exposes considerably more operations than the tap-to-phone accessory accepts. An app
that already has a transaction-type selector will therefore offer options this path cannot serve. Decide
from this table, not from the builder's method list — and never from a guess, because both directions of
guess have been observed in real integrations.

The set of card-present transaction types the Tap to Pay path serialises is **`CHARGE`, `REFUND`,
`VERIFICATION`** — those three, publicly readable as `io.mpos.taptophone.TransactionType`.

| Operation | Builder entry point | On Tap to Pay | Notes |
|-----------|---------------------|---------------|-------|
| Charge | `.charge(amount, currency)` | yes | Gate 5 |
| Pre-authorization | `.charge(amount, currency).autoCapture(false)` | yes | a `CHARGE` that is not auto-captured; there is no distinct pre-auth type. Gate 8 |
| Referenced refund | `.refund(transactionIdentifier)` | yes | Gate 6 |
| Stand-alone credit | `.refund(amount, currency)` | yes | card must be present. Gate 6 |
| Account verification | `.verification(currency)` | yes — takes **no amount** | Gate 9, gated on `ACCOUNT_VERIFICATION_REQUESTED`. See the note below |
| Capture | `.capture(transactionIdentifier)` | yes | a follow-up on an existing transaction, not a new card read. Gate 8 |
| Incremental authorization | `.incrementalAuthorization(identifier, amount, currency)` | only where the merchant is configured for it | Gate 8, gated on `INCREMENTAL_AUTH_REQUESTED` |
| Tip adjust | `.adjustTip(identifier, amount, currency)` | **no — do not offer** | TTP tipping is on-reader only; see § *Tipping builders* |
| Activation / balance inquiry / cashout | `.activation(...)`, `.balanceInquiry()`, `.cashout()` | **no** | gift-card operations |

> **Account verification is implemented by `act_TTP_09`, and it is the one capability whose recommended
> answer is "no".** `Q11` asks; most merchants do not need it. So an existing verification control has
> **two** correct treatments depending on that answer, and neither of them is "remove it":
>
> | `ACCOUNT_VERIFICATION_REQUESTED` | The control |
> |---|---|
> | `true` | Gate 9 **wires it up** and deletes any "not implemented" reason string |
> | `false` | **disabled with the reason "not implemented in this integration"** — never removed, because Tap to Pay genuinely can do it |
>
> Removing it on the false grounds that the platform cannot do it silently discards a capability the SDK
> offers and the merchant may be paying for.
>
> **What the builder actually gives you.** `.verification(currency)` returns `VerificationBuilder`, which
> sets `amount = BigDecimal.ZERO` in its own constructor. It has `customIdentifier`, `metadata`,
> `workflow`, `partnerSolutionId`, `merchantDetails`, `build()` — and **no `subject`, no `autoCapture`,
> no `includedTipAmount`, no `tipAdjustable`**. So a verification can never be a pre-auth and can never
> carry a tip, and no amount guard applies to it. `customIdentifier` **is** present and throws on a bad
> value exactly as it does on charge.
>
> **Confidence:** the API is verified against the artifact, and the reader ships its own localised
> verification strings (`ttp_present_card_verification`, `ttp_verification_approved`,
> `ttp_verification_declined`, `ttp_verification_aborted`, `ttp_verification_inconclusive`) — so the flow
> is wired end to end in the SDK. This skill has nonetheless exercised it on hardware far less than charge
> or refund. `act_TTP_09` Critical Rule 9 requires that to be stated in the gate report.

> **On-receipt tipping, by contrast, is not an SDK concept at all.** Every tipping strategy the SDK
> offers is an on-reader prompt (§ *Tipping builders*). A "tip on receipt" option in an existing UI has
> no Tap to Pay implementation and no future gate will add one, so **removing** that option is correct.

Verify the set against the resolved artifact rather than trusting this table — see § *Resolution
procedure — for a version this file has not verified* for how `$CP` is built:

```bash
javap -cp "$CP" io.mpos.taptophone.TransactionType
javap -cp "$CP" 'io.mpos.transactions.parameters.TransactionParameters$Builder'
```

### Builder chains switch type mid-chain — this SDK's house style

Several builders return a **different** type from the method that configures them. The unbroken
chains in the activity files all compile, but the moment anyone reorders a chain or extracts an
intermediate variable, the declared type matters:

| Start | Method | Returns | Where the rest of the members live |
|-------|--------|---------|------------------------------------|
| `TransactionParameters.Builder()` | `.charge(BigDecimal, Currency)` | `ChargeBuilder` | `autoCapture`, `subject`, `customIdentifier`, `includedTipAmount`, `tipAdjustable`, `withCashback`, `metadata`, `workflow`, `scheme`, `partnerSolutionId`, `build()` |
| `TransactionParameters.Builder()` | `.refund(String)` | `RefundBuilder` | `amountAndCurrency`, `subject`, `customIdentifier`, `workflow`, `build()` |
| `TransactionParameters.Builder()` | `.refund(BigDecimal, Currency)` | `StandaloneRefundBuilder` | `subject`, `customIdentifier`, `metadata`, `workflow`, `build()` |
| `TransactionParameters.Builder()` | `.capture(String)` | `CaptureBuilder` | `amountAndCurrency`, `build()` |
| `TransactionParameters.Builder()` | `.incrementalAuthorization(String, BigDecimal, Currency)` | `IncrementalAuthorizationBuilder` | `workflow`, `build()` |
| `AccessoryParameters.Builder(AccessoryFamily)` | `.integrated()` | `IntegratedBuilder` | `idleText`, `locale`, `build()` |
| `TippingProcessStepParameters.Builder()` | `.askForTipAmount()` etc. | one `AskFor*StepParametersBuilder` | see § *Tipping builders* |

Every terminal `build()` returns the **interface** type (`TransactionParameters`,
`AccessoryParameters`, `TippingProcessStepParameters`) — so declaring an intermediate variable as
`TransactionParameters.Builder` and then calling `.customIdentifier(...)` on it will not compile.

### `customIdentifier` is validated on-device, and the builder throws

`.customIdentifier(...)` — on `ChargeBuilder`, `RefundBuilder` and `StandaloneRefundBuilder` alike —
accepts only:

```
^[a-zA-Z0-9_-]{0,256}$
```

Letters, digits, underscore, hyphen. **No spaces, no periods, no currency symbols.** The SDK asserts
this inside the builder method and throws rather than returning an error:

```
io.mpos.errors.MposRuntimeException: custom identifier 'Pizza order' needs to follow the pattern
'^[a-zA-Z0-9_-]{0,256}$'
    at io.mpos.utils.UtilsKt.assertValidCustomIdentifier(Unknown Source:69)
    at io.mpos.transactions.parameters.ChargeBuilder.customIdentifier(Unknown Source:0)
```

**Verified from the SDK's own thrown exception on real hardware** — the pattern above is quoted from
the runtime message, not inferred from documentation. It is the authority for every gate.

Three consequences worth stating separately, because each one defeats a different assumption:

1. **It is not a transaction failure.** The throw happens while *building* parameters — before
   `createTransactionIntent()`, before any Activity starts, before any result callback exists. The
   `isMposUiReady()` / `isDeviceEnrolled()` guards and the `onChargeFailed` path cannot report it. The
   app crashes.
2. **It is stricter than the backend rule.** The backend `@SecureText` validator rejects `$`, `€`, `£`
   and similar in free-text fields, returning HTTP 400
   `TRANSACTION_ERROR_INVALID_TRANSACTION_REQUEST`; it permits spaces and ordinary punctuation. That
   rule governs `.subject(...)` and `.metadata(...)`. Applying its wording to `customIdentifier` is
   the mistake that produces examples like `"Fox donation 1.00"` — valid for `@SecureText`, fatal
   here.
3. **`{0,256}` is not portable into `grep -E`.** BSD grep (macOS default) caps bounded repetition at
   255, so the literal pattern is a *syntax error*: stderr message, empty stdout, exit 2 — which
   `&&`/`||` reads as "clean". Any check must test for a disallowed **character**
   (`[^a-zA-Z0-9_"-]`) instead of matching the whole pattern.

The canonical validator lives in `act_TTP_05` Step 1b; Gates 6 and 8 call it rather than restating
the regex.

### Tipping builders

`TippingProcessStepParameters.Builder()` is a **selector**: each `askFor*` method returns a
different specialised builder, and `.build()` on that builder returns
`TippingProcessStepParameters`.

| Selector method | Returns | Notable members |
|-----------------|---------|-----------------|
| `askForTipAmount()` | `AskForTipAmountStepParametersBuilder` | `suggestedTipAmount`, `suggestedTipPercentage`, `showAddTipConfirmationScreen`, `showTotalAmountConfirmationScreen`, `numberFormat(int, int)`, **`maxTipAmount`**, **`maxTipPercentage`** |
| `askForTotalAmount()` | `AskForTotalAmountStepParametersBuilder` | same set, plus `zeroAmountDefaultsToTransactionAmount` |
| `askForPercentageChoice()` | `AskForTipPercentageChoiceStepParametersBuilder` | `percentages(BigDecimal, BigDecimal, BigDecimal)`, `custom(CustomTipParametersBuilder)`, `showTotalAmountConfirmationScreen` |
| `askForPercentageAmount()` | `AskForPercentageAmountStepParametersBuilder` | `minPercentage`, `maxPercentage`, `showTotalAmountConfirmationScreen` |
| `askForFixedPercentageAmount()` | `AskForFixedPercentageStepParametersBuilder` | `fixedPercentage` |

`TransactionProcessParameters.Builder()` exposes exactly `addStep(ProcessStepParameters)` and
`build()`.

> **`maxTipAmount(...)` exists.** It is published on `AskForTipAmountStepParametersBuilder` and
> `AskForTotalAmountStepParametersBuilder` in `2.115.0`. It is **not** available on the
> percentage-based builders — a tip ceiling expressed as a percentage uses `maxTipPercentage`
> instead. Earlier revisions of this skill told agents the method might not exist; that guidance
> is withdrawn.

### `Transaction` — nullability and status values

| Fact | Value |
|------|-------|
| `MposUi.getLatestTransaction()` | annotated **`@Nullable`** — a null-safe call (`transaction?.amount`) is correct, not a redundant one |
| `MposUi.getLastExecution()` | also `@Nullable` |
| every other `MposUi` member | `@NotNull` |
| `io.mpos.transactions.Transaction` | a `public final class` (not an interface) |
| tip accessor | `transaction.details.includedTipAmount` — `TransactionDetails.getIncludedTipAmount(): BigDecimal` **confirmed present** |

`TransactionStatus` members (useful for decline messaging; never published in the docs):
`UNKNOWN`, `INITIALIZED`, `PENDING`, `ACCEPTED`, `APPROVED`, `DECLINED`, `ERROR`, `ABORTED`,
`INCONCLUSIVE`. The enum also exposes `isFinal()` and `isFinalAndNotApprovedOrAccepted()`.

> **Never log a `Transaction`, a `TransactionDetails`, or a payment-details object — not even at
> `Log.d`.** This holds for every gate, and in debug builds as much as release builds.
>
> - **Safe to log:** the `transactionIdentifier`, the `TransactionStatus`, the amount, the currency, and
>   an `MposError`'s code and message.
> - **Never logged:** the `Transaction` object itself, its `details`, or any card, cardholder or scheme
>   attribute reached through them — including via string interpolation (`"approved: $transaction"`) or an
>   implicit `toString()`. A `toString()` on a payment object prints whatever the SDK chose to expose, and
>   the skill does not control that.
>
> **Why this is not merely a production concern.** This product is PCI MPoC certified and the certified
> boundary is the Tap to Pay Ready app, not the merchant application — writing payment details into logcat
> moves data across that boundary and into anything that later collects a bug report or a device log
> capture. A `Log.d` added "just for testing" is also the single most commonly shipped line of code there
> is. If a developer needs to confirm a tap succeeded, log the identifier and the status and look the rest
> up with `transactionModule`.

### Finding a past transaction — `transactionModule`

> **A `Transaction` is a record on the Visa Acceptance platform. The app does not create it, own it, or
> store it.** The SDK produces it as the result of a tap and the platform is the source of truth from that
> moment on. Consequently:
>
> - **There is no design decision about "persisting transactions".** The app has no transaction table, no
>   Room entity, no local database of sales, and needs none. Do not ask the developer whether to store
>   them, and do not propose a persistence layer for them.
> - **"Transaction history" means a query, not local storage.** Gate 4's `Transactions` screen is a
>   paginated view over `queryTransactions` — a read of platform state that is correct on a fresh install,
>   after clearing app data, and from a second device enrolled to the same merchant.
> - **"Persist the identifier" is a different instruction, and it is narrow.** Gates 5, 6 and 8 persist a
>   single `String` — the `transactionIdentifier` — because a hold or a refundable sale must survive
>   process death and there is no other way to name it later. That is a lookup key, not a copy of the
>   record. Persisting the key is required; persisting the record is wrong.

`MposUi.latestTransaction` returns **only the most recent** transaction. Refund and capture both accept
an *arbitrary* identifier (`.refund(id)`, `.capture(id)`), so anything beyond "refund the last sale"
needs a way to obtain an older identifier. That is `transactionModule`, a property on the same `MposUi`
instance the integration already holds — no second entry point to construct.

| Member | Signature | Notes |
|--------|-----------|-------|
| `MposUi.transactionModule` | `TransactionModule` | `io.mpos.transactionprovider.TransactionModule`. Non-null |
| lookup one | `lookupTransaction(String identifier, LookupTransactionListener)` | callback `onCompleted(String identifier, Transaction?, MposError?)` |
| query a page | `queryTransactions(FilterParameters, boolean includeReceipts, int offset, int limit, QueryTransactionsListener)` | the overload to use — the 2-arg one defaults to offset 0 / limit 20 |
| query, defaults | `queryTransactions(FilterParameters, QueryTransactionsListener)` | offset 0, limit 20 |
| callback | `onCompleted(FilterParameters, boolean includeReceipts, int offset, int limit, List<Transaction>?, MposError?)` | **one** callback carries both the list and the error |
| email a receipt | `sendCustomerReceiptForTransaction(String identifier, String email, SendReceiptListener)` | |
| offline equivalent | `MposUi.offlineModule` | same `lookupTransaction` / `queryTransactions` shape |

`FilterParameters` is built, not constructed — `FilterParameters.Builder()` with `customIdentifier(String)`,
`setStartDate(Date)` / `setStartDateMillis(long)`, `setEndDate(Date)` / `setEndDateMillis(long)`,
`setSerialNumber(String)`, then `build()`. An empty builder is a legal "everything" filter.

> **Both results arrive in one callback, so check the error first.** `onCompleted` receives the list
> *and* the `MposError` together, and the list is nullable. `transactions ?: emptyList()` without first
> testing `error` renders an empty history that looks like "this merchant has no transactions" when it
> actually means the query failed. That is the same silent-empty failure shape as an unset `SOURCE_ROOT`.

> **These calls are asynchronous.** Nothing is returned from `queryTransactions` itself. A function that
> queries and then reads a list on the next line always sees the pre-query value.

Pagination has no total count and no `hasMore` flag. The contract is positional, so derive both from the
page you received:

```kotlin
// After each page: advance by what actually arrived, and treat a short page as the end.
nextOffset += received.size
if (received.size < pageSize) endReached = true
```

`Transaction.amount` and `Transaction.currency` are **nullable** on a queried transaction even though the
same fields are populated on an approved one — render them defensively
(`amount?.setScale(2, RoundingMode.HALF_UP)?.toString() ?: "—"`).

### `TapToPhone` — complete member list

```
var  tapToPhoneConfiguration: TapToPhoneConfiguration

fun  enrollDevice(activity: Activity, requestCode: Int)                       // legacy
fun  reEnrollDevice(activity: Activity, serialNumber: String, requestCode: Int) // legacy
fun  getEnrollDeviceIntent(activity: Activity): Intent                        // preferred
fun  getReEnrollDeviceIntent(activity: Activity, serialNumber: String): Intent // preferred
fun  isDeviceEnrolled(): Boolean
fun  deviceEnrolledFlow(): Flow<Boolean>
fun  getMerchantInformation(): MerchantInformation?          // @Nullable — see below
fun  merchantInformationFlow(): Flow<MerchantInformation>    // @NotNull flow, non-null element
```

The `getXIntent` variants are what the **Activity Result API**
(`rememberLauncherForActivityResult` / `registerForActivityResult`) requires. Prefer them —
`enrollDevice(activity, requestCode)` forces the deprecated `onActivityResult` path, which many
projects' lint or detekt configuration rejects outright. See `act_TTP_03`.

`MerchantInformation` is a Kotlin data class exposing `merchantId: String`,
`enrolledSerialNumber: String`, and `supportedCurrencies: Set<String>` — all three `@NotNull`. Note
that `supportedCurrencies` is a `Set<String>` of currency codes, **not** a set of
`io.mpos.transactions.Currency` enum values, so comparing against `TRANSACTION_CURRENCY` is a string
comparison.

## Money — the amount type, and how to reach it from what the app already has

Every SDK amount parameter is a **`java.math.BigDecimal`**. Real applications rarely store money that
way: a menu item is a `Double`, a cart total is a `Double`, and the screen already holds a formatted
`String`. Converting between them is where wrong amounts enter, and a wrong amount is charged
successfully — nothing reports it.

**Two conversions are wrong, and both look reasonable:**

```kotlin
// WRONG #1 — binary floating point. 0.1 + 0.2 is not 0.3, and the SDK receives the error.
BigDecimal(orderTotal)                     // e.g. 3.2000000000000001776356839400250464677810668945312

// WRONG #2 — locale-dependent. In a locale using a comma decimal separator ("3,20"),
// BigDecimal's constructor throws NumberFormatException. It works in the developer's locale
// and fails in the customer's.
BigDecimal("%.2f".format(orderTotal))
```

**The correct conversion:**

```kotlin
import java.math.BigDecimal
import java.math.RoundingMode

// BigDecimal.valueOf(double) goes through the canonical decimal string, so it does NOT inherit the
// binary representation error. setScale(2, HALF_UP) then fixes the scale to minor units and applies
// an explicit, stated rounding policy.
val amount: BigDecimal = BigDecimal.valueOf(orderTotal).setScale(2, RoundingMode.HALF_UP)

// Validate before starting a transaction. Both of these are money-moving defects.
require(amount.signum() > 0) { "amount must be positive" }
require(amount.scale() == 2) { "amount must be at scale 2" }
```

If the source is already a `String`, parse it **locale-independently** — `BigDecimal("3.20")`, never a
locale-formatted one. If it is `Int`/`Long` minor units, use
`BigDecimal.valueOf(minorUnits, 2)`.

| Rule | Why |
|------|-----|
| Never `BigDecimal(double)` | inherits binary floating-point error into the charged amount |
| Never parse a locale-formatted string | throws or truncates wherever the decimal separator differs |
| Always `setScale(2, RoundingMode.HALF_UP)` | most currencies are 2-minor-unit; make rounding explicit rather than implicit |
| Always assert positive and scale-2 before starting | the SDK will happily charge a wrong amount, and report success |
| Prefer fixing the app's own model | a `Double` money field is the root cause; a conversion at the call site is a patch over it |

> **Zero-decimal and three-decimal currencies exist** (JPY has 0 minor units; BHD, KWD, TND have 3).
> Scale 2 is correct for the common case and for every currency this skill's examples use. If
> `TRANSACTION_CURRENCY` is one of the exceptions, say so to the developer rather than silently
> forcing scale 2 — and confirm the SDK's expectation for that currency before charging.

> **What actually happens if you skip this: the amount is silently changed, not rejected.** The Tap to
> Pay gateway applies `setScale(<currency exponent>, HALF_UP)` to the amount when it serialises the
> request. A scale-3 total of `2.189` is therefore sent as `2.19`: the transaction **succeeds**, the
> customer is charged an amount the app never computed, and nothing reports a discrepancy. Do not
> expect a validation error to catch this — unlike `customIdentifier`, there is no builder-time
> assertion on the amount. This is why the `require(...)` lines above are the app's own job.

### Derived amounts — round after the arithmetic, exactly once

The scale problem rarely arrives in the amount *source*. It arrives in the arithmetic done to it, so an
integration that correctly converts `orderTotal` can still charge the wrong amount:

| Operation | Example | Result |
|-----------|---------|--------|
| percentage service charge | `1.99 × 1.10` | `2.189` — scale 3 |
| percentage discount | `4.99 × 0.85` | `4.2415` — scale 4 |
| tax at a rate | `9.99 × 1.0825` | `10.814175` — scale 6 |
| split across covers | `10.00 ÷ 3` | non-terminating — `divide` **throws** without a scale |

Compose the total at full precision, then fix the scale **once, on the value actually charged**.
Rounding each component instead double-rounds and drifts:

```kotlin
val subtotal = lineItems.fold(BigDecimal.ZERO) { acc, i -> acc + i.unitPrice * BigDecimal(i.quantity) }
val withServiceCharge = subtotal + subtotal * serviceChargeRate   // e.g. 0.10 → scale 3 or more

// The ONLY rounding step, applied to the total that will be charged.
val amount = withServiceCharge.setScale(2, RoundingMode.HALF_UP)
require(amount.signum() > 0) { "amount must be positive" }
require(amount.scale() == 2) { "amount must be at scale 2" }
```

> **Charge and display the same value.** If the UI formats `withServiceCharge` while the SDK charges
> `amount`, the receipt disagrees with the charge on every basket where rounding moved the total. Round
> first, then use the rounded `BigDecimal` for **both** the display and the transaction.

`BigDecimal.divide` throws `ArithmeticException` on a non-terminating result, so always pass a scale and
a `RoundingMode` when splitting a total. And when a split is charged as several transactions, the parts
must sum to the whole — allocate the rounding remainder to one part rather than rounding each part
independently.

**The planning gate records the source's type and unit**, so implementation agents convert rather than
guess — see `payment_amount_source` and `payment_amount_type` in `act_TTP_00_planning.md`. It records
the *source*, not the arithmetic applied afterwards; a service charge, discount or tax added at the call
site is exactly the case the record cannot capture, so the rounding above is the implementing gate's
responsibility.

---

## Result handling — one pattern per toolkit, reused by every transaction gate

Every transaction the SDK runs — charge, refund, stand-alone credit, pre-auth, incremental
authorization, capture, and the built-in summary actions — returns through the **same** result
channel under `MposUi.REQUEST_CODE_PAYMENT`. So the result site is shared infrastructure that Gate 5
establishes and Gates 6–9 extend. Getting its shape right once avoids a class of duplication bug in
every later gate.

**Branch on `UI_TOOLKIT` from `project-plan.md`. Never mix the two patterns in one Activity.**

### `UI_TOOLKIT = views` — exactly one `onActivityResult` per Activity

Gate 5 creates it; Gates 6–9 **extend** it. A second override is a duplicate, not an extension, and
the second one silently wins or the first one silently stops running.

`super.onActivityResult(...)` first, then discriminate on the operation, then on the result code.

### `UI_TOOLKIT = compose` — exactly one launcher, plus a **saveable** discriminator

There is no `onActivityResult` to extend. Gate 5 registers one launcher; Gates 6–9 extend *that
callback*. Do not add `onActivityResult`, `startActivityForResult`, `findViewById`, or layout XML to a
Compose project — several projects' lint or detekt configurations reject the deprecated path outright,
and a Compose project has no layout XML to edit in the first place.

```kotlin
// The operation in flight MUST be saveable. It is read after the SDK Activity returns, and the
// host Activity can be recreated while that Activity is in front (rotation, dark-mode switch,
// system memory pressure). With a plain `remember` the discriminator resets to null, the result
// arrives as "unknown operation", and an APPROVED transaction's identifier is never persisted —
// which orphans a pre-auth hold or misattributes a refund. `rememberSaveable`, a ViewModel with
// SavedStateHandle, or SharedPreferences all work; a plain `remember` does not.
//
// Both values below are Bundle-safe — an enum and a String — and that is not incidental. This does
// NOT generalise to "state read after the SDK returns belongs in rememberSaveable": an io.mpos.*
// object there CRASHES at onSaveInstanceState. See the CRITICAL note below this snippet.
var pendingOperation by rememberSaveable { mutableStateOf<PaymentOperation?>(null) }
var pendingAmount by rememberSaveable { mutableStateOf<String?>(null) }   // scale-2 string

val paymentLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.StartActivityForResult()
) { result ->
    val operation = pendingOperation
    pendingOperation = null
    val transaction = PaymentApplication.mposUi.latestTransaction
    when (result.resultCode) {
        MposUi.RESULT_CODE_APPROVED -> {
            val id = result.data?.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)
            when (operation) {
                PaymentOperation.CHARGE            -> onChargeApproved(transaction, id)
                PaymentOperation.REFUND            -> onRefundApproved(transaction, id)
                PaymentOperation.PRE_AUTH          -> onPreAuthApproved(transaction, id)
                PaymentOperation.INCREMENTAL_AUTH  -> onIncrementApproved(transaction)
                PaymentOperation.CAPTURE           -> onCaptureApproved(transaction)
                null -> Log.w("TTP", "Result with no pending operation — do not guess; report it")
            }
        }
        MposUi.RESULT_CODE_FAILED -> onOperationFailed(operation, transaction)
        // any other code = the shopper backed out before the tap
    }
}
```

Set `pendingOperation` **immediately before** `launch(intent)`, and clear it only after handling or
on launch failure.

`MposUi.RESULT_CODE_APPROVED` / `RESULT_CODE_FAILED` and
`MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER` apply identically in both toolkits. **Never test
`Activity.RESULT_OK`** in either.

> **A `null` operation is a bug to report, never a value to guess.** Defaulting it to `CHARGE`
> misattributes a refund or a capture, and the misattribution is silent.

#### CRITICAL — `rememberSaveable` holds Bundle-safe values ONLY. Never an SDK object.

**Treat every type in `io.mpos.*` as not Bundle-safe** — `Transaction`, `TransactionParameters`,
`Currency`, `MposUi` and their neighbours. `rememberSaveable` writes through a `SaveableStateRegistry`
backed by the Activity's saved-state `Bundle`, so it accepts primitives, `String`, enums, and types with
an explicit `Saver`. Hand it an SDK model and the app **crashes the moment the host Activity is stopped**:

```text
java.lang.IllegalStateException: MutableState(value=io.mpos.transactions.Transaction@…)
cannot be saved using the current SaveableStateRegistry
    at ...SaveableStateRegistryImpl.performSave
    ... onSaveInstanceState
```

**This is a launch-time crash on every money-moving flow, not a rare edge case.** Stopping the host
Activity is exactly what happens when the SDK's own payment Activity comes to the front — so the crash
fires on the *first* tap of charge, refund, capture or verification, on the way *in*. Nothing catches it
earlier: the code compiles, both quality baselines pass, and `Transaction` is a perfectly ordinary
parameter type everywhere else.

**Saveable state and screen state are different jobs. Split them:**

| Job | Hold it as | Why |
|-----|-----------|-----|
| the operation in flight | `rememberSaveable` **enum** | read after the SDK Activity returns; an enum is Bundle-safe |
| an amount in flight | `rememberSaveable` **scale-2 `String`** | never a `BigDecimal` — convert at the edges |
| **which** transaction a screen is acting on | `rememberSaveable` **`String` identifier** | the identifier is the lookup key, and it is Bundle-safe |
| the `Transaction` object itself | plain `remember`, a ViewModel, or re-resolve it | never `rememberSaveable`, at any nesting depth |

So a detail screen holds the **identifier** across recreation and resolves the record from it:

```kotlin
// The KEY is saveable. The RECORD is not, and does not need to be.
var selectedId by rememberSaveable { mutableStateOf<String?>(null) }

// Resolve it from the list the history screen already loaded; fall back to the platform after
// process death, when that list is gone too. Either way the object itself is never saved.
val selected: Transaction? = remember(selectedId, items) {
    items.firstOrNull { it.identifier == selectedId }
}   // if null and selectedId != null, call lookupTransaction(selectedId) — see § transactionModule
```

**Passing a `Transaction` as a composable parameter is correct and unaffected by this rule.** A
`@Composable fun TransactionDetailActions(transaction: Transaction)` signature is right, and Gate 4
requires it — the later gates read `status`, `isRefunded` and `isCaptured` off it. What is forbidden is
*storing* that object in saveable state. A function parameter is not saved state; do not narrow the
signature to a `String` to satisfy this rule.

This is the same principle as § *Finding a past transaction* — **persist the key, never the record.** It
applies to state as well as to storage: the key goes in the `Bundle`, the record is re-obtained.

### `UI_TOOLKIT = mixed`

Apply the branch matching each individual screen. A Views Activity keeps its single
`onActivityResult`; a Compose screen keeps its single launcher. One Activity never gets both.

### The built-in summary screen needs its own launcher

`MposUi` can also start a **summary** Activity from which the user triggers a refund or capture
themselves. Its result is not a transaction result and must not be routed through the transaction
callback — register a separate launcher (Compose) or discriminate on request code (Views). Treat its
outcome as **uncertain** unless the SDK reports a transaction: do not adjust locally persisted
amounts on the assumption that a built-in action succeeded.

---

#### `TapToPhone` nullability — the one that costs a build cycle

The `Transaction` nullability table above covers **`MposUi` only**. These two members are on
`TapToPhone`, and they behave differently from each other:

| Member | Annotation | What that means for your code |
|--------|-----------|-------------------------------|
| `getMerchantInformation()` | **`@Nullable`** | Returns `MerchantInformation?`. `getMerchantInformation().supportedCurrencies` **does not compile** from Kotlin. Use `?.supportedCurrencies.orEmpty()`. |
| `merchantInformationFlow()` | `@NotNull`, non-null element type | The flow and its `MerchantInformation` are both non-null. Do **not** "correct" this to a nullable type. |

**But the observed state is still nullable, and that is not a contradiction.**
`merchantInformationFlow()` returns a cold `Flow`, not a `StateFlow` — so collecting it in Compose
requires an initial value, and there is no `MerchantInformation` you could invent for it:

```kotlin
// The initial value can only be null: a cold Flow has no current value, and
// getMerchantInformation() is itself @Nullable, so it cannot supply one either.
val merchantInformation by tapToPhone.merchantInformationFlow()
    .collectAsState(initial = null)

// Correct read — null and empty mean the same thing here:
val currencies = merchantInformation?.supportedCurrencies.orEmpty()
```

The nullability enters at the **collection site**, not in the SDK signature. Writing
`State<MerchantInformation>` and expecting it to compile is the mistake; the fix is `?.` and
`orEmpty()`, not a change to how the flow is documented.

**A null `MerchantInformation` and an empty `supportedCurrencies` mean the same thing: the merchant
configuration has not loaded.** So null is not an edge case to defend against — it is the *initial*
state every observer sees first, before any network round trip completes. Handle both with
`?.supportedCurrencies.orEmpty()` and treat "empty" as the single "not ready / credentials wrong"
condition.

This matters more than a normal signature nit, because this is the API the skill nominates for
detecting bad credentials — see § *Three Readiness States*, `act_TTP_03` Step 7, `act_TTP_02`
Step 4.

`SerialNumberInputMethod` members: `DEVICE_LIST` (default), `MANUAL_INPUT`,
`AUTO_ASSIGN_NEW_SERIAL_NUMBER`.
`ConfirmationScreenOption` members: `SHOW_WITH_SERIAL_NUMBER` (default), `SKIP`.

### Resolution procedure — for a version this file has not verified

**Never guess or invent an import path.** Read it out of the resolved artifact:

```bash
# 1. Locate everything Gradle resolved for the group
find ~/.gradle/caches/modules-2/files-2.1/io.payworks \
  \( -name "*.aar" -o -name "*.jar" \) 2>/dev/null

# 2. Build a classpath. Android .aar files carry their bytecode in an embedded classes.jar.
W=/tmp/ttp-verify; rm -rf $W; mkdir -p $W/jars
for a in $(find ~/.gradle/caches/modules-2/files-2.1/io.payworks -name "*.aar"); do
  unzip -o -q -j "$a" classes.jar -d $W/tmp 2>/dev/null \
    && mv $W/tmp/classes.jar "$W/jars/$(basename "$a" .aar).jar"
done
for j in $(find ~/.gradle/caches/modules-2/files-2.1/io.payworks -name "*.jar" \
             ! -name "*sources*" ! -name "*javadoc*"); do cp "$j" "$W/jars/"; done

# 3. Every fully-qualified class name the group publishes
for j in $W/jars/*.jar; do unzip -l "$j" | awk '{print $4}' | grep '\.class$' \
  | sed 's|/|.|g; s|\.class$||'; done | sort -u > $W/all-classes.txt

# 4. Find a type — and see EVERY candidate, so decoys surface
grep -E '(^|\.)Currency$' $W/all-classes.txt

# 5. Read real signatures rather than assuming them
CP=$(ls $W/jars/*.jar | tr '\n' ':')
javap -cp "$CP" io.mpos.paybutton.UiConfiguration
javap -cp "$CP" 'io.mpos.paybutton.UiConfiguration$SummaryFeature'   # quote the $
```

Two techniques worth knowing, because plain `javap` cannot answer either question:

```bash
# Kotlin PARAMETER NAMES (javap shows types only) — read the @kotlin.Metadata d2 array.
# Companion-object functions like MposUi.create() live on the $Companion class.
javap -v -cp "$CP" 'io.mpos.paybutton.MposUi$Companion' | grep -o 'd2=\[[^]]*\]'

# NULLABILITY — Kotlin emits org.jetbrains.annotations.@Nullable/@NotNull with CLASS
# retention, so they land in RuntimeInvisibleAnnotations. Resolve the constant-pool index:
javap -v -cp "$CP" io.mpos.paybutton.MposUi | grep -B2 -A4 'getLatestTransaction'
javap -v -cp "$CP" io.mpos.paybutton.MposUi | grep -E '#[0-9]+ = Utf8 .*annotations'
```

In an IDE, the equivalent for step 4 is to type the unqualified name, accept the auto-import, and
read back the generated `import` line — but that silently picks one of the decoys above without
telling you the others existed. Prefer the classpath listing.

**`$GRADLE_MODULE_PATH:assembleDebug` is the proof.** A wrong import is a compile error, so a passing build
is the acceptance signal for every name in this section.

## Minimum Build-Tool Requirements

These are the **absolute minimums** for the Tap to Pay SDK to compile and function. If the
project's current version is **at or above** the minimum, leave it unchanged (never downgrade).

| Constant | Value | Reason |
|----------|-------|--------|
| `MIN_AGP_VERSION` | `8.2.0` | Android Gradle plugin required by the SDK |
| `MIN_KOTLIN_VERSION` | `2.1.0` | Kotlin Gradle plug-in required by the SDK |
| `REQUIRED_JAVA_VERSION` | `17` | SDK requires Java 17 source/target compatibility. The Kotlin JVM target must resolve to 17+ by **whichever mechanism the project's toolchain uses** — `kotlin { compilerOptions { jvmTarget } }` or `jvmToolchain(17)` on AGP 8.1+/Kotlin 2.x, the legacy `android { kotlinOptions { } }` block only on older ones, or AGP's own alignment with `compileOptions`. Do not require a literal `jvmTarget` line. |
| `MIN_SDK_VERSION` | `31` | Android 12 (API 31) is the minimum supported OS |

**No upper bound is published.** The highest toolchain this skill has been observed to build
successfully against is **AGP 9.2.1 / Kotlin 2.3.21 / Java 21** (2026-08-05, `2.115.0`). AGP 9
changed several defaults relative to AGP 8 — notably `buildConfig` being off unless requested
(see `act_TTP_02`) — so treat AGP 9 as validated but keep the AGP-9 notes in the activity files
in view.

### `buildConfig` is opt-in on AGP 8+

`android.buildFeatures.buildConfig` defaults to **false**. `BuildConfig.TTP_MERCHANT_ID` does not
exist until it is explicitly enabled, and the failure reads as "unresolved reference: BuildConfig",
which looks like a missing import rather than a missing feature flag. See `act_TTP_02` Step 3.

### multiDex

The SDK plus the Default UI plus a typical app comfortably exceeds the 64K method limit.
`multiDexEnabled = true` is effectively mandatory on any project whose `minSdk` is at the floor.
Projects at `minSdk 31` get native multidex from the platform, so no support library is needed —
but the flag must still be set if the build reports a dex-limit error. Expect a large debug APK
(**~150 MB** observed with Compose + this SDK): USB installs are slow, not broken.

## Project Path Variables

**Never hardcode `app/`, and never assume the invocation directory is the Gradle root.** A great
many real Android projects have no `app` module, keep sources under `src/main/kotlin`, have no
`res/layout/` at all (Compose), and live inside a larger multi-project build — in which case the
wrapper and settings file are in an *ancestor* directory, not the current one.

Every path in the TTP activity files is expressed relative to these variables, resolved **once** by
the planning gate (`act_TTP_00_planning.md`) and recorded in `project-plan.md`:

| Variable | Meaning | Examples |
|----------|---------|----------|
| `GRADLE_ROOT` | **Absolute.** Nearest ancestor holding `settings.gradle[.kts]`. Owns `gradlew`, `gradle/wrapper/`, `local.properties`, `project-plan.md` | `/src/pos-monorepo` |
| `ANDROID_MODULE_DIR` | The Android application module, **relative to `GRADLE_ROOT`**. Owns `build.gradle[.kts]`, `src/`, `proguard-rules.pro` | `app`, `.`, `apps/pos` |
| `GRADLE_MODULE_PATH` | That module's Gradle task path. Empty when the root project *is* the app module | `:app`, `:apps:pos`, `""` |
| `SOURCE_ROOT` | Main source directory inside the module, relative to `GRADLE_ROOT` | `app/src/main/java`, `apps/pos/src/main/kotlin` |
| `UI_TOOLKIT` | `views` \| `compose` \| `mixed` — decides which wiring branch the activities take | — |
| `SKILL_DIR` | **Absolute.** This skill's own directory. Only ever read from | — |

### The path preamble — run this at the start of every gate, and in every shell

Resolution belongs to the planning gate and is not repeated. Every other gate *loads* the answers:

```bash
# Read from project-plan.md. All subsequent commands run from the Gradle root, which is what
# makes the three relative values well-defined.
GRADLE_ROOT=<gradle_root>                  # absolute, from project-plan.md
cd "$GRADLE_ROOT" || exit 1

ANDROID_MODULE_DIR=<android_module_dir>    # relative to GRADLE_ROOT
GRADLE_MODULE_PATH=<gradle_module_path>    # e.g. :app — may be empty
SOURCE_ROOT=<source_root>                  # relative to GRADLE_ROOT

# Fail loudly rather than grepping paths that do not exist.
[ -d "$SOURCE_ROOT" ] || { echo "FAIL: SOURCE_ROOT '$SOURCE_ROOT' does not exist"; exit 1; }
[ -f "$GRADLE_ROOT/gradlew" ] || echo "WARN: no gradlew at the Gradle root"
```

> **Shell state does not persist between tool calls.** Each Bash invocation is a fresh process: the
> `cd` above and all four variables are gone by the next one. "Run this at the start of every gate"
> therefore means *at the start of every command block that uses these values* — not once per gate.
>
> This matters because the failure is silent rather than loud. An unset `$SOURCE_ROOT` expands to the
> empty string, so `grep -rn 'pattern' "$SOURCE_ROOT"` becomes a grep with a missing operand or a
> search of the wrong tree: **zero matches, exit status 1** — the signature this file warns about two
> sections down, and indistinguishable from *checked and clean*. The `[ -d "$SOURCE_ROOT" ]` guard is
> what converts that into a reportable `FAIL`, which is why it is not optional.

### Which variable owns which file

Getting this wrong is the single most common way a correctly-configured project fails every gate.

| File | Lives under |
|------|-------------|
| `gradlew`, `gradle/wrapper/gradle-wrapper.properties` | `$GRADLE_ROOT` |
| `settings.gradle[.kts]`, `local.properties`, `gradle/libs.versions.toml` | `$GRADLE_ROOT` |
| `project-plan.md` | `$GRADLE_ROOT` |
| root `build.gradle[.kts]` | `$GRADLE_ROOT` |
| module `build.gradle[.kts]`, `proguard-rules.pro`, `src/` | `$GRADLE_ROOT/$ANDROID_MODULE_DIR` |
| `AndroidManifest.xml` | `$ANDROID_MODULE_DIR/src/main/` |
| application sources | `$SOURCE_ROOT` |

### The build command

This exact form. Copy it; do not improvise a variant.

```bash
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" \
  > /tmp/ttp-build.log 2>&1
BUILD_EXIT=$?
tail -30 /tmp/ttp-build.log
[ "$BUILD_EXIT" -eq 0 ] \
  && echo "BUILD OK (exit 0)" \
  || echo "BUILD FAILED (exit $BUILD_EXIT) — this gate is FAIL"
```

Never a bare `./gradlew assembleDebug`. Three independent reasons:

1. `./gradlew` does not exist in a submodule directory, so the command fails on something the gate
   never touched.
2. A bare `assembleDebug` at the root of a multi-project build assembles **every** Android module.
   The gate then pays for unrelated modules and inherits their failures as its own — a gate reports
   `FAIL` for a compile error in a module it never opened.
3. Redirect, then check, then read. **Never pipe the build** — see the next section.

`:assembleDebug` (empty `GRADLE_MODULE_PATH`) is valid, and means the root project's task.

### CRITICAL — never pipe the build command

**Nine places in this skill point at this section by name.** It is the rule that makes every gate's
build check mean something.

```bash
# CORRECT — redirect, capture the status, then read the log.
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" > /tmp/ttp-build.log 2>&1
BUILD_EXIT=$?

# WRONG — every one of these reports the FILTER's exit status, not Gradle's.
"$GRADLE_ROOT/gradlew" ... | tail -30          # tail almost always succeeds -> exit 0
"$GRADLE_ROOT/gradlew" ... | grep -i error     # grep "fails" when the build is CLEAN -> inverted
"$GRADLE_ROOT/gradlew" ... | tee build.log     # tee succeeds -> exit 0
```

In a pipeline the shell reports the **last** command's exit status. A filter essentially always
succeeds, so a failed build reports `0` and the gate certifies broken code as `PASS`. That silently
disables gate-to-gate build gating — the single property the gates exist to provide — and the damage is
invisible until a later gate fails on an error an earlier one introduced.

Two further rules follow from the same reasoning:

- **Never infer success from output text.** The absence of the word `error` is not an exit status. A
  build can fail with `FAILURE: Build failed with an exception` and no line matching `error:`.
- **Capture `$?` on the very next line.** Any command in between overwrites it — including the `echo`
  you added to debug the problem.

If a pipe is genuinely unavoidable, set `-o pipefail` or test `${PIPESTATUS[0]}`. But
redirect-then-check is simpler, portable, and leaves a log to read afterwards.

> This rule applies to **every** long-running command whose status a gate acts on, not only
> `assembleDebug` — the quality tasks (`detekt`, `lintDebug`) and `gradlew tasks --all` have the same
> failure mode.

### Locating the merged manifest — never hardcode the path

Several checks in this skill can only be answered by the **merged** manifest: the `supportsRtl`
override (`act_TTP_01` Step 4) and `EnrollDeviceActivity`'s theme (`act_TTP_03` Step 4). The source
manifest does not contain library contributions, so reading it instead answers a different question.

AGP has moved this output, and the two layouts do not overlap:

| AGP | Path under `$ANDROID_MODULE_DIR/build/intermediates/` |
|-----|------------------------------------------------------|
| 7.x | `merged_manifests/debug/AndroidManifest.xml` |
| 8.x | `merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml` |

So **resolve it, do not spell it**:

```bash
# Requires a completed assembleDebug — the merged manifest is a build output.
MERGED_MANIFEST=$(find "$ANDROID_MODULE_DIR/build/intermediates" \
  -path '*merged_manifest*' -name AndroidManifest.xml 2>/dev/null | grep -i '/debug' | head -1)

if [ -z "$MERGED_MANIFEST" ]; then
  echo "NOTE: no merged manifest found — run assembleDebug first. Any merge check is UNMEASURED,"
  echo "      which is not the same as 'clean'. Do not report a merge-related item as OK from here."
else
  echo "MERGED_MANIFEST=$MERGED_MANIFEST"
fi
```

> **Why this is worth a helper.** A hardcoded path plus `2>/dev/null` — the shape this skill shipped
> for the `supportsRtl` check — produces *empty output and no error* on the AGP version it does not
> know about. Empty output is exactly what "checked and clean" looks like, so the check silently
> stops measuring the thing it exists to measure, on the newer AGP that most projects now use. Print
> the resolved path, and say `UNMEASURED` when there isn't one.

```bash
./gradlew assembleDebug 2>&1 | tail -10        # WRONG — reports exit 0 on a FAILED build
```

In a pipeline the shell reports the **last** command's exit status. `tail` essentially always
succeeds, so a failed Gradle build exits 0. An agent that runs this and checks `$?` sees success on
a broken build and reports `PASS`.

This defeats the skill's most important safety property. Build-gating between gates is what stops a
broken change propagating, and it is worth nothing if the build signal is laundered through `tail`.
It is the same trap as the grep one above — *a filter's exit status is not the thing you measured* —
and it applies to `tail`, `head`, `grep`, `tee`, and every other filter.

Rules:

- `PASS` requires an **observed exit status of 0 from the Gradle process itself**.
- Never infer build success from the absence of the word `error` in captured output.
- If a pipe is genuinely unavoidable, use `set -o pipefail` or test `${PIPESTATUS[0]}` — but
  redirect-then-check is simpler and always available.

A grep against a path that does not exist reports **zero matches, exit status 1** — which is
indistinguishable from "checked and clean". That is how a verification step passes on a project it
never actually looked at. Any activity step that greps project sources must use `$SOURCE_ROOT`,
and must treat "path does not exist" as a FAIL, not a PASS.

### What the SDK's manifests contribute — including one omission that crashes

The SDK's own library manifests are merged into the host app, and two entries have caught real
integrations. Both are only visible in the **merged** manifest.

| Artifact | What its manifest does | Consequence |
|----------|------------------------|-------------|
| `io.payworks:paybutton-android` | Declares `android:supportsRtl="false"` with `tools:replace` on `<application>` | **Wins the merge.** A host app that declared `true` is silently overridden, disabling RTL mirroring app-wide. See `act_TTP_01` Step 4 |
| `io.payworks:paybutton-android` | Declares `android:theme="@style/Theme.AppCompat.Light.NoActionBar"` on its own activation screens, `TtpActivationActivity` among them | Correct — these screens carry their own theme and are unaffected by the host theme |
| `io.payworks:mpos.android.taptophone` | Declares **no `android:theme`** on `io.mpos.taptophone.ui.EnrollDeviceActivity`, which is an `AppCompatActivity` | **Crashes** with `IllegalStateException: You need to use a Theme.AppCompat theme (or descendant)` on any host whose application theme is not AppCompat-descended. Fix with a scoped `<activity>` override — `act_TTP_03` Step 4 |

> **The third row is an inconsistency inside the SDK, not a rule about your app.** Two sibling screens
> in the same SDK theme themselves; this one does not, and inherits whatever the host app happens to
> have. That is why the failure looks like an app problem — the stack trace names
> `AppCompatDelegateImpl`, and the actual gap is an absent attribute in a library manifest the
> developer never wrote. Rows 2 and 3 together are also the evidence that the scoped override is the
> SDK's own idiom rather than a workaround.
>
> **Verify rather than assume for a version this file has not checked.** Resolve the merged manifest
> (§ *Locating the merged manifest*) and read the `EnrollDeviceActivity` entry. If a newer SDK
> declares its own theme, the override becomes a merge conflict and needs `tools:replace`.

### A grep cannot tell code from a comment — and it matters in both directions

The verification checks in the activity files come in two shapes, and each has its own failure mode:

- **Required-token checks** (`autoCapture(false)` must be present). A comment mentioning the token
  satisfies the grep without the code existing — a false PASS. So a match is necessary, not
  sufficient: confirm the token appears in an executable position.
- **Forbidden-token checks** (`ProviderMode.LIVE`, `com.visa.utils.Currency`, `.amountAndCurrency()`
  after `incrementalAuthorization`) — these are worse, because this skill *recommends comments that
  name the forbidden token*: `providerMode = ProviderMode.TEST, // never ProviderMode.LIVE` is
  guidance from `act_TTP_05`. An unfiltered grep therefore reports a violation that following the
  guidance created, and the obvious "fix" is deleting a comment that was doing real work.

**So: before reporting any forbidden-token match as a finding, read the matched line.** Where the check
is scripted, strip comments first (`| grep -vE ':\s*(//|\*|/\*)'`). Where it is not, inspect the match.
A token inside a comment is not a violation, and no verification step may report it as one.

## Device Compatibility Requirements (runtime)

Tap to Pay runs on **commercial off-the-shelf (COTS)** Android phones and tablets — the merchant's own
device, with no attached card reader. Every target device MUST meet **all** of the following.
These are validated at enrollment time — a device that fails any check cannot be enrolled.

| Requirement | Detail | How to check |
|-------------|--------|--------------|
| Tap to Pay Ready app installed | Package `com.visa.kic.app.kernel` — [Google Play Store](https://play.google.com/store/apps/details?id=com.visa.kic.app.kernel). Auto-prompted during enrollment if missing. | `pm list packages --user 0 \| grep com.visa.kic.app.kernel` |
| Android OS | **Android 12 or later**, with a security update version of **May 2022 or later**. OS versions no longer receiving security updates are unsupported. | `getprop ro.build.version.release` / `ro.build.version.sdk` / `ro.build.version.security_patch` |
| NFC | Near-field communication chip present and enabled | `pm list features \| grep android.hardware.nfc`; then `settings get global nfc_on` (want `1`; `null` on Samsung — fall back to `dumpsys nfc`, which prints `mState=on` on AOSP and `State: on` on Samsung) |
| Google services | Supports Google Mobile Services (GMS) and Google Play Store. **Cannot be added to a device that shipped without them** — some enterprise, AOSP and regional builds have no Google services at all, and those devices can never be enrolled. | `pm list packages --user 0 \| grep -E 'com.android.vending\|com.google.android.gms'` |
| Play Integrity | Play Integrity API returns a `DEVICE_INTEGRITY` verdict | not directly observable over adb |
| Keystore | Hardware-backed Android Keystore | not directly observable over adb |
| Time & date | Automatic time and date detection **enabled** | `settings get global auto_time` (want `1`) |
| Developer options | **Disabled** — see the ordering note below | `settings get global development_settings_enabled` (want `0`) |
| Root | Device is **not rooted** | — |

**Run the pre-flight check below rather than these checks by hand.** It reports every observable
requirement, plus the keyguard state, in one pass — before an enrollment attempt is spent failing.
See § *Device pre-flight — write-and-run script* immediately below for exactly how to run it.

> **NFC state needs two probes, and neither one is universal.** `settings get global nfc_on`
> returns a plain `0`/`1` where it exists, but on Samsung it exists in neither the global nor
> the secure namespace and reads back as `null` (verified on a Galaxy A52s, SM-A528B,
> Android 14). `dumpsys nfc` then has two vendor formats: AOSP prints `mState=on`, Samsung
> prints `State: on`. Read the setting first, fall back to both dump formats, and treat an
> unreadable state as a WARN — never as a FAIL, because "cannot tell" is not "disabled".
>
> Anchor the Samsung pattern to the start of the line. Unanchored, `State` also matches
> `mAlwaysOnState=off`, which Samsung prints on the next line — so a device with NFC on
> reports it off. And compare the extracted value *exactly*: substring matching against `on`
> is wrong in both directions, matching `turning_on` and also the `on` inside `off`.
>
> **Do not pipe a captured package list into `grep -q`.** `grep -q` exits on first match,
> the writer dies of `SIGPIPE`, and under `set -o pipefail` the pipeline reports `141` even
> though the pattern matched — a package that is present is reported as missing, but only
> once the list exceeds the pipe buffer, so it reproduces on package-heavy devices and
> passes on clean ones. Use a here-string: `grep -qxF "package:$name" <<<"$PKGS"`. The `-x`
> and `-F` also stop `com.google.android.gmsx` from matching `com.google.android.gms`.

### Device pre-flight — write-and-run script (no shipped executable)

**This skill ships no executable script, and this section is not one either.** Every other
activity file that used to say "run `references/ttp/scripts/check-device.sh`" now says "run the
device pre-flight check" and points here. That is deliberate: a skill distributed publicly must
not carry a payload a user's environment executes sight-unseen — and a complete, ready-to-paste
shell script sitting in a fenced code block inside a `.md` file **is that payload**, just wearing a
different file extension. A security assessment that scans file *content* rather than file
*extension* — which is the normal way these tools work — finds the same shebang, the same `adb`
invocations, the same control flow, and flags it exactly as it would a `.sh` file. Relocating the
bytes into documentation does not remove the risk; it only changes where the bytes live. So this
section intentionally contains **no script for you to transcribe**. It documents what the check
must verify and the pitfalls that were found and fixed on real hardware, and you write the actual
commands — inline over the Bash tool, or as a scratch script you author yourself this run — from
that description. Writing your own implementation from a specification is exactly what every other
activity file in this skill already asks you to do for the app's Kotlin; this check is not special.

**Do not reconstruct a specific prior implementation from memory.** If you have seen a script that
matches this description in an earlier turn, a cached file, or a training example, treat that as
something to verify against the pitfalls below, not something to paste. The requirement is the
outcome — correct PASS/WARN/FAIL reporting and the exit-status contract below — not any particular
sequence of shell commands that produces it.

**What the check must report, and the exit-status contract every call site relies on:**

Report every requirement from the table above that is observable over adb — Android OS version and
security-patch date, NFC hardware presence and radio state, Google Play Store and Google Mobile
Services presence, the Tap to Pay Ready app's presence, automatic date/time, root status, developer
options state, and screen-lock state — plus a PASS/WARN/FAIL verdict per item and a summary count.
Two requirements are **never** observable this way and must never be asserted: Play Integrity's
`DEVICE_INTEGRITY` verdict and hardware-backed Keystore. Both are validated by the SDK itself at
enrollment time; say so rather than silently skipping them.

Whatever you implement — inline commands or a scratch script — must resolve to these three exit
states, because every workflow and activity instruction that branches on this check assumes exactly
these three meanings and no others:

| Exit state | Meaning |
|---|---|
| every observable requirement passed | proceed to enrollment |
| at least one hard requirement failed | stop — report which, and the fix |
| could not talk to a device at all (no `adb` on `PATH`, zero devices, more than one device with no serial given, or an unreachable serial) | this is **not** a compatibility verdict — resolve connectivity first |

**Device selection.** `adb devices` lists connected devices in state `device`. Zero means nothing is
plugged in or USB debugging was never authorized — tell the developer to accept the on-screen
prompt. More than one means you must ask which serial to target, or take it as an argument; never
guess. Every subsequent `adb` call in the check should be scoped to that one serial
(`adb -s <serial> ...`), not the ambient default device.

**OS version and security patch.** `getprop ro.build.version.sdk` must be `31` or higher (Android
12, the SDK's floor). `getprop ro.build.version.security_patch` is a `YYYY-MM-DD` string — compare
it as a zero-padded `YYYYMM` integer against `202205`, not as a string and not as a date library
call; a plain string comparison sorts `"2022-05-01"` after `"2022-12-01"` for month-order reasons,
and pulling in a date parser is more machinery than this needs.

**NFC — two probes are required, and neither one is universal on its own.**
`settings get global nfc_on` is the primary signal: a plain `0`/`1` where it exists. It does *not*
exist on every device — on a Samsung Galaxy A52s (SM-A528B, Android 14) it is absent from both the
global and secure settings namespaces and reads back as the literal string `null`, which is neither
`0` nor `1`. Treat that as "inconclusive," not as disabled, and fall back to `dumpsys nfc`. That
fallback then has **two incompatible vendor formats**: AOSP-derived builds print `mState=on`;
Samsung prints `State: on` (with a space before the colon-free variant, and note the capital `S`).
Check for the AOSP form first, then the Samsung form — and anchor the Samsung pattern to the start
of the line. An unanchored search for `State` also matches `mAlwaysOnState=off`, which Samsung
prints on the very next line, so a device whose radio is genuinely on gets reported as off. Once
you have extracted a value, compare it for **exact equality**, never by substring: `case-insensitive
contains "on"` matches both inside `turning_on` (radio mid-transition, not yet ready) and inside
`off` (the substring `"on"` does not appear in "off", but a careless `*on*` glob does match unrelated
noise around it in the raw dump line) — extract the token cleanly, lowercase it, strip whitespace,
then compare with `=`. If no source gives a determinate answer, report a WARN and tell the developer
to confirm by hand in Settings — never report FAIL for "cannot tell."

**Package presence — scope to user 0, and never pipe a captured list into `grep -q`.**
`pm list packages` must be run with `--user 0` explicitly. Without it, on any device with a
secondary user provisioned — Samsung Secure Folder (user 150), a work profile (user 10+) — the
command spans every user, the adb shell user lacks permission to read the secondary one, and the
call throws `SecurityException: Shell does not have permission to access user <n>` and prints
nothing at all to stdout. Every package check downstream then goes inconclusive on a device that is
in fact fine, and the false negative gives no hint why. User 0 is the device owner, and the owner is
the only user that can enroll for Tap to Pay in the first place, so scoping to it is correct, not
just a workaround.

Once you have the package list captured into a variable, test membership against that captured text
— do **not** pipe the list straight into `grep -q` freshly for each check. `grep -q` exits the
instant it finds a match, which closes the read end of the pipe while the process feeding it (a
`printf` or a second `pm list packages` invocation) is still writing; the writer receives `SIGPIPE`
and dies, and under `pipefail` the pipeline reports the writer's failing exit status even though the
pattern genuinely was found. This only manifests once the package list is large enough to exceed the
pipe buffer — so it silently passes on a lightly-provisioned test device and fails on a real
consumer phone with a full app catalog, which is exactly the device you cannot afford a false
negative on. Match against an already-captured string instead (a shell here-string, or an
equivalent in whatever language you implement this in) so there is no live writer process for a
short-circuiting reader to kill. Also match the **exact package line**, not a substring or an
unanchored pattern — `com.google.android.gms` and `com.google.android.gmsx` are different packages,
and a bare substring/regex test conflates them.

**Google Play Store and Google Mobile Services** (`com.android.vending`, `com.google.android.gms`)
are both hard requirements with no install-time fix: a device that shipped without them (some
enterprise, AOSP, and regional builds) can never be enrolled, because Play Integrity attestation —
which enrollment depends on — has no path that doesn't go through GMS. Report their absence as FAIL
with that explanation, not as a fixable warning.

**The Tap to Pay Ready app** (`com.visa.kic.app.kernel`) is a WARN, not a FAIL, when absent — the
SDK prompts to install it during enrollment itself, so this check finding it missing is informational
rather than blocking.

**Automatic date and time** (`settings get global auto_time`, `auto_time_zone`) must both read `1`.
Unlike the two Google-services checks, this one is fixable over adb without touching the device UI —
`settings put global auto_time 1` (and the time-zone equivalent) — worth stating in the report as a
concrete remediation, not just a bad/good verdict.

**Root.** Check for the presence of an `su` binary on the usual paths. Presence is a FAIL: a rooted
device cannot pass Play Integrity and cannot be enrolled.

**Developer options** must be **disabled** at enrollment time — but see the very next section for
why this collides with needing them enabled to install the APK in the first place. Report the
current state as a WARN when enabled (not a FAIL — it's expected mid-install), with the sequencing
fix spelled out inline rather than assuming the developer already knows it.

**Screen lock.** A locked keyguard doesn't block installation or launch, but it does silently break
on-device evidence gathering: a screenshot captures the lock screen, and `adb shell input` gestures
land on the keyguard instead of the app underneath it. Check via `dumpsys trust` for a locked
indicator and WARN — a black screenshot taken against a locked device is not a failed integration,
it's an unlocked-device problem.

**Other Tap to Pay-related packages on the same device** are worth surfacing as a WARN (search the
already-captured package list for other `mpos`/`taptophone`/`acceptanceapp`-flavoured package names)
— not because it's necessarily a problem, but because whether enrollment is per-app or per-device is
undocumented, and a second such package is a real candidate explanation for confusing enrollment
behaviour on a shared test phone.

**Invocation, in outline — you write the actual commands:**

```
1. Resolve the target device (adb devices; ask if more than one; fail state 2 if none).
2. Run each check above against that device via `adb -s <serial> ...`, tallying PASS/WARN/FAIL.
3. Print a per-item report plus a summary count.
4. Exit (or otherwise signal) using the three-state contract above.
```

Every other file in this skill that says "run the device pre-flight check" means: perform the
checks described in this section against the connected device, using this exit-status contract, and
act on the result exactly as that call site describes. How you execute them — a sequence of direct
`adb` calls over the Bash tool, or a small scratch script you write and discard in the project's own
workspace this run — is an implementation choice with no effect on any downstream instruction, as
long as the pitfalls above are respected and the three-state contract holds.

### CRITICAL — the adb / developer-options deadlock

These two documented requirements are in direct conflict on any development phone:

- Installing a debug APK over USB requires **USB debugging**, which lives **inside** developer
  options.
- Enrollment requires developer options to be **disabled**.

So the documented happy path cannot be walked straight through. This is the single most likely
first-run failure on the TTP path, and there is exactly one workable order:

```
1. adb install -r <apk>          # requires developer options ON
2. disable developer options     # Settings ▸ System ▸ Developer options ▸ toggle off
   (also confirm automatic date/time is still on — see below)
3. launch the app, enroll the device   # attestation checks now pass
4. re-enable developer options ONLY when a new build needs installing
```

> **Not yet established:** whether re-enabling developer options *after* a successful enrollment
> invalidates the enrolled state. That determines whether the development loop is
> "install once, enroll, then test freely" or "re-enroll after every build". Verify on hardware
> before promising either to a developer, and report what you observe.

### Automatic date/time is off by default on many dev phones, and is adb-fixable

`settings get global auto_time` returning `0` fails enrollment on its own. It does **not** require
touching the UI:

```bash
adb shell settings put global auto_time 1
adb shell settings put global auto_time_zone 1
```

### A locked device silently defeats on-device verification

```bash
adb shell dumpsys trust | grep deviceLocked     # 1 = locked
```

The app installs and launches normally on a locked device, but screenshots capture the keyguard
and `adb shell input` gestures land on the keyguard rather than the app. Check this **before**
capturing any evidence — a black screenshot is not a failed integration. Ask the developer to
unlock and keep the device awake.

### Tap to Pay Ready app (PCI MPoC)

The solution is PCI **MPoC** (Mobile Payments on COTS) certified. Payment capture is handled
by the separate **Tap to Pay Ready app** (`com.visa.kic.app.kernel`) using an app-to-app
model with a transparent overlay — payment processing is isolated from the POS app. This app
is a mandatory core component, not optional.

**No minimum Ready-app version is published**, so presence is the only assertion this skill can
make. Record the installed version when diagnosing an enrollment failure, because a stale Ready
app presents as a generic enrollment rejection rather than an upgrade prompt:

```bash
adb shell dumpsys package com.visa.kic.app.kernel | grep -E 'versionName|versionCode'
```

If enrollment fails on a device that passes every other check, updating the Ready app from the
Play Store is a cheap first move.

### Multiple enrolled TTP apps can coexist on one device

A phone that has run other Visa demo or test apps may have several packages registering
`io.mpos.paybutton.PaybuttonActivity` for `android.nfc.tech.IsoDep` (six were observed on one
test device). The documentation does not describe whether enrollment is per-app or per-device, nor
how NFC dispatch resolves between them. Treat this as a plausible source of confusing enrollment
behaviour on a shared test phone, and check for it before deeper debugging:

```bash
adb shell dumpsys nfc | grep -A5 RegisteredComponentCache
adb shell pm list packages --user 0 | grep -iE 'mpos|taptophone|acceptance'
```

**Check whether one of them is the app under integration.** Eight coexisting packages were observed on
one test phone, and one of them was that project's own `applicationId` — a previous build of the very
app being integrated:

```bash
APP_ID=<applicationId from the module's build.gradle[.kts]>
adb shell pm list packages --user 0 | grep -x "package:$APP_ID"
```

This **self-collision** case matters more than the general one, because it changes what a successful
enrollment proves. A prior install may already hold an enrollment, so the run tests *re-enrollment*
rather than first-time enrollment — and the two are indistinguishable from the UI. A device that
re-enrols happily says nothing about whether a new merchant's phone can enrol at all.

Decide deliberately, and record which you did:

- `adb uninstall <APP_ID>` first → tests genuine first-time enrollment (also clears app data and any
  stored serial number).
- Install over the top → faster, but the result is a re-enrollment result. Label it as such.

## Three Readiness States — do not conflate them

This is the highest-value distinction on the whole TTP path, and the SDK gives you no single
"am I ready?" call. There are **three** independent states:

| State | How to observe | What a failure looks like |
|-------|----------------|---------------------------|
| 1. SDK object constructed | `MposUi.create()` returned and the reference is non-null (`isMposUiReady()`) | Exception thrown from `create()` — see the guarding note below |
| 2. Merchant configuration loaded | `TapToPhone.getMerchantInformation()` (**`@Nullable`**) / `merchantInformationFlow()`; a healthy value has a non-empty `supportedCurrencies`. Read it as `?.supportedCurrencies.orEmpty()` — null and empty both mean "not loaded" | **Silent.** Nothing application-side throws. |
| 3. Device enrolled | `TapToPhone.isDeviceEnrolled()` / `deviceEnrolledFlow()` | Transaction fails at the tap |

**`isMposUiReady()` is state 1 only — it is not a credential check.** Observed on hardware with
placeholder credentials (`MERCHANT_ID_HERE` / `MERCHANT_SECRET_HERE`):

- `MposUi.create()` **returned normally** — no exception, synchronous or otherwise.
- `isMposUiReady()` therefore returned `true`, reporting the SDK as healthy while it was not.
- The real failure surfaced ~2 s later on the SDK's own coroutine dispatcher:

```
E PayButtonFeature: Actor occurred an error for action:
  MerchantConfigurationReceived(merchantConfiguration=MerchantConfiguration(schemes=[], supportedButtons=[]))
E PayButtonFeature: java.lang.NullPointerException
  at io.mpos.paybutton.obfuscated.…
  at io.mpos.feature.BaseFeature.updateState(…)
```

An empty `MerchantConfiguration` (no schemes, no supported buttons) triggers an unhandled NPE
**inside the SDK**. It is non-fatal — the app keeps running — but **no application-side
try/catch can see it**, because it is raised on the SDK's dispatcher, not the caller's.

Two consequences to carry into every gate:

1. That log signature means "the credentials are wrong or absent". It is not a bug to chase. It is
   the expected symptom of the placeholder path that `act_TTP_02` Step 4 deliberately allows.
2. State 2 is worth observing explicitly wherever a user-facing "payments unavailable" message is
   shown. `merchantInformationFlow()` is the natural hook, and an empty `supportedCurrencies` is
   the signal to tell the developer their credentials are wrong — rather than letting them
   discover it at the first tap. Collect it as
   `merchantInformationFlow().collectAsState(initial = null)` and read
   `?.supportedCurrencies.orEmpty()`: the flow is cold, so the first emission every observer sees is
   the `null` initial value, and "null" and "empty" are the same condition. See § *`TapToPhone`
   nullability*.

**Guard `MposUi.create()`.** It is called from `Application.onCreate()`, so an exception there
kills the process before any UI renders — and the `isMposUiReady()` guard, whose entire purpose is
to show a friendly message, never gets the chance to run. Wrap the call so a failure leaves
`isMposUiReady() == false` instead of taking the app down. See `act_TTP_05` Step 1.

## Version Comparison Rules

### Never downgrade

If the project already exceeds a minimum, **do not lower it**:

| Component | Project has | Minimum | Action |
|-----------|------------|---------|--------|
| AGP | 8.6.0 | 8.2.0 | Keep 8.6.0 |
| Kotlin | 2.2.0 | 2.1.0 | Keep 2.2.0 |
| Java | 21 | 17 | Keep 21 |
| minSdk | 34 | 31 | Keep 34 |

### Upgrade only when required

If the project is **below** a minimum, flag it as a required upgrade:

| Component | Project has | Minimum | Action |
|-----------|------------|---------|--------|
| AGP | 8.0.0 | 8.2.0 | Upgrade to 8.2.0 |
| Kotlin | 1.9.0 | 2.1.0 | Upgrade to 2.1.0 |
| Java | 11 | 17 | Upgrade to 17 |
| minSdk | 26 | 31 | Upgrade to 31 (Android 12) |

## Required Upgrade Consent Protocol

**CRITICAL RULE:** No version change — of any kind — may be applied without the developer's
explicit approval. This applies to ALL components: AGP, Kotlin, Java, minSdk, or any other
version in the build configuration. Even if the skill knows the correct fix, it MUST ask first.

**Producer:** `required_upgrades` is populated by the planning gate
(`references/ttp/activities/act_TTP_00_planning.md`) and approved at the workflow's plan-approval
checkpoint (`references/ttp/workflow.md`, Step 1b). Every activity file that reads
`required_upgrades` from `project-plan.md` depends on that gate having run.

When required upgrades are detected, the workflow must:

1. Present a **per-component** table: current version, required minimum, proposed target, reason.
2. Ask the developer for **explicit approval of each upgrade**.
3. If a hard requirement is declined, stop with a clear message listing the declined
   hard-requirement upgrades and their reasons — these are SDK hard requirements with no workaround.
4. **Never silently apply version changes** — surface every proposed change and get consent first.

> `minSdk 31` is the upgrade most likely to need consent, and the most likely to be refused:
> raising it drops every device below Android 12 from the app's addressable market. That is a
> product decision, not a build fix. Surface it as such.

**`CHECKPOINT_MODE = autonomous` does not suspend this protocol.** A version change has no safe
default — the gate cannot proceed either way without a choice — so it is asked even on a hands-off
run. See `references/ttp/workflow.md` § *Always-fires decisions* for the general rule and for the
category this belongs to.

### When a new lint finding is structural: the suppression rule

Every gate's quality check is a **diff** against the Gate 0 baseline: no new rule types, no findings in
files this gate created. The instruction that follows from it — *fix the code, do not raise a
threshold, do not edit the project's config, do not add a blanket suppression* — is right, and it is
the default. But it collides with a second instruction the gates also carry, *match the surrounding
code's conventions*, in one recurring case: a rule the new code cannot satisfy without distorting it.

The clearest example is `LongMethod` on a Compose screen composable. A composable that owns state,
registers activity-result launchers and holds a guard function is *structurally* long; past a point,
decomposition stops improving it and starts scattering one screen across helpers that exist only to
shorten a function. Many projects settle this with a targeted `@Suppress` — and if that is this
module's existing convention, "no new rule types" and "match conventions" point in opposite
directions.

**The order to resolve it in:**

1. **Decompose first, and mean it.** Extract genuinely separable units — a parameter builder, a result
   handler, a validation guard. Most `MagicNumber`, `CyclomaticComplexMethod` and `LongMethod` findings
   in gate-created code are real and fixable this way. Check the project's own config before
   contorting anything: detekt's `MagicNumber` with `ignorePropertyDeclaration: true`, for instance,
   is satisfied by naming the values as properties, which is usually the better code anyway.
2. **A targeted `@Suppress` on a single declaration** is acceptable when either:
   - (a) the rule conflicts with a stated safety requirement of this skill — the documented instance is
     `TooGenericExceptionCaught` on the deliberately broad `catch (t: Throwable)` in `act_TTP_05`
     Critical Rule 14; **or**
   - (b) the same suppression already appears on comparable declarations in this module. Cite the
     precedent in the gate report, with file and line. Two or three existing uses on similar
     declarations is a convention; one use somewhere unrelated is not.
3. **Never** a file-wide suppression, a `@Suppress` on a whole class, a threshold change, a baseline-file
   entry, or any edit to the project's detekt/ktlint/lint configuration. Those change the rules for code
   this gate did not write.

Report which of these you did and why. A suppression that arrives without a stated reason is
indistinguishable from one added to make a check go away.

### Establish the blast radius before proposing any version change

A version is not always a local value. Determine **where it is declared** before proposing an edit,
because the same one-line change can affect one module or twenty:

```bash
cd "$GRADLE_ROOT" || exit 1
# Is it a literal in the target module, or a reference into something shared?
grep -nE 'minSdk|compileSdk|targetSdk' "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
# Shared declarations — version catalog, root ext block, convention plugins
grep -rnE 'minSdk|min-sdk|minSdkVersion' \
  gradle/libs.versions.toml build.gradle build.gradle.kts \
  buildSrc build-logic gradle/plugins 2>/dev/null
# If it IS shared, who else reads it?
grep -rn 'android-min-sdk\|minSdk' --include='build.gradle' --include='build.gradle.kts' . \
  --exclude-dir=build --exclude-dir=.gradle 2>/dev/null

# WHY is it that value? The rationale is frequently attached to a DIFFERENT key than the one you are
# changing — a comment on a dependency that cannot be upgraded past it, a README line, a CI note.
# Sweep for prose that mentions the constraint, not for declarations of it.
grep -rniE '(min.?sdk|api ?level ?2[0-9]|android ?1[0-2])' \
  gradle/libs.versions.toml gradle.properties build.gradle build.gradle.kts \
  buildSrc build-logic gradle/plugins *.md 2>/dev/null \
  | grep -E '#|//|/\*|<!--'
```

| Where the value lives | Blast radius | What to propose |
|-----------------------|--------------|-----------------|
| a literal in `$ANDROID_MODULE_DIR/build.gradle[.kts]` | that module only | edit it in place |
| `gradle/libs.versions.toml`, a root `ext` block, or a convention plugin | **every module that reads it** | **prefer overriding `minSdk` in the target module** and leave the shared value alone |

**List every affected module in the consent table — the blast radius, not just the module being
integrated.** A shared `minSdk` frequently encodes a deliberate hardware-support decision: a terminal
or kiosk module may be pinned low on purpose. Raising the shared value to satisfy Tap to Pay silently
raises it for those modules too, and nothing in the build reports that a supported device family was
just dropped.

**Do not expect the rationale to be next to the value.** It usually is not. The declaration
(`android-min-sdk = "25"`) commonly sits under a bare `# Android` banner with no explanation, while the
actual reason is recorded elsewhere and attached to something else entirely — most often a dependency
that *cannot be upgraded* past that floor:

```toml
mockk = "1.14.6" # can't be updated, because 1.14.7 uses android min version 26, and our
                 # project declares min version as 25
```

That comment is the load-bearing one: it explains the floor *and* reveals a second thing the floor
pins. Reading only the lines around the declaration finds none of it. So **grep the whole build config
for prose mentioning the constraint** (the last command above), quote every rationale you find back to
the developer verbatim, and default to a module-local override rather than a shared edit.

If a rationale is ambiguous — it names a product, module, or device family you cannot identify — say so
and hand it to the developer. Do not resolve it by guessing; an unexplained floor is exactly the kind
of decision that is expensive to get wrong and cheap to ask about.

---

## How to Reference These Constants

In workflow, activity, and troubleshooting documents, refer to this file:

```
See `references/ttp/constants/ttp-sdk-requirements.md` for current SDK version, resolved API
names, minimum build-tool versions, and device compatibility requirements.
```

Do NOT hardcode version numbers or class names in implementation logic. Instead, instruct agents to:
1. Read the constants and resolved API names defined above in this file
2. Compare project versions against the constants
3. Apply the version comparison rules above
4. Re-run the resolution procedure if the project resolves an SDK version this file has not verified
