# Activity TTP-3: Device Enrollment

Enroll the Android device with the Tap to Pay on Android SDK so it is authorized to accept
contactless payments. Enrollment creates and provisions the device with the SDK and the
**Tap to Pay Ready app** (the PCI MPoC secure-processing component). Until a device is enrolled,
no transactions can be processed.

**Reference:** [Enabling Device Enrollment](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone/tap-to-phone-get-started-intro/ttp-device-enroll-intro.md), [Install the Tap to Pay Ready App](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md), `references/ttp/constants/ttp-sdk-requirements.md`, `references/ttp/troubleshooting.md#tap-to-pay`

## Critical Rules (NEVER violate these)

1. **The Tap to Pay Ready app (`com.visa.kic.app.kernel`) MUST be installed** before or during enrollment. It is a mandatory PCI MPoC core component — not optional. If missing, the SDK prompts the user to install it during enrollment.
2. **Enrollment requires a valid MID + secret key** from `act_TTP_02`, supplied to `MposUi.create()`. Placeholder credentials will fail enrollment.
3. **Enrollment requires a compatible physical device.** All device compatibility requirements in `references/ttp/constants/ttp-sdk-requirements.md` (Android 12+, NFC, GMS, Play Integrity `DEVICE_INTEGRITY`, hardware keystore, automatic time/date, developer options **disabled**, **not rooted**) must be met. Enrollment cannot succeed on an emulator.
4. **Use `AccessoryFamily.TAP_TO_PHONE`** in `AccessoryParameters` — never `AccessoryFamily.MOCK` and never a card-reader family.
5. **Always handle both success and failure** in `onActivityResult`. Never assume enrollment succeeded without checking the result `Intent`.
6. **`io.mpos.taptophone.ui.EnrollDeviceActivity` MUST be given an AppCompat-descended theme in your manifest.** That class **ships inside the SDK** — you never write it, and this rule never asks you to (Critical Rule 10). The SDK's own manifest declares no `android:theme` on it, so it inherits the host application theme and throws `IllegalStateException: You need to use a Theme.AppCompat theme (or descendant)` on `onCreate` if that theme is a platform theme — which is the default state of any Compose-only app. Add the scoped `<activity>` override in *Step 4*; it re-declares the SDK's activity for the sole purpose of attaching `android:theme` to it. **NEVER resolve this by changing the application theme:** that restyles every screen in the app to satisfy one SDK activity.
7. **NEVER create a new `Application` subclass when one already exists, and never create one just to hold `MposUi` on a project whose DI framework already owns object construction.** Extend the existing class, or add a singleton-scoped provider — the holder recipe has **three** branches and only one of them writes a new class. Changing `android:name` on an app whose `Application` is owned by DI (Hilt, Koin, Dagger) is a breaking edit that will not always fail loudly. See *Step 2*.
8. **NEVER let `MposUi.create()` take the process down.** In the worked example it runs in `Application.onCreate()`, so an exception there kills the app before any UI renders — and `isMposUiReady()`, whose whole purpose is to show a friendly message, never gets to run. Wrap it; see *Step 2*. **Guard the line where `create()` actually executes, not the line where the holder is declared** — on the DI-owned branch a lazy provider moves that moment to first injection, and a guard left behind at the declaration catches nothing.

    **The broad catch is deliberate, and it collides with a standard linter rule.** `catch (t: Throwable)` trips detekt's `TooGenericExceptionCaught`, which is enabled by default and certain to fire on any project running `allRules = true`. This is the one place in the integration where the lint rule and the safety requirement point in opposite directions:

    - **Suppress the rule at the function**, with a comment saying why — the `@Suppress("TooGenericExceptionCaught")` in the worked example is not decoration, ship it.
    - **Do NOT narrow the catch to `Exception`.** An `Error` — native library load failure, hardware keystore unavailable — is a realistic failure mode for this specific call, and `Exception` does not catch it. Narrowing satisfies the linter by restoring the launch crash.
    - **Do NOT edit the project's detekt/ktlint configuration** to make the warning go away globally. A targeted, explained suppression is the correct scope; disabling a rule repo-wide to accommodate one call site is not.

    If the quality-gate diff reports `TooGenericExceptionCaught` as a *new* finding, the suppression is missing — add it, rather than changing the catch.
9. **This gate writes `mpos_accessor` into `project-plan.md`, and an empty value is a `FAIL`.** Gate 4 runs next and cannot query `transactionModule` without it; Gates 5–9 all substitute it into their samples. Reporting `PASS` with the field blank hands the failure to the next gate, where it reads as that gate's bug.
10. **NEVER create an `Activity` — or any other component — to host enrollment. The SDK already owns the enrollment screens.** `getEnrollDeviceIntent(activity)` and `getReEnrollDeviceIntent(activity, serial)` return an `Intent` aimed at an Activity that **exists inside the SDK and is already declared in the SDK's manifest**. Launch that `Intent` from a launcher on the screen the merchant is already looking at — *Step 4a*, the same Activity Result pattern Gate 5 uses for payment. **There is no component of yours to write here, and therefore nothing of yours to register.**

    **A hand-written wrapper compiles and then fails on the merchant's first tap.** A class of your own called `EnrollDeviceActivity`, `EnrollmentActivity` or similar builds cleanly, and launching it throws at runtime:

    ```text
    android.content.ActivityNotFoundException: Unable to find explicit activity class
    {<your.app>/<your.package>.EnrollDeviceActivity}; have you declared this activity
    in your AndroidManifest.xml?
    ```

    Nothing catches this before a real device: the build is green, the quality gates are clean, and the crash needs someone to press **Enroll** or **Re-enroll**. Confirm with `adb logcat -d -b crash` if you see it.

    **Do not read Critical Rule 6 as licence to create one.** Rule 6 adds an `<activity android:name="io.mpos.taptophone.ui.EnrollDeviceActivity" …>` entry to *your* manifest, but that entry is a **theme override on a class the SDK ships** — a manifest entry naming a class you did not write is normal and correct here. If you find yourself writing a class so that a manifest entry has something to point at, you have inverted the rule. The give-away is a source file whose class name matches the one in Rule 6: that name belongs to `io.mpos.taptophone.ui`, and a second one in your own package is always this bug.

## Prerequisites

Before starting this activity, the developer must have completed:

- `act_TTP_01` — SDK dependencies configured, project builds
- `act_TTP_02` — real TEST MID + secret key stored (placeholders will not enroll)
- A **compatible physical Android device** meeting every requirement in the constants file
- The **Tap to Pay Ready app** installed (or the developer is ready to install it when prompted)

## Workflow

### Step 0: Check the device BEFORE writing enrollment code

Enrollment validates every device requirement at once and reports a generic rejection. Finding out
which requirement failed afterwards is far more expensive than checking first: run the device
pre-flight check per
`"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` § *Device pre-flight — write-and-run
script* (perform the checks described there — direct `adb` calls or a scratch script you write
yourself this run — and act on the three-state result exactly as that section describes).

Resolve every `FAIL` before attempting an enrollment. Some are one-command fixes (`auto_time`),
others disqualify the device outright (no NFC, Android 11).

#### CRITICAL — the adb / developer-options deadlock

Two documented requirements are in direct conflict on any development phone:

- Installing a debug APK over USB requires **USB debugging**, which lives **inside** developer options.
- Enrollment requires developer options to be **disabled**
  (`references/ttp/constants/ttp-sdk-requirements.md` § *Device Compatibility Requirements*).

So the documented happy path cannot be walked straight through, and this is the single most likely
first-run failure on the Tap to Pay path. There is exactly one workable order:

```
1. adb install -r <apk>          # requires developer options ON
2. disable developer options     # Settings ▸ System ▸ Developer options ▸ toggle off
   (also re-confirm automatic date/time is still enabled)
3. launch the app, enroll        # attestation checks now pass
4. re-enable developer options ONLY when a new build needs installing
```

**Step 2 cannot be automated** — turning developer options off takes USB debugging with it, so adb
access is lost at that moment. Ask the developer to do it by hand and tell them adb will drop; do not
present it as a command you will run.

Automatic date/time is off by default on many development phones and fails enrollment on its own.
Unlike developer options, it *is* adb-fixable without touching the UI:

```bash
adb shell settings get global auto_time          # want 1
adb shell settings put global auto_time 1
adb shell settings put global auto_time_zone 1
```

> **Not yet established:** whether re-enabling developer options *after* a successful enrollment
> invalidates the enrolled state. That determines whether the development loop is "install once,
> enroll, then test freely" or "re-enroll after every build". Report what you observe rather than
> asserting either.

### Step 1: Install the Tap to Pay Ready App

Install `com.visa.kic.app.kernel` on the target device using either option:

- **Direct install:** open the [Google Play Store link](https://play.google.com/store/apps/details?id=com.visa.kic.app.kernel) on the device. No additional setup required.
- **Install on demand:** if the app is not present when enrollment starts, the SDK prompts the merchant to install it during the enrollment flow.

Verify it is present, and record its version:

```bash
adb shell pm list packages --user 0 | grep com.visa.kic.app.kernel
adb shell dumpsys package com.visa.kic.app.kernel | grep -E 'versionName|versionCode'
```

**No minimum Ready-app version is published**, so presence is the only assertion this skill can
make. Record the version anyway: a stale Ready app presents as a generic enrollment rejection rather
than an upgrade prompt, so if enrollment fails on a device that passes every other check, updating
this app from the Play Store is a cheap first move.

### Step 2: Create the durable `MposUi` holder — this gate owns it

Enrollment is invoked on an `MposUi` instance configured for the Tap to Phone accessory family, using
the TEST credentials from `act_TTP_02`. **Build it once, as a process-lifetime singleton — not as a
local `val` inside the enrollment screen.**

> **Why the holder belongs to *this* gate and not to charge.** This is the first gate that needs an
> `MposUi`, and every gate after it needs the same one: `act_TTP_04` reads `transactionModule` for the
> transaction history, `act_TTP_05` starts charges, `act_TTP_06`–`act_TTP_08` refund, tip and capture. A
> local instance created here would not survive the Activity, and a second instance created later would
> give the app two competing owners of the same SDK object — the thing Critical Rule 7 forbids.

**Follow the canonical recipe in
`references/ttp/constants/ttp-sdk-requirements.md` § *The `MposUi` holder — one instance, one owner,
created by Gate 3*.** It carries the detection greps, all three branches (extend an existing
`Application`, create `PaymentApplication`, or add a DI-scoped provider), the worked Kotlin source, the
manifest registration, and the Java-project rule. Do not restate it here and do not improvise a fourth
branch.

Two obligations that are this gate's alone:

1. **Record the accessor as `mpos_accessor` in `project-plan.md`** before reporting. Critical Rule 9 —
   an empty value is a `FAIL`, because Gate 4 runs next and reads it.
2. **Report which of the three branches you took**, and on the DI branch, where the provider was added.
   The later gates substitute `mpos_accessor` into roughly 90 sample call sites; a reader of the report
   needs to know whether `PaymentApplication` exists in this project at all.

The rest of this activity's samples spell the holder `PaymentApplication.mposUi`. On the extend-existing
or DI branch, read every one of those as `mpos_accessor`.

### Step 3 (Optional): Configure the Enrollment Experience

Optionally customize the enrollment UI with a `TapToPhoneConfiguration`. Both parameter types exist
in **two** packages — use the `io.mpos.paybutton` variants, because `TapToPhoneConfiguration` is
itself a `paybutton` type. The `io.mpos.taptophone` duplicates are internal. See
`references/ttp/constants/ttp-sdk-requirements.md` § *CRITICAL — the decoy table*.

```kotlin
import io.mpos.paybutton.TapToPhoneConfiguration
import io.mpos.paybutton.SerialNumberInputMethod
import io.mpos.paybutton.ConfirmationScreenOption

mposUi.tapToPhone.tapToPhoneConfiguration = TapToPhoneConfiguration(
    // DEVICE_LIST (default): show a list of previously enrolled devices to select from.
    // MANUAL_INPUT: prompt the merchant to type the serial number.
    // AUTO_ASSIGN_NEW_SERIAL_NUMBER: assign a new serial number without prompting.
    serialNumberInputMethod = SerialNumberInputMethod.DEVICE_LIST,
    // SHOW_WITH_SERIAL_NUMBER (default): show the Serial Number Confirmation screen.
    // SKIP: skip the confirmation screen.
    confirmationScreenOption = ConfirmationScreenOption.SHOW_WITH_SERIAL_NUMBER
)
```

`AUTO_ASSIGN_NEW_SERIAL_NUMBER` is published by the SDK but is not described in the documentation,
so its exact behaviour is unverified. Do not select it for a developer without saying so.

### Step 4: Enroll a New Device

`TapToPhone` offers **two** ways to launch enrollment. Choose by UI toolkit — check `UI_TOOLKIT` in
`project-plan.md`.

#### CRITICAL — `EnrollDeviceActivity` needs an AppCompat theme, or the first tap crashes

Do this **before** you launch an enrollment intent. It is a two-line manifest edit, and without it
the enrollment screen dies on `onCreate` the first time a real device reaches it:

```
java.lang.RuntimeException: Unable to start activity
ComponentInfo{<your.app>/io.mpos.taptophone.ui.EnrollDeviceActivity}:
java.lang.IllegalStateException: You need to use a Theme.AppCompat theme (or descendant)
with this activity.
    at androidx.appcompat.app.AppCompatDelegateImpl.createSubDecor(AppCompatDelegateImpl.java:902)
    at androidx.appcompat.app.AppCompatActivity.setContentView(AppCompatActivity.java:205)
    at io.mpos.taptophone.ui.EnrollDeviceActivity.onCreate(SourceFile:12)
```

**The cause is a gap in the SDK's own manifest, not in your code.**
`io.mpos.taptophone.ui.EnrollDeviceActivity` is an `AppCompatActivity`, but its `<activity>` entry in
`io.payworks:mpos.android.taptophone` declares **no `android:theme`**. So it inherits *your*
application theme, and `AppCompatDelegate` throws if that theme does not descend from
`Theme.AppCompat`. The activation screens in `io.payworks:paybutton-android` — `TtpActivationActivity`
among them — each declare `android:theme="@style/Theme.AppCompat.Light.NoActionBar"` on themselves, so
the fix below is the SDK's own idiom, simply not applied consistently to this one activity.

**Which projects are affected.** The distinction is easy to get backwards:

| Your application theme | Descends from `Theme.AppCompat`? |
|------------------------|----------------------------------|
| `@style/Theme.AppCompat.*` | Yes — unaffected |
| `@style/Theme.MaterialComponents.*` | Yes — unaffected |
| `@style/Theme.Material3.*` (from `com.google.android.material`) | Yes — unaffected |
| `@android:style/Theme.Material.*` (the **platform** theme) | **No — crashes** |
| `@android:style/Theme.*` anything, or no `android:theme` at all | **No — crashes** |

A Compose-only app is the classic casualty: it renders everything through `MaterialTheme` in Kotlin,
has no `res/values/themes.xml` at all, and so ends up on a platform theme with nothing to inherit
from. Note the trap in rows 3 and 4 — `Theme.Material3` from the Material **library** is
AppCompat-descended, while the platform's `android:Theme.Material` is not, and they read almost
identically in a manifest.

**Add a scoped override to `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`,** inside
`<application>`:

```xml
<activity
    android:name="io.mpos.taptophone.ui.EnrollDeviceActivity"
    android:theme="@style/Theme.AppCompat.Light.NoActionBar" />
```

Merging an `<activity>` entry that names a library activity **adds** the attribute the library left
unset; it does not redeclare the activity. Three notes:

- **Add it unconditionally.** It is correct whether or not your theme already descends from
  AppCompat, and it is far cheaper than resolving a `parent=` chain across `themes.xml` files to find
  out. A project that already has a branded AppCompat-descended theme may point the override at that
  theme instead (`android:theme="@style/Theme.MyApp"`) — a one-word change.
- **If `@style/Theme.AppCompat.Light.NoActionBar` does not resolve** at build time, add
  `androidx.appcompat:appcompat` as an explicit dependency. It is normally already on the classpath
  transitively — `EnrollDeviceActivity` is an `AppCompatActivity`, so the SDK brings it — and
  resources merge from transitive AARs, but an explicit dependency is the fix if it does not.
- **If a future SDK version declares its own `android:theme`** on this activity, the merge becomes a
  conflict and the build fails with `Attribute activity@theme ... is also present at [library]`. Add
  `tools:replace="android:theme"` to the override, and make sure
  `xmlns:tools="http://schemas.android.com/tools"` is declared on the `<manifest>` tag — it is
  required for any `tools:` attribute and many manifests do not have it.

> **NEVER fix this by changing the application theme.** Pointing `<application android:theme>` at an
> AppCompat theme also resolves the crash, and it is the wrong answer: it restyles **every screen in
> the app** to satisfy one SDK activity. The scoped override changes exactly one activity that the
> SDK draws itself. This is not a decision to put to the developer — an app-wide restyle is a
> regression outside Tap to Pay, and this skill does not make those. See `act_TTP_05` Critical Rule 15
> for the same principle applied to `Application` subclasses.

**Verify it merged** — after a build, and against the *merged* manifest, because the source manifest
cannot show you what the SDK contributed:

```bash
# Resolve the merged manifest; AGP 7.x and 8.x put it in different places. See
# references/ttp/constants/ttp-sdk-requirements.md § Locating the merged manifest.
MERGED_MANIFEST=$(find "$ANDROID_MODULE_DIR/build/intermediates" \
  -path '*merged_manifest*' -name AndroidManifest.xml 2>/dev/null | grep -i '/debug' | head -1)

# 1. The override must be in the source manifest.
grep -q 'io\.mpos\.taptophone\.ui\.EnrollDeviceActivity' \
  "$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml" \
  && echo "OK: EnrollDeviceActivity theme override present in the source manifest" \
  || echo "FAIL: no EnrollDeviceActivity override — enrollment will crash on a non-AppCompat theme"

# 2. It must survive the merge WITH a theme attached.
if [ -z "$MERGED_MANIFEST" ]; then
  echo "EnrollDeviceActivity theme: UNMEASURED — run assembleDebug, then re-check. Not the same as OK."
else
  tr '\n' ' ' < "$MERGED_MANIFEST" \
    | grep -oE '<activity[^>]*EnrollDeviceActivity[^>]*>' \
    | grep -q 'android:theme' \
    && echo "OK: merged EnrollDeviceActivity entry carries android:theme" \
    || echo "FAIL: merged EnrollDeviceActivity entry has NO android:theme — it will inherit the app theme"
fi
```

> **Attribute order is not fixed in the merged manifest**, so grep for the `<activity …>` element and
> then for `android:theme` within it — a single pattern expecting `android:name` before
> `android:theme` will miss a correct merge. The `tr` collapses newlines first because the merger
> writes each attribute on its own line.

#### 4a. Preferred — the Activity Result API (`getEnrollDeviceIntent`)

`TapToPhone` exposes Intent-returning variants:

```
Intent getEnrollDeviceIntent(Activity)
Intent getReEnrollDeviceIntent(Activity, String serialNumber)
```

These are what `registerForActivityResult` / `rememberLauncherForActivityResult` need. **This is the
recommended path**, and it is effectively mandatory for Compose projects and for any project whose
lint or detekt configuration rejects the deprecated `onActivityResult`.

> **Launch the returned `Intent` directly. Do not wrap it in an `Activity` of your own** — Critical
> Rule 10. The `Intent` already targets an Activity inside the SDK, declared in the SDK's manifest, so
> the launcher below is the complete integration: no new component, no new manifest entry. Both
> **Enroll** and **Re-enroll** go through this one launcher (Step 5 differs only in which `Intent` you
> hand it). A wrapper Activity compiles and then throws `ActivityNotFoundException` on the first tap.

```kotlin
// Compose
val enrollLauncher = rememberLauncherForActivityResult(
    ActivityResultContracts.StartActivityForResult()
) { result ->
    val enrolled =
        result.resultCode == EnrollResultIntent.ENROLLMENT_RESULT_CODE &&
        result.data?.getStringExtra(EnrollResultIntent.ENROLLMENT_RESULT_EXTRA) ==
            EnrollResultIntent.ENROLLMENT_RESULT_EXTRA_ENROLLED

    if (enrolled) {
        val serialNumber = result.data?.getStringExtra(
            EnrollResultIntent.ENROLLMENT_RESULT_EXTRA_SERIAL_NUMBER
        )
        onEnrollmentComplete(serialNumber)   // persist it — needed for re-enrollment
    } else {
        onEnrollmentFailed()
    }
}

// launch it — note getEnrollDeviceIntent needs an Activity, not a Context
enrollLauncher.launch(mposUi.tapToPhone.getEnrollDeviceIntent(activity))
```

`EnrollResultIntent` is `io.mpos.taptophone.EnrollResultIntent` — the `taptophone` package, **not**
`paybutton`. This is the one case where the `taptophone` variant is the right answer.

#### 4b. Legacy — `enrollDevice(activity, requestCode)` for Views projects

```kotlin
mposUi.tapToPhone.enrollDevice(activity, requestCode)

// ...

override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)

    val isEnrollmentSuccessful =
        resultCode == EnrollResultIntent.ENROLLMENT_RESULT_CODE &&
        data?.getStringExtra(EnrollResultIntent.ENROLLMENT_RESULT_EXTRA) ==
            EnrollResultIntent.ENROLLMENT_RESULT_EXTRA_ENROLLED

    if (isEnrollmentSuccessful) {
        val serialNumber = data?.getStringExtra(
            EnrollResultIntent.ENROLLMENT_RESULT_EXTRA_SERIAL_NUMBER
        )
        onEnrollmentComplete(serialNumber)   // persist the serial number for re-enrollment
    } else {
        onEnrollmentFailed()
    }
}
```

**Persist the returned serial number** — it is required for the streamlined re-enrollment flow (Step 5).

### Step 5: Re-enroll a Previously Enrolled Device

Re-enrollment supplies a stored serial number, so the merchant does not have to select or type it.
Both API styles are available, matching Step 4:

```kotlin
// Preferred — Activity Result API
enrollLauncher.launch(mposUi.tapToPhone.getReEnrollDeviceIntent(activity, serialNumber))

// Legacy — Views projects
mposUi.tapToPhone.reEnrollDevice(activity, serialNumber, requestCode)
```

Result handling is identical to Step 4.

### Step 6: Check Enrollment State

Query enrollment state before attempting transactions.

```kotlin
val isEnrolled = mposUi.tapToPhone.isDeviceEnrolled()
if (!isEnrolled) {
    // Route the user to enrollment (or re-enrollment if a serial number is stored)
}
```

#### Prefer `deviceEnrolledFlow()` for reactive UI

`TapToPhone` also exposes `deviceEnrolledFlow(): Flow<Boolean>`. For any UI that shows enrollment
state — a banner, a disabled pay button, a settings row — this is strictly better than polling
`isDeviceEnrolled()`, because the state changes while your screen is composed:

```kotlin
val isEnrolled by mposUi.tapToPhone.deviceEnrolledFlow()
    .collectAsStateWithLifecycle(initialValue = false)
```

Keep `isDeviceEnrolled()` for the imperative pre-transaction guard in `act_TTP_05` — a one-shot
boolean check is the right shape there.

#### Where the status and the enroll action go — owned by Gate 4

Do **not** place an enrollment control on the payment screen from this gate.
`act_TTP_04_menu-transactions-device-status.md` owns every enrollment *surface*: a **Device Status**
screen behind the app's collapsible top menu, plus a short status string in the top bar. After Gate 4
there must be no `Enroll Device` button anywhere else in the app — including one this gate created.

This split exists because the two concerns fail differently:

| Concern | Gate | What it owns |
|---------|------|--------------|
| enrollment **mechanism** | this gate (3) | `getEnrollDeviceIntent()`, re-enrollment, the `EnrollDeviceActivity` theme override, `isDeviceEnrolled()` gating, `deviceEnrolledFlow()`, the merchant-configuration check |
| enrollment **presentation** | Gate 4 | the menu, the Device Status screen, the top-bar status string, and removing every stray enroll affordance |

> **Placement is a correctness concern, not styling — which is why it has its own gate.** A tester
> selected products, found "Charge Card" greyed out, and could not tell why: the enrollment warning and
> its button sat in a section below the fold. The build was behaving exactly as designed and was still
> unusable. Gate 4 fixes that by keeping the *status* where the blocked control is and the *action*
> behind the menu.

If this gate needs a temporary way to trigger enrollment before Gate 4 runs, keep it minimal and
expect Gate 4 to remove it — and say in your report that you added one, so Gate 4's Step 5 cleanup
knows to look for it.

### Step 7: Confirm the merchant configuration actually loaded

Enrollment succeeding does **not** prove the credentials are good, and `isMposUiReady()` proves even
less — it only means `MposUi.create()` returned. There are three independent readiness states, and
this is the middle one:

**`getMerchantInformation()` is `@Nullable`.** Writing the non-null form does not compile:

```kotlin
// WRONG — getMerchantInformation() returns MerchantInformation?, so this is a compile error.
val currencies = mposUi.tapToPhone.getMerchantInformation().supportedCurrencies

// CORRECT — one-shot read. Null and empty mean the same thing: configuration not loaded.
val currencies = mposUi.tapToPhone.getMerchantInformation()
    ?.supportedCurrencies.orEmpty()
```

Reactively, in Compose — note the `initial = null`:

```kotlin
// merchantInformationFlow() returns a COLD Flow, not a StateFlow, so collectAsState needs an
// initial value — and null is the only one available. That makes the collected state
// MerchantInformation?, which is correct and expected, not a signature error to work around.
val merchantInformation by mposUi.tapToPhone.merchantInformationFlow()
    .collectAsState(initial = null)

val currencies = merchantInformation?.supportedCurrencies.orEmpty()
val configurationLoaded = currencies.isNotEmpty()
```

**An empty `supportedCurrencies` means the merchant configuration never loaded** — almost always
wrong or placeholder credentials. This is the signal to tell the developer their credentials are
wrong, rather than letting them discover it at the first tap. It is also worth checking that the
currency chosen for transactions appears in that set: if it does not, transactions fail at the
gateway rather than at compile time. (`supportedCurrencies` is a `Set<String>` of currency codes,
not a set of `Currency` enum values, so that check is a string comparison.)

**Treat null and empty as one condition.** The flow is cold, so the first value every observer sees
is the `null` initial — null is the *normal starting state*, not an error path. Any UI that reports
"payments unavailable" should key off `currencies.isEmpty()`, which covers both.

See `references/ttp/constants/ttp-sdk-requirements.md` § *Three Readiness States* and
§ *`TapToPhone` nullability*.

### Enrollment result Intent reference

The `enroll`/`reEnroll` activity returns a result `Intent` on success:

| Key | Value |
|-----|-------|
| `RESULT_CODE` | `EnrollResultIntent.ENROLLMENT_RESULT_CODE` (`3489523`) |
| `ENROLLMENT_RESULT_EXTRA` | `enrollmentResult` |
| `ENROLLMENT_RESULT_EXTRA_ENROLLED` | `deviceEnrolled` |
| `ENROLLMENT_RESULT_EXTRA_SERIAL_NUMBER` | `serialNumber` |

## Troubleshooting

See `references/ttp/troubleshooting.md#tap-to-pay` for enrollment failures: Tap to Pay Ready app
missing, NFC disabled, developer options enabled, rooted device, Play Integrity failure,
`allowBackup=true` Keystore conflict, invalid/placeholder credentials.

## Acceptance Criteria

This activity is complete when all of the following are true:

1. The Tap to Pay Ready app (`com.visa.kic.app.kernel`) is installed on the target device (verified via `adb` or the on-demand install path), and its version was recorded
2. An `MposUi` instance is created with `AccessoryFamily.TAP_TO_PHONE` and real TEST credentials from `act_TTP_02`
2a. **It is a process-lifetime holder, not a local `val`** — one of the three branches in `references/ttp/constants/ttp-sdk-requirements.md` § *The `MposUi` holder* was taken, no second `MposUi.create()` call exists anywhere in the project, and `MposUi.create()` is wrapped in a `catch (t: Throwable)` at the line where it actually executes
2b. **`mpos_accessor` is recorded in `project-plan.md`** and names a symbol that actually resolves in this project (Critical Rule 9). On the created-`PaymentApplication` branch, the class is registered via `android:name` in the manifest
3. Enrollment is implemented with **both** success and failure handled, and the returned serial number is persisted:
   - `UI_TOOLKIT = compose` (or lint rejects `onActivityResult`) → `getEnrollDeviceIntent()` with the Activity Result API
   - `UI_TOOLKIT = views` → either API is acceptable
3a. **`io.mpos.taptophone.ui.EnrollDeviceActivity` has an AppCompat-descended theme.** A scoped `<activity android:name="io.mpos.taptophone.ui.EnrollDeviceActivity" android:theme="…"/>` override exists in `$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml`, and the **merged** manifest's entry for that activity carries an `android:theme` attribute. The application theme was **not** changed to achieve this. Without the override, enrollment crashes on `onCreate` on any project whose application theme does not descend from `Theme.AppCompat` — every Compose-only app with no `themes.xml`
4. Re-enrollment is implemented using the stored serial number, via the matching API style
5. `isDeviceEnrolled()` gates transaction entry points; any UI that *displays* enrollment state uses `deviceEnrolledFlow()` rather than polling
5a. **No enrollment control was left on a payment screen by this gate.** Enrollment *presentation* — the collapsible menu, the Device Status screen, and the top-bar status string — belongs to Gate 4 (`act_TTP_04_menu-transactions-device-status.md`). If a temporary trigger was added here to test enrollment before Gate 4 runs, it is named in the report so Gate 4's Step 5 cleanup can remove it
6. All correct imports/types are used, resolved from `references/ttp/constants/ttp-sdk-requirements.md` § *Resolved API Names* — in particular `io.mpos.taptophone.EnrollResultIntent` and the **`io.mpos.paybutton`** variants of `SerialNumberInputMethod` / `ConfirmationScreenOption`
7. `getMerchantInformation()` (or `merchantInformationFlow()`) is used to detect an empty `supportedCurrencies`, and that condition produces a "credentials look wrong" message rather than being ignored. The read is **null-safe** (`?.supportedCurrencies.orEmpty()`) — `getMerchantInformation()` is `@Nullable`, and a cold flow's first emission is always the `null` initial value
7a. **Whenever the app has actually run — this gate's mid-run device test, or Gate 10 — `supportedCurrencies` was observed non-empty.** An observed-empty set is a **`FAIL` on this gate**, not a note under a `PASS`. See the block below; this is the one AC whose failure stops the run rather than deferring
8. The project builds successfully (`$GRADLE_MODULE_PATH:assembleDebug`)
9. The device pre-flight check (`ttp-sdk-requirements.md` § *Device pre-flight — write-and-run script*) was run, and the developer was told the required ordering: install → disable developer options → enroll
10. On a compatible physical device, enrollment completes with `ENROLLMENT_RESULT_EXTRA_ENROLLED` and `isDeviceEnrolled()` subsequently returns `true`

> **Device-dependent criteria:** AC 10 requires a compatible physical Android device. If no
> device is available in this environment, implement AC 1–9 and hand AC 10 off to
> **TTP Gate 10 (manual device validation)**. Do not report full PASS on AC 10 without a real
> successful enrollment.
>
> **If credentials are placeholders, AC 10 is `BLOCKED`, not `DEFERRED`.** Deferring implies it
> would succeed on hardware; it would not. Enrollment requires a valid MID and secret key.

> ### An observed-empty `supportedCurrencies` stops the run
>
> **AC 7 requires the *check* to exist. AC 7a requires its *answer* to be good.** Those had collapsed
> into one criterion, and the gap between them was reportable-but-harmless: the report block below
> offers `supportedCurrencies after enrollment: … | EMPTY (credentials not loaded)`, and a gate could
> print the `EMPTY` branch and still hand back `PASS` — because the only thing being graded was
> whether the detection code was written. So the single most direct evidence that these credentials do
> not work became a line of prose in a passing report, and Gates 4–9 then built five money-moving
> flows on top of it.
>
> **When `supportedCurrencies` is observed empty:**
>
> 1. Report this gate `FAIL (merchant configuration never loaded)`. Not `PASS`, and not
>    `PASS (deferred)` — nothing here is deferred, the answer arrived and it was bad.
> 2. Do not start Gate 4. Say why: every remaining gate consumes these credentials, so continuing
>    produces five more flows that fail the same way, all attributed to whichever gate is running when
>    someone finally taps a card.
> 3. Give the developer the differential — enrollment succeeding does **not** clear the credentials,
>    and the causes are distinguishable:
>
>    | If | Then |
>    |----|------|
>    | Enrollment succeeded, `supportedCurrencies` empty | Almost always **the wrong key type**. Tap to Pay needs an **Acceptance Devices Secret Key**; the Business Center recommends other key types that authenticate far enough to enroll and then carry no merchant configuration. Regenerate as that type for the transacting MID |
>    | The key was generated against a different MID than the one in `TTP_MERCHANT_ID` | MID/secret mismatch. Regenerate for the MID actually in use |
>    | The key is right and was working before | Rotated or expired. Regenerate |
>
>    Full table in `references/ttp/troubleshooting.md` § *Credentials — invalid, wrong key type, or
>    placeholder*.
> 4. Re-run `act_TTP_02` with the new key, then re-run this gate. A rebuild is enough to pick the
>    value up — `local.properties` is read at build time.
>
> **`EMPTY` and "not observed" are different report values and must not be written the same way.** If
> the app never ran, the line is `N/A (not observed — no device)` and AC 7a is `DEFERRED → Gate 10`,
> which is a legitimate pass. `EMPTY` means someone looked and the configuration was not there.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing TTP Gate 3 of the Tap to Pay on Android integration: device enrollment.

Working directory: <project root>

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — project context and TTP GATE 3 notes
2. `$SKILL_DIR/references/ttp/activities/act_TTP_03_device-enrollment.md` — the activity definition (full implementation guidance)
3. `$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md` — SDK constants and device compatibility requirements

DEVICE_AVAILABLE=<DEVICE_AVAILABLE>          (yes | no)
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
SOURCE_ROOT=<SOURCE_ROOT>                    (may be src/main/kotlin)

(ANDROID_MODULE_DIR and SOURCE_ROOT are relative to GRADLE_ROOT. cd "$GRADLE_ROOT"
before running any command. Build with:
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" > /tmp/ttp-build.log 2>&1
then check $? — never pipe the build.)

## Your task

Implement TTP GATE 3 using the activity file as your primary guide.

Critical constraints:
1. Use `AccessoryFamily.TAP_TO_PHONE` — never `MOCK`, never a card-reader family.
2. Create `MposUi` with the real TEST MID + secret from `act_TTP_02` (BuildConfig). Placeholder
   credentials will fail enrollment.
2a. **Build it as a durable holder, and follow the canonical recipe** in
   `"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` § *The `MposUi` holder — one
   instance, one owner, created by Gate 3*. Run its detection greps first and take **one** of the three
   branches: extend the existing `Application` subclass, create `PaymentApplication`, or add a
   singleton-scoped provider to the DI graph. Never create a second `Application` subclass, never
   repoint `android:name` on a DI-owned one, and never leave `MposUi.create()` unguarded — see Critical
   Rules 7 and 8. Do not improvise a fourth branch.
2b. **Write the accessor into `project-plan.md` as `mpos_accessor` before you report** (Critical
   Rule 9). Gate 4 runs next and cannot query `transactionModule` without it; Gates 5–9 substitute it
   into their samples. An empty value is a `FAIL`, not a follow-up.
3. Implement enrollment, re-enrollment, and `isDeviceEnrolled()`. Handle BOTH success and failure.
   Persist the returned serial number for re-enrollment.
4. **Pick the API by UI_TOOLKIT.** If UI_TOOLKIT = compose (or the project's lint/detekt rejects
   the deprecated `onActivityResult`), use `getEnrollDeviceIntent(activity)` /
   `getReEnrollDeviceIntent(activity, serial)` with the Activity Result API. Only use
   `enrollDevice(activity, requestCode)` + `onActivityResult` on a Views project.
4aa. **Create NO `Activity` of your own for enrollment** (Critical Rule 10). The returned `Intent`
   already targets an Activity that ships in the SDK and is declared in the SDK's manifest — launch it
   from a launcher on an existing screen, exactly as Gate 5 launches payment. A wrapper `Activity`
   compiles, passes every quality gate, and throws `ActivityNotFoundException` the first time a
   merchant taps **Enroll**. Do not read constraint 4a as a reason to create one: that override
   re-declares the SDK's class to attach a theme to it, nothing more.
4a. **Add the `EnrollDeviceActivity` theme override to the manifest** — see the activity file, Step 4,
   *CRITICAL — `EnrollDeviceActivity` needs an AppCompat theme*. The SDK declares no theme on that
   activity, so on any project whose application theme does not descend from `Theme.AppCompat` (every
   Compose-only app with no `res/values/themes.xml`) enrollment crashes on `onCreate`. Add the scoped
   `<activity>` override. Do **not** change the application theme — that is an app-wide restyle to fix
   one SDK screen. This makes GATE 3 a manifest-editing gate: run the ANDROID quality task too (see
   below).
5. Resolve imports from `"$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md"` § *Resolved API Names*.
   `EnrollResultIntent` is in `io.mpos.taptophone`; `SerialNumberInputMethod` and
   `ConfirmationScreenOption` must be the **`io.mpos.paybutton`** variants — both names exist in
   both packages and the wrong one fails at the `TapToPhoneConfiguration` call site, not at the import.
6. Any UI that *displays* enrollment state uses `deviceEnrolledFlow()`, not polling.
6a. **Do NOT build enrollment UI placement here.** The menu, the Device Status screen and the
   top-bar status string are Gate 4's (`act_TTP_04_menu-transactions-device-status.md`). If you add a
   temporary trigger so enrollment can be tested now, say so in the report.
7. Use `getMerchantInformation()` / `merchantInformationFlow()` to detect an empty
   `supportedCurrencies` and surface "credentials look wrong" — enrollment succeeding is not proof
   the credentials are good, and `isMposUiReady()` proves even less.
7a. **If the app runs and `supportedCurrencies` comes back empty, this gate is a `FAIL` and Gate 4
   does not start.** Writing the check is AC 7; its answer being good is AC 7a. Reporting `EMPTY`
   under a `PASS` is not allowed — see § *An observed-empty `supportedCurrencies` stops the run*. The
   usual cause is the wrong key type, and it is fixable in minutes; five gates built on top of it are
   not.
8. Ensure the Tap to Pay Ready app (`com.visa.kic.app.kernel`) is installed, or rely on the SDK's
   in-enrollment install prompt. Record its version.
9. All paths come from ANDROID_MODULE_DIR / SOURCE_ROOT. Never hardcode `app/`.

## Mandatory verification

Build must pass:
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
# Enrollment must handle failure, not just success
grep -rn "onEnrollmentFailed\|ENROLLMENT_RESULT_EXTRA_ENROLLED" "$SOURCE_ROOT" \
  --include="*.kt" --include="*.java" \
  && echo "OK" || echo "FAIL: enrollment result handling missing"

# Compose projects must not use the deprecated path
if [ "$UI_TOOLKIT" = "compose" ]; then
  grep -rn "onActivityResult" "$SOURCE_ROOT" --include="*.kt" \
    && echo "FAIL: use getEnrollDeviceIntent + Activity Result API on Compose" || echo "OK"
fi

# The paybutton variants are the correct ones for TapToPhoneConfiguration
grep -rn "io.mpos.taptophone.SerialNumberInputMethod\|io.mpos.taptophone.ConfirmationScreenOption" \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "FAIL: use the io.mpos.paybutton variants" || echo "OK"
```

```bash
# --- Critical Rule 10: no Activity of your own for enrollment. ---------------------------------
# The SDK owns the enrollment screens. Both failures below are GREEN at build time and only crash
# when a merchant taps Enroll, so grep is the only pre-device detection there is.

# 1. A class of your own named EnrollDeviceActivity is always this bug — that simple name belongs
#    to io.mpos.taptophone.ui, and Critical Rule 6 only ever REFERENCES it from the manifest.
grep -rnE '^[[:space:]]*(public[[:space:]]+)?(class|object)[[:space:]]+EnrollDeviceActivity\b' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  && echo "FAIL: this project DECLARES EnrollDeviceActivity — delete it and launch the SDK Intent (Step 4a)" \
  || echo "OK: EnrollDeviceActivity is only referenced, never declared here"

# 2. Any enrollment-named Activity this project declares must be BOTH intentional and declared in
#    the manifest. The wrapper-Activity bug shows up here even when it avoids the name in check 1.
MANIFEST="$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml"
grep -rhoE '(class|object)[[:space:]]+([A-Za-z0-9_]*([Ee]nroll|[Ee]nrolment|[Ee]nrollment)[A-Za-z0-9_]*Activity)\b' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" --exclude-dir=build \
  | awk '{print $2}' | sort -u \
  | while read -r A; do
      grep -q "android:name=\"[^\"]*[.]${A}\"\|android:name=\"${A}\"" "$MANIFEST" \
        && echo "CHECK: $A is declared in the manifest — confirm it HOSTS the launcher and does not wrap the SDK Intent (Critical Rule 10)" \
        || echo "FAIL: $A is an Activity in this project and is NOT in $MANIFEST — ActivityNotFoundException on the first Enroll tap. Delete it; launch the SDK Intent from an existing screen (Step 4a)"
    done
echo "NOTE: no output above means this project declares no enrollment Activity of its own — the correct state"
```

```bash
# --- The holder: exactly ONE MposUi, and an accessor Gate 4 can actually use. -----------------
# Critical Rules 7 and 9. Both failures below are silent at build time and surface in Gate 4.

# 1. One construction site, not one per screen. A second create() gives the app two competing
#    owners of the same SDK object, and the enrollment one usually wins by being reached first.
CREATE_SITES=$(grep -rn 'MposUi\.create(' "$SOURCE_ROOT" \
  --include="*.kt" --include="*.java" --exclude-dir=build | wc -l | tr -d ' ')
echo "MposUi.create() call sites: $CREATE_SITES"
[ "$CREATE_SITES" = "1" ] \
  || echo "FAIL: expected exactly 1 MposUi.create() site — see the constants file § The MposUi holder"

# 2. The construction must be guarded where it EXECUTES, not where the field is declared.
grep -rn -A3 'MposUi\.create(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  --exclude-dir=build | grep -q 'catch' \
  && echo "OK: create() appears inside a guarded block" \
  || echo "CHECK: no catch near MposUi.create() — Critical Rule 8. On the DI branch confirm the guard is at first injection"

# 3. mpos_accessor must be recorded AND must name a symbol that exists in this project.
MPOS_ACCESSOR=$(grep -E '^mpos_accessor:' "$GRADLE_ROOT/project-plan.md" 2>/dev/null \
  | sed -E 's/^mpos_accessor:[[:space:]]*//; s/[[:space:]]*#.*$//')
[ -n "$MPOS_ACCESSOR" ] \
  || { echo "FAIL: mpos_accessor is empty in project-plan.md — Critical Rule 9. Gate 4 cannot run"; }
echo "mpos_accessor=$MPOS_ACCESSOR"

# The symbol before the first '.' is the holder's type or object name; it must resolve somewhere.
HOLDER="${MPOS_ACCESSOR%%.*}"
if [ -n "$HOLDER" ] && [ "$HOLDER" != "$MPOS_ACCESSOR" ]; then
  grep -rqn "class $HOLDER\|object $HOLDER" "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
    && echo "OK: $HOLDER is declared in this project" \
    || echo "FAIL: mpos_accessor names $HOLDER, which no file in $SOURCE_ROOT declares"
else
  echo "NOTE: mpos_accessor is a bare injected reference ($MPOS_ACCESSOR) — DI branch; verify by build, not by grep"
fi
```

```bash
# EnrollDeviceActivity theme — without this, the first real-hardware tap crashes on onCreate.
MANIFEST="$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml"
[ -f "$MANIFEST" ] || { echo "FAIL: manifest not found at $MANIFEST"; exit 1; }

grep -q 'io\.mpos\.taptophone\.ui\.EnrollDeviceActivity' "$MANIFEST" \
  && echo "OK: EnrollDeviceActivity theme override present" \
  || echo "FAIL: no EnrollDeviceActivity override — enrollment crashes on a non-AppCompat theme"

# The application theme must NOT have been repointed to fix this. Only a diff can tell an app that
# already had an AppCompat theme from one this gate rewrote, so fall back to reporting UNVERIFIED
# rather than guessing from current content.
if git -C "$GRADLE_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
  git -C "$GRADLE_ROOT" diff -- "$MANIFEST" | grep -E '^[-+][^-+]' | grep -q '<application\|android:theme=' \
    && echo "REVIEW: this gate changed an <application> attribute — confirm it is not the app theme" \
    || echo "OK: no <application> attribute was changed by this gate"
else
  echo "application theme: UNVERIFIED (not a git repository) — state in the report that the scoped"
  echo "  <activity> override was used and the application theme was left alone"
fi

# And it must survive the merge with a theme attached (see the activity file, Step 4).
MERGED_MANIFEST=$(find "$ANDROID_MODULE_DIR/build/intermediates" \
  -path '*merged_manifest*' -name AndroidManifest.xml 2>/dev/null | grep -i '/debug' | head -1)
if [ -z "$MERGED_MANIFEST" ]; then
  echo "EnrollDeviceActivity theme: UNMEASURED (no merged manifest) — not the same as OK"
else
  tr '\n' ' ' < "$MERGED_MANIFEST" | grep -oE '<activity[^>]*EnrollDeviceActivity[^>]*>' \
    | grep -q 'android:theme' \
    && echo "OK: merged EnrollDeviceActivity entry carries android:theme" \
    || echo "FAIL: merged EnrollDeviceActivity entry has NO android:theme"
fi
```

If DEVICE_AVAILABLE = yes: run the device pre-flight check first (`ttp-sdk-requirements.md` §
*Device pre-flight — write-and-run script*). Then install the
APK, ask the developer to disable developer options (you will lose adb access — that is expected
and cannot be automated), and have them run enrollment. Confirm the result Intent returns
ENROLLMENT_RESULT_EXTRA_ENROLLED and isDeviceEnrolled() returns true. Report the serial number and
whether supportedCurrencies is non-empty.

If supportedCurrencies comes back EMPTY: report this gate FAIL (merchant configuration never
loaded), do NOT proceed to Gate 4, and give the developer the wrong-key-type / MID-mismatch /
expired-key differential from the activity file. Enrollment succeeding does not clear the
credentials. Do not report PASS with an EMPTY line in the block below — see the activity file
§ "An observed-empty supportedCurrencies stops the run".

If DEVICE_AVAILABLE = no: complete the code (AC 1–9), verify the build, and mark on-device
enrollment (AC 10) as DEFERRED → TTP Gate 10 (manual device validation). Do NOT fabricate a
successful enrollment.

If credentials are placeholders: mark AC 10 BLOCKED (placeholder credentials), not DEFERRED.

### Quality-gate diff (mandatory when the project has one)

`baseline_quality_task` in `project-plan.md` names the project's own static-analysis task, measured
by Gate 0 **before any change**. If it is not `none`, re-run it and compare.

**This gate needs both baselines.** Gate 0 measures two: `BASELINE_QUALITY_TASK` (the Kotlin tool —
detekt / ktlint / spotless) and `BASELINE_QUALITY_TASK_2` (the Android tool — `lint`). Gate 3 edits
`AndroidManifest.xml` for the `EnrollDeviceActivity` theme override, and a Kotlin linter does not read
manifests — so running only the Kotlin task here produces a diff that is identical to baseline *by
construction*, which is the absence of a measurement rather than evidence of no regression. See
`workflow.md` § *Gate Execution Protocol* step 6.

```bash
cd "$GRADLE_ROOT" || exit 1

for pair in "1:$BASELINE_QUALITY_TASK" "2:$BASELINE_QUALITY_TASK_2"; do
  N=${pair%%:*}; TASK=${pair#*:}
  [ -n "$TASK" ] && [ "$TASK" != "none" ] || { echo "QUALITY_TASK_$N=none — skipped"; continue; }
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:$TASK" \
    > "/tmp/ttp-quality-$N.log" 2>&1
  QUALITY_EXIT=$?     # capture BEFORE any other command runs — $? is overwritten by the next one
  echo "QUALITY_TASK_$N=$TASK QUALITY_EXIT_$N=$QUALITY_EXIT"
  tail -40 "/tmp/ttp-quality-$N.log"
done
```

Compare task 1 against `baseline_quality_findings` and task 2 against `baseline_quality_findings_2`.
Name both tasks in the gate report — "quality gate: no new findings" without naming the task is
unfalsifiable.

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
TTP GATE 3 REPORT
Status: PASS | FAIL | PASS (on-device enrollment DEFERRED to TTP Gate 10) | PASS (enrollment BLOCKED — placeholder credentials)
Tap to Pay Ready app: INSTALLED (version <v>) | NOT INSTALLED (SDK will prompt) | N/A (no device)
EnrollDeviceActivity theme override: ADDED (<theme>) | ALREADY PRESENT | MISSING (enrollment will crash)
  Merged manifest confirms android:theme: YES | NO | UNMEASURED (no build output)
  Application theme changed: NO | YES (<why — this should not happen>)
MposUi holder branch: created PaymentApplication | extended <ExistingClass> | DI-owned (<framework>, provider in <file>)
  mpos_accessor written to project-plan.md: <the symbol> — MUST NOT be empty (Critical Rule 9)
  MposUi.create() call sites in the project: 1 (any other number is a FAIL)
  create() guarded with catch (t: Throwable) at the line it executes: YES | NO
  @Suppress("TooGenericExceptionCaught") present with a reason comment: YES | N/A (DI branch guards elsewhere)
  PaymentApplication registered via android:name: YES | N/A (extended existing | DI-owned)
Enrollment API used: Activity Result (getEnrollDeviceIntent) | legacy (enrollDevice + onActivityResult)
Reason for that choice: <UI_TOOLKIT / lint constraint>
Activities this gate created for enrollment: NONE (the only correct answer — Critical Rule 10)
  Enrollment Intent launched from: <existing screen / launcher> — NOT a wrapper Activity
Re-enrollment implemented: YES | NO
Serial number persisted to: <location>
isDeviceEnrolled() gating implemented: YES | NO
deviceEnrolledFlow() used for state display: YES | NO | N/A (no such UI)
Temporary enrollment trigger added for testing: NO | YES (<file> — Gate 4 Step 5 must remove it)
Enrollment presentation deferred to Gate 4: YES
Merchant configuration check implemented: YES | NO
Device pre-flight: PASS | FAIL (<failures>) | NOT RUN (no device)
Developer told the install → disable-dev-options → enroll ordering: YES | N/A
On-device enrollment result: ENROLLED (serial: <sn>) | FAILED (<reason>) | DEFERRED (no device) | BLOCKED (placeholder credentials)
supportedCurrencies after enrollment: <set> | EMPTY (credentials not loaded — this gate FAILS, Gate 4 does not start) | N/A (not observed — no device; AC 7a DEFERRED → Gate 10)
Build: SUCCESS | FAILED
Files modified: <list>
Acceptance criteria met: <list>
```
```
