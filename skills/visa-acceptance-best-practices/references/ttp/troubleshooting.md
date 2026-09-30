# Troubleshooting — Tap to Pay on Android

Tap to Pay on Android (Tap to Phone / SoftPOS) integration troubleshooting, consolidated into a
single reference. These notes are developed from real integration testing and
enterprise-environment experience — information **not available** in the official documentation.

Unlike a terminal-based integration, Tap to Pay runs on commercial off-the-shelf Android phones and
delegates payment capture to the separate **Tap to Pay Ready app** (`com.visa.kic.app.kernel`)
behind a transparent overlay. There is no accessory to pair and no connection state to poll — but
there **is** a per-device enrollment step that gates every transaction, and it is the single largest
source of first-tap failures.

## Topics

- [Tap to Pay](#tap-to-pay) — setup, network, credentials, enrollment, build configuration
- [TTP charge](#ttp-charge)
- [TTP refund](#ttp-refund)
- [TTP tipping](#ttp-tipping)
- [TTP pre-auth](#ttp-pre-auth)
- [TTP incremental auth](#ttp-incremental-auth)
- [TTP account verification](#ttp-account-verification)

> **Paths in this file use `$GRADLE_ROOT`, `$ANDROID_MODULE_DIR`, `$GRADLE_MODULE_PATH` and
> `$SOURCE_ROOT`** — because many projects have no `app` module, keep sources in `src/main/kotlin`,
> and sit inside a larger multi-project build whose wrapper is in an ancestor directory.
>
> All four are resolved **once** by the planning gate and recorded in `project-plan.md`. Load them
> with the path preamble in
> `references/ttp/constants/ttp-sdk-requirements.md` § *Project Path Variables*, which also lists
> which variable owns which file. Do not re-derive them here — a second copy of the resolution logic
> is a second thing to drift.
>
> Two ways a diagnostic in this file can lie to you:
>
> - **A grep against a path that does not exist** reports zero matches and exit status 1, which looks
>   exactly like "checked and clean". If a check comes back suspiciously empty, verify the path first.
> - **A build piped into `tail`** reports the *filter's* exit status, so a failed build looks like a
>   passing one. Redirect to a log, capture `$?`, then read the log.

---

## Tap to Pay

*Troubleshooting: SDK Setup, Network Access, Credentials, Enrollment & Build Configuration*

The shared foundation. Every gate-specific section below refers back here rather than repeating
these failures.

**Appears in:** TTP Gate 1 (SDK dependencies), TTP Gate 2 (credentials), TTP Gate 3 (enrollment),
and as the fallback for every transaction gate.

> Version constraints and the full device-compatibility matrix live in
> `references/ttp/constants/ttp-sdk-requirements.md`. This file never restates a version number.

---

### Network access — `repo.visa.com` unreachable

| Error / Symptom | Cause | Fix |
|---|---|---|
| `Connection timed out` / `Connection refused` reaching `repo.visa.com` | Corporate firewall or proxy blocking outbound HTTPS | Detect and configure a proxy — see the escalation sequence below |

**Verification command:**

```bash
curl -sS --max-time 10 -o /dev/null -w "%{http_code}\n" https://repo.visa.com/mpos-releases/
```

HTTP 200, 301 or 302 means reachable. **Do NOT proceed to Gradle configuration until this
succeeds.** In particular, do **not** comment out the SDK dependencies or revert `settings.gradle`
as a workaround — the repository URL is correct, and removing it converts a network problem into a
much harder-to-diagnose build problem.

---

### SSL error — `PKIX path building failed`

| Error / Symptom | Cause | Fix |
|---|---|---|
| `PKIX path building failed` / `unable to find valid certification path` during Gradle sync or wrapper download | Corporate SSL inspection is substituting its own CA, which the JDK truststore does not trust | Configure the proxy in `~/.gradle/gradle.properties`, or import the corporate CA into the JDK truststore |

**Fix 1 — proxy properties.** The `systemProp.https.*` properties apply to every HTTPS connection
Gradle makes, including the wrapper download.

**Fix 2 — import the corporate CA:**

```bash
echo "$JAVA_HOME"
sudo keytool -importcert \
  -file "<corporate_ca_cert_path>" \
  -keystore "$JAVA_HOME/lib/security/cacerts" \
  -alias "corp-proxy-ca" \
  -storepass changeit \
  -noprompt
```

If the CA certificate path is unknown, ask the developer:

> "The Gradle download is failing with an SSL certificate error, which usually means corporate SSL
> inspection is active. Could you provide the path to your corporate CA certificate (`.crt` or
> `.pem`)?"

---

### Gradle wrapper download fails

| Error / Symptom | Cause | Fix |
|---|---|---|
| `java.io.FileNotFoundException: …/wrapper/dists/gradle-*-all.zip.lck (Operation not permitted)` or `(Permission denied)` | The Gradle **user home** is not writable. The wrapper needs it to unpack and lock the distribution. This happens before Gradle evaluates any project code, so it is **not** a build failure and says nothing about the project | Grant write access to the Gradle user home (normally `~/.gradle`), or point `GRADLE_USER_HOME` at a writable cache directory: `GRADLE_USER_HOME=/path/to/writable "$GRADLE_ROOT/gradlew" …` |
| `Could not find or load main class org.gradle.wrapper.GradleWrapperMain` | Wrapper JAR missing from `gradle/wrapper/` | Regenerate with a system Gradle, or restore it from version control |
| SSL or timeout errors while downloading the distribution | Corporate proxy intercepting `services.gradle.org` | Configure the proxy in `~/.gradle/gradle.properties` — the same `systemProp.https.*` settings apply |

```bash
grep distributionUrl "$GRADLE_ROOT/gradle/wrapper/gradle-wrapper.properties" 2>/dev/null
"$GRADLE_ROOT/gradlew" --version 2>&1 | head -20
```

**Do NOT proceed until `"$GRADLE_ROOT/gradlew" --version` completes successfully.**

> **Distinguish an environment failure from a build failure before reporting a gate `FAIL`.** A stack
> trace mentioning `org.gradle.wrapper.Install`, a `.lck` file, or `Operation not permitted` means Gradle
> never started — no project code was compiled, so the result is not evidence about the gate's changes.
> Report it as environment friction, fix the permission, and re-run. Recording it as a code failure sends
> the next agent looking for a defect that does not exist.

> The wrapper lives at the **Gradle root**, which is not necessarily the directory you are in — see
> `references/ttp/constants/ttp-sdk-requirements.md` § *Project Path Variables*. A
> `no such file or directory: ./gradlew` is a path error, not a broken wrapper.

---

### Proxy escalation sequence

Try each approach in order and stop at the first that works.

**A — detect an existing proxy:**

```bash
echo "HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY"
echo "http_proxy=$http_proxy https_proxy=$https_proxy"
scutil --proxy                                            # macOS system proxy
grep -i proxy ~/.gradle/gradle.properties 2>/dev/null || true
```

**B — verify a candidate proxy actually reaches the repository:**

```bash
curl -sS --max-time 10 --proxy "http://<proxy_host>:<proxy_port>" \
  -o /dev/null -w "%{http_code}\n" https://repo.visa.com/mpos-releases/
```

**C — configure it** in `~/.gradle/gradle.properties` (create the file if absent):

```properties
systemProp.http.proxyHost=<proxy_host>
systemProp.http.proxyPort=<proxy_port>
systemProp.https.proxyHost=<proxy_host>
systemProp.https.proxyPort=<proxy_port>
systemProp.http.nonProxyHosts=localhost|127.0.0.1
```

Proxy settings belong at the **user level** (`~/.gradle/gradle.properties`), never inside the
project, so they are not committed to source control.

**D — ask the developer:**

> "I cannot reach `repo.visa.com` directly or through a proxy. How does your team normally resolve
> Maven dependencies — a network-specific proxy host and port, or a VPN? You can check your
> browser's proxy settings, `~/.gradle/init.gradle`, or ask your team lead / IT support."

Also check whether an init script is silently replacing the repository set:

```bash
cat ~/.gradle/init.gradle 2>/dev/null
```

---

### Dependency resolution — `Could not resolve io.payworks:mpos.android.taptophone`

| Error / Symptom | Cause | Fix |
|---|---|---|
| `Could not resolve io.payworks:mpos.android.taptophone` | Almost always network, not configuration — the machine cannot reach `repo.visa.com` | Work through [Network access](#tap-to-pay) above first |
| `Could not resolve io.payworks:mpos.android.taptophone:<version>` while other `io.payworks` artifacts resolve | The requested version has aged out of the repository | Query the repository for a current version and update the constant in `references/ttp/constants/ttp-sdk-requirements.md` |
| `Could not find io.payworks:mpos.android.accessories.<name>` | Wrong artifact — anything under `mpos.android.accessories.` is a card-reader accessory library and does not belong in a Tap to Pay project | The Tap to Pay accessory artifact is `io.payworks:mpos.android.taptophone` |
| Only one of the two dependencies resolves | The UI library and the accessory library were declared at different versions | Declare both at the **same** version |
| `401 Unauthorized` / `Received status code 401` from the repository | **Authentication**, not coordinates. The mirror needs credentials the build is not being given | **Do NOT edit the dependency block.** See the row below |

> **A `401` is an auth problem wearing a dependency problem's clothes.** Gradle reports it at the
> dependency line, so it reads as "my coordinates are wrong" — and an agent that responds by
> "correcting" verified artifact names, or by adding a second repository, turns a working
> configuration into a broken one while the actual cause goes untouched.
>
> The usual cause is a repository block that reads credentials from **JVM system properties**
> (`System.getProperty(...)`), which are absent from a bare `gradlew` invocation. Check:
>
> ```bash
> cd "$GRADLE_ROOT" || exit 1
> grep -rn -A6 'maven *{\|repositories' build.gradle* settings.gradle* 2>/dev/null \
>   | grep -nE 'System\.getProperty|System\.getenv|credentials'
> ```
>
> If the block uses `System.getProperty`, the build only resolves when those properties are supplied
> — either as `-D<name>=<value>` on every invocation, or as `systemProp.<name>=<value>` in the
> developer's `~/.gradle/gradle.properties`. Record them in `GRADLE_ARGS` so every gate carries them.
> Never print the values and never copy them into a project file. See
> `references/ttp/constants/ttp-sdk-requirements.md` § *Where repository credentials come from*.

> **The six-version window.** The repository keeps only the six most recent SDK versions. When a new
> version is published the oldest is removed and can no longer be resolved for a new build — so a
> project that built months ago can start failing with no local change at all. Never hardcode a
> version on the assumption it stays available; query for the current one and update the constants
> file.

```bash
# Confirm the repository is reachable before blaming the coordinates
curl -sS --max-time 10 -o /dev/null -w "%{http_code}\n" https://repo.visa.com/mpos-releases/

# Confirm the exclusiveContent filter is present and names the right group
grep -rn "exclusiveContent\|includeGroup\|mpos-releases" settings.gradle settings.gradle.kts 2>/dev/null
```

The Maven **group** is `io.payworks`; the **package root** inside the artifacts is `io.mpos`. Both
are correct — do not "fix" one to match the other.

---

### `matchingFallbacks` — `No matching variant` / `Could not resolve debug`

| Error / Symptom | Cause | Fix |
|---|---|---|
| `No matching variant of io.payworks:… was found` / `Could not resolve … debug` | The SDK publishes a **release build type only**, and the app's `debug` build type has no fallback | Set `matchingFallbacks` to `release` in the `debug` build type |
| Groovy syntax error or method-not-found inside the `debug` block | Kotlin-DSL `matchingFallbacks` syntax used in a Groovy `.gradle` file | Use the DSL-appropriate form below |

**Kotlin DSL (`build.gradle.kts`) — only valid in `.kts` files:**
```kotlin
debug {
    matchingFallbacks.apply {
        clear()
        add("release")
    }
}
```

**Groovy DSL (`build.gradle`) — direct assignment:**
```groovy
debug {
    matchingFallbacks = ['release']
}
```

Check the file extension before writing this — `.gradle` is Groovy, `.gradle.kts` is Kotlin DSL.
Getting it backwards produces an error that looks unrelated to dependency resolution.

---

### `allowBackup="true"` — SDK functionality error at runtime

| Error / Symptom | Cause | Fix |
|---|---|---|
| The SDK reports a functionality error, or previously-working crypto operations start failing after a device restore | The SDK installs and stores cryptographic keys in the Android Keystore. Enabling automatic backup restores the default encryption preferences and invalidates those keys. | Set `android:allowBackup="false"` on `<application>` |

```xml
<application
    android:allowBackup="false"
    ... >
```

```bash
grep -n "allowBackup" "$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml"
# Anything other than "false" is a defect. Absent is also a defect — the platform default is true.
```

This one is nasty because it stays invisible until a restore happens: a phone that was enrolled and
working reappears broken on a replacement handset, with nothing in the app's own code having changed.

---

### Credentials — invalid, wrong key type, or placeholder

| Error / Symptom | Cause | Fix |
|---|---|---|
| Enrollment or authentication rejected with an invalid-credentials error | Wrong, rotated, or expired secret key | Regenerate the key and update `local.properties`; re-run `act_TTP_02` |
| Credentials look correct but are rejected | **The wrong key type was generated.** Tap to Pay requires an **Acceptance Devices Secret Key** — the other recommended key types in the Business Center will not work. | Generate an **Acceptance Devices Secret Key** for the transacting MID |
| **Enrollment succeeds, but `getMerchantInformation()?.supportedCurrencies.orEmpty()` is empty** — no error, no exception, and `isDeviceEnrolled()` returns `true` | Same wrong key type, and this is the shape it usually takes. The other Business Center key types authenticate far enough to complete enrollment and then carry **no merchant configuration**, so the failure surfaces only at the first tap — several gates after the mistake. There is nothing to catch: the SDK reports success at every step | Regenerate as an **Acceptance Devices Secret Key** for the transacting MID, update `local.properties`, rebuild, re-enroll. Rule out the two neighbours first: a key generated against a *different* MID than `TTP_MERCHANT_ID` gives the same empty set, as does a rotated or expired key. `act_TTP_03` AC 7a treats an observed-empty set as a gate failure for this reason |
| Auth failure with a valid-looking MID and key | MID / secret mismatch — the key was generated against a different MID | Regenerate the key for the MID actually in use |
| Enrollment fails instantly with no network activity | Placeholder credentials (`MERCHANT_ID_HERE` / `MERCHANT_SECRET_HERE`) reached enrollment | Supply real TEST credentials — `act_TTP_02` Step 4 warns that enrollment cannot succeed on placeholders |
| `BuildConfig.TTP_MERCHANT_ID` is empty at runtime | `project.findProperty()` was used to read `local.properties`. Gradle project properties and `local.properties` are separate systems, and `findProperty()` does not read the latter. | Load the file explicitly with `Properties().load(...)` as in `act_TTP_02` Step 3 |
| `NoSuchMethodError` on an initialize call | Old API shape | Use `MposUi.create(...)` |
| The secret key cannot be found again | The key is displayed **once**. Leaving the Key Generation page makes that key unrecoverable. | Generate a new key — the old one cannot be retrieved |

```bash
# Presence only — NEVER print the value
grep -q "TTP_MERCHANT_ID=" local.properties && echo "present" || echo "MISSING"
grep -q "TTP_MERCHANT_SECRET=" local.properties && echo "present" || echo "MISSING"
```

> **Never echo, log, or read back the secret key.** An empty `BuildConfig` field is diagnosable from
> presence alone; printing the value is never necessary and is a leak.

---

### Enrollment failures

Enrollment validates the whole device, not just the app. A device that fails **any** compatibility
requirement in `references/ttp/constants/ttp-sdk-requirements.md` cannot be enrolled, and until it is
enrolled **no transaction can succeed** — this is the most common cause of a failed first tap.

| Error / Symptom | Cause | Fix |
|---|---|---|
| **The app crashes the instant enrollment is launched**, with `IllegalStateException: You need to use a Theme.AppCompat theme (or descendant) with this activity` at `AppCompatDelegateImpl.createSubDecor` → `EnrollDeviceActivity.onCreate`. Never reaches a serial-number screen | `io.mpos.taptophone.ui.EnrollDeviceActivity` is an `AppCompatActivity`, but the SDK's own manifest declares **no `android:theme`** on it — so it inherits the host application theme, and `AppCompatDelegate` throws if that theme is not AppCompat-descended. **The stack trace points at AppCompat internals, not at the manifest gap that causes it.** Compose-only apps are the usual casualty: no `res/values/themes.xml`, so the app sits on a platform theme (`@android:style/Theme.Material.*`) with nothing AppCompat to inherit | Add a scoped override to your own manifest, inside `<application>`: `<activity android:name="io.mpos.taptophone.ui.EnrollDeviceActivity" android:theme="@style/Theme.AppCompat.Light.NoActionBar" />`. See `act_TTP_03` Step 4. **Do not** change the application theme instead — that restyles the whole app to fix one SDK screen. Note `Theme.Material3.*` from the Material *library* IS AppCompat-descended; the platform's `android:Theme.Material` is not |
| The `EnrollDeviceActivity` override causes a build failure: `Attribute activity@theme … is also present at [io.payworks:mpos.android.taptophone]` | A newer SDK version now declares its own theme on that activity, so the override is a merge conflict rather than an addition | Add `tools:replace="android:theme"` to the override, and ensure `xmlns:tools="http://schemas.android.com/tools"` is on the `<manifest>` tag |
| **`ActivityNotFoundException: Unable to find explicit activity class {<your.app>/<your.package>.EnrollDeviceActivity}; have you declared this activity in your AndroidManifest.xml?`** on the first **Enroll** or **Re-enroll** tap | An `Activity` of your own was written to wrap the SDK's enrollment `Intent`, and never declared in the manifest. Note the package in the message: **your** package, not `io.mpos.taptophone.ui`. The build is green and both quality baselines pass, so nothing catches it before a device. Often triggered by misreading the theme-override rule as "an `EnrollDeviceActivity` must exist in my app" | **Delete the wrapper.** The `Intent` from `getEnrollDeviceIntent(activity)` / `getReEnrollDeviceIntent(activity, serial)` already targets an Activity inside the SDK, declared in the SDK's manifest — launch it from a launcher on an existing screen, the same pattern the payment flow uses. Do **not** fix this by declaring your wrapper in the manifest; there is no component of yours to register. `act_TTP_03` Critical Rule 10 and Step 4a. Confirm with `adb logcat -d -b crash` |
| Enrollment prompts to install an app, or fails without reaching a serial-number screen | The **Tap to Pay Ready app** (`com.visa.kic.app.kernel`) is not installed. It is a mandatory PCI MPoC core component, not an optional add-on. | Install it from the Google Play Store, or accept the SDK's in-enrollment install prompt |
| Enrollment fails on a device with no contactless hardware | No NFC chip | Use a device with NFC — there is no software fallback |
| Enrollment fails on an NFC-capable device | NFC is present but **disabled** in system settings | Enable NFC, then retry |
| Enrollment rejected on a working developer handset | **Developer options are enabled.** This is a hard requirement and it catches almost every developer at least once — the phone you have been debugging on is the phone that cannot enroll. | Disable developer options in system settings, then retry |
| Enrollment rejected | Device is **rooted** | Use an unrooted device — no workaround exists |
| Enrollment rejected with an integrity failure | The Play Integrity API is not returning a `DEVICE_INTEGRITY` verdict | Use a device that passes Play Integrity — custom ROMs and unlocked bootloaders typically will not |
| Enrollment rejected | No Google Mobile Services or no Google Play Store | **Use a different device.** GMS cannot be side-loaded onto a build that shipped without it — enterprise, AOSP and some regional builds have no Google services and can never be enrolled. Play Store alone is not enough; both must be present |
| Enrollment rejected, or intermittent auth failures | Automatic time and date detection is **off**, so the device clock has drifted | Enable automatic time and date, then retry |
| Enrollment rejected on an older handset | Android older than the minimum, or a security patch level older than the required date | Use a device meeting the OS and security-patch minimums in the constants file. An OS no longer receiving security updates is unsupported. |
| Enrollment never succeeds on an emulator | Emulators cannot satisfy NFC, hardware keystore, or Play Integrity | **Enrollment on an emulator is impossible.** Use physical hardware. |
| `isDeviceEnrolled()` returns `false` after an apparently successful enrollment | The result `Intent` was not checked properly — success requires **both** the result code and the enrollment-result extra | Check `EnrollResultIntent.ENROLLMENT_RESULT_CODE` **and** that the extra equals `ENROLLMENT_RESULT_EXTRA_ENROLLED`, as in `act_TTP_03` Step 4 |
| Re-enrollment asks the merchant to pick a serial number again | The serial number returned on first enrollment was not persisted | Persist it and use `reEnrollDevice(activity, serialNumber, requestCode)` |

```bash
# Is the Tap to Pay Ready app present?
adb shell pm list packages --user 0 | grep com.visa.kic.app.kernel

# Is NFC enabled?
adb shell settings get global nfc_on            # 1 = on; null on Samsung, so also:
adb shell dumpsys nfc | grep -m1 -E 'mState|^ *State *:'  # AOSP: mState=on / Samsung: State: on

# Are developer options enabled? (must be 0)
adb shell settings get global development_settings_enabled

# Is automatic time enabled? (must be 1)
adb shell settings get global auto_time

# OS version and security patch level
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.security_patch
```

> **Note on the `adb` checks.** Reading these requires USB debugging, which lives under developer
> options — so the act of checking can itself be the thing blocking enrollment. Verify the settings,
> then **disable developer options and unplug** before attempting enrollment.

---

### Build configuration

| Error / Symptom | Cause | Fix |
|---|---|---|
| `Unsupported class file major version 61`, or Java compilation errors after adding the SDK | Java source/target compatibility is below the SDK's requirement | Set `sourceCompatibility` and `targetCompatibility` to the required Java version in the constants file, and align the Kotlin JVM target — `kotlin { compilerOptions { jvmTarget = … } }` or `kotlin { jvmToolchain(17) }` on AGP 8.1+/Kotlin 2.x, the legacy `android { kotlinOptions { } }` block only on older toolchains. See `act_TTP_01` Step 3b |
| `kotlinOptions is not applicable` / `Extension of type 'KotlinJvmOptions' does not exist` | Either a `kotlinOptions` block was added to a module with no Kotlin plugin, **or** the toolchain is new enough that `android.kotlinOptions` is gone | Java-only module: remove it — `compileOptions` alone is enough. Modern AGP/Kotlin: switch to `kotlin { compilerOptions { jvmTarget = JvmTarget.JVM_17 } }` or `kotlin { jvmToolchain(17) }`. If the module needs Kotlin (see the `UiConfiguration` note in `act_TTP_05` Step 1), apply the Kotlin plugin first. |
| A deprecation warning naming `kotlinOptions` appears after this skill's edits | The skill's legacy branch was applied to a project on AGP 8.1+/Kotlin 2.x | Use the `compilerOptions` / `jvmToolchain` form instead — and check first whether the project already compiles at 17, in which case no block is needed at all |
| `Manifest merger failed … uses-sdk:minSdkVersion` conflict | The app's `minSdk` is below the SDK's minimum | Raise `minSdk` to the minimum in the constants file — **with the developer's explicit consent**, per the upgrade-consent protocol there |
| `application@android:supportsRtl was tagged at AndroidManifest.xml:N to replace other declarations but no other declaration present` | Informational. `paybutton-android` declares `android:supportsRtl="false"` with `tools:replace`, so it wins the merge; the host app declared nothing | Not an error. **But** check the merged manifest: an app that declares `supportsRtl="true"` is silently overridden to `false`, disabling RTL mirroring app-wide. See `act_TTP_01` Step 4 |
| RTL layouts stopped mirroring after adding the SDK | The SDK's `tools:replace="android:supportsRtl"` overrode the host app's `true` | Assert host priority with `android:supportsRtl="true"` + `tools:replace="android:supportsRtl"`, and confirm with the developer — whether the SDK's own screens render correctly under RTL is not established |
| `package` attribute in source AndroidManifest.xml is not allowed | AGP 8.x treats `package=` on `<manifest>` as a hard error | Remove `package="…"` from the manifest and set `namespace = "…"` in the module's `build.gradle` `android` block |
| Kotlin plugin version incompatibility | Kotlin Gradle plugin below the SDK's minimum | Raise it to the minimum in the constants file, with explicit consent |
| A minimum-Gradle-version error appears right after an AGP bump | The Gradle wrapper was not raised alongside AGP | Raise `distributionUrl` in `gradle/wrapper/gradle-wrapper.properties` to a wrapper the new AGP supports |
| `java.lang.OutOfMemoryError: Java heap space` or `GC overhead limit exceeded`, typically during dexing | The SDK adds a large dependency graph; the default daemon heap is too small | Add `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m` to the project `gradle.properties` (raise to `-Xmx8192m` only if 4 GB is genuinely insufficient) |
| Duplicate class or resource merge conflict | Missing packaging exclusions | Ensure the `packaging.resources.excludes` block excludes `META-INF/*`, `LICENSE.txt` and `asm-license.txt` |

```bash
find "$SOURCE_ROOT" -name "*.kt" | head -5                       # is Kotlin actually present?
grep -n "kotlin" "$ANDROID_MODULE_DIR"/build.gradle* 2>/dev/null
grep -n "minSdk\|namespace\|package=" "$ANDROID_MODULE_DIR"/build.gradle* \
  "$ANDROID_MODULE_DIR/src/main/AndroidManifest.xml" 2>/dev/null
```

> **Never downgrade, never silently upgrade.** If the project already exceeds a minimum, leave it
> alone. If it is below a minimum, present the change and get explicit consent first — see the
> Required Upgrade Consent Protocol in `references/ttp/constants/ttp-sdk-requirements.md`.

---

### Release build crashes but debug works — ProGuard / R8

| Error / Symptom | Cause | Fix |
|---|---|---|
| `ClassNotFoundException`, `NoSuchMethodError`, or JSON parse failures only in a minified build | R8/ProGuard stripped or renamed SDK classes that are only reached reflectively | Add every keep rule the SDK's documentation specifies to `proguard-rules.pro` |
| Release APK crashes on launch while the debug APK is fine | Debug builds do not minify; release builds do | Temporarily set `isMinifyEnabled = false` to confirm the cause, then restore it **with** the keep rules in place |

The keep rules cover the SDK itself (`io.mpos.**`), its HTTP and serialization stack, the Visa
authentication and crypto components, `androidx.**`, and the Visa/Mastercard sensory-branding views.
Copy them from the SDK's ProGuard section in the
[Tap to Pay on Android Solution Integration Guide](https://developer.visaacceptance.com/docs/vas/en-us/tap-to-phone/integration/all/rest/tap-to-phone.md) —
do not hand-write a subset, and do not rely on `-keep class io.mpos.** { *; }` alone.

```bash
grep -n "io.mpos\|com.visa\|bouncycastle\|nimbusds\|retrofit2\|okhttp" "$ANDROID_MODULE_DIR/proguard-rules.pro"
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS clean "$GRADLE_MODULE_PATH:assembleRelease"
```

**Diagnosis tip:** read the exact `ClassNotFoundException` / `NoSuchMethodError` out of logcat and
match it back to the rule table in the guide, rather than adding rules speculatively.

---

## TTP charge

*Troubleshooting: Charge (Sale) Transactions*

> Common errors — network, credentials, enrollment, build configuration — are in
> [Tap to Pay](#tap-to-pay).

**Appears in:** TTP Gate 5 (`act_TTP_05_implement-charge.md`), and as the baseline for every later
transaction gate.

### Gate-specific errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `cannot find symbol Currency.EUR`, or a type mismatch on `.charge(BigDecimal, Currency)` | `java.util.Currency` was imported instead of the SDK's own `Currency` — this is NEVER the right type here | Import the SDK `Currency` from the `io.mpos` package root; resolve the exact path per `references/ttp/constants/ttp-sdk-requirements.md` |
| `IllegalStateException: MposUi not initialized`, or `mposUi` is null and the app crashes | A payment method ran before `MposUi.create()` completed in `Application.onCreate()`, or `PaymentApplication` was never registered | Add the `isMposUiReady()` guard before every payment call, and confirm `android:name=".PaymentApplication"` is on `<application>` in the manifest |
| `UiConfiguration` cannot be constructed from Java | `UiConfiguration` is a Kotlin type with named/default arguments, which do not exist in Java bytecode | Write `PaymentApplication` in Kotlin (recommended), or read the published constructor signature from the artifact and match it exactly — see `act_TTP_05` Step 1 |
| `latestTransaction` returns null | The transaction never reached the card-read stage — the shopper backed out, or the device is not enrolled | Confirm `isDeviceEnrolled()` before starting, and treat a null transaction as "no result to report", not as a decline |
| The result code is neither `RESULT_CODE_APPROVED` nor `RESULT_CODE_FAILED` | The shopper pressed back or abandoned the flow before tapping | Treat it as a cancellation. Do **not** show a failure message — there is no transaction object to inspect. |
| Every transaction fails immediately, regardless of card | **The device is not enrolled.** There is no enrollment error at the transaction call site — the transaction simply fails. | Gate every entry point on `isDeviceEnrolled()` and route to `enrollDevice()` / `reEnrollDevice()` when it returns false. See [Tap to Pay](#tap-to-pay) → Enrollment failures. |
| Payment appears to start but no overlay ever appears | The Tap to Pay Ready app (`com.visa.kic.app.kernel`) is missing or was disabled after enrollment | Reinstall/re-enable it; payment capture happens inside that app, not in the POS app |
| The overlay appears but the tap never registers | NFC was disabled after enrollment, the card was moved too quickly, or it was held away from the NFC antenna | Enable NFC; hold the card flat against the back of the phone near the antenna until the SDK confirms the read |
| **App crashes on the pay button** with `io.mpos.errors.MposRuntimeException: custom identifier '<x>' needs to follow the pattern '^[a-zA-Z0-9_-]{0,256}$'` at `io.mpos.utils.UtilsKt.assertValidCustomIdentifier` | The value passed to `.customIdentifier(...)` contains a character outside letters/digits/underscore/hyphen — **a space and a period are the two usual culprits**. The SDK asserts this inside the builder method, so it throws while parameters are being built: no Intent is launched and no result callback runs | Use `"Order_1234"` / `"fox-donation-100"`, never `"Order 1234"`. Validate any non-literal identifier with `isValidTtpCustomIdentifier()` before building — `act_TTP_05` Step 1b and Critical Rule 10. Reject invalid input with a visible message; do **not** silently rewrite it, because `customIdentifier` is the merchant's reconciliation key |
| Transaction rejected with HTTP 400 `TRANSACTION_ERROR_INVALID_TRANSACTION_REQUEST` | A free-text field contains a currency symbol or other special character — the backend `@SecureText` validator rejects `$`, `€`, `£` and similar. This is the **other**, looser validator: it governs `.subject(...)` and `.metadata(...)`, and it permits spaces and punctuation | Remove currency symbols from the offending field. Note that this rule is **not** the `customIdentifier` rule — that field is checked on-device by the stricter pattern in the row above, and never reaches the backend |
| The transaction succeeds but the identifier is unavailable later | The identifier was read but never persisted | Read it from `MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER` and persist it — TTP Gate 6 and TTP Gate 8 both require it |
| Declines and hard failures are reported identically | Only the result code was inspected | On `RESULT_CODE_FAILED`, a non-null transaction means declined and a null transaction means failed |
| The tap works but the button also runs the screen's original handler | The original click handler was left in place alongside `startCharge()` | Remove it entirely — see the REC-02 checks in `act_TTP_05` Step 6b |
| `AccessoryFamily` errors, or the SDK negotiates for hardware that is not present | An `AccessoryFamily` other than `TAP_TO_PHONE` was used — the enum also carries card-reader families and `MOCK`, and the wrong one compiles cleanly | Use `AccessoryFamily.TAP_TO_PHONE` with `.integrated()` — there is no external reader to pair with on this platform |

---

## TTP refund

*Troubleshooting: Refunds and Stand-Alone Credits*

> Common errors are in [Tap to Pay](#tap-to-pay); shared transaction errors — Currency import,
> `MposUi` not initialized, null `latestTransaction`, cancellation — are in
> [TTP charge](#ttp-charge).

**Appears in:** TTP Gate 6 (`act_TTP_06_implement-refund.md`).

### Gate-specific errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `RESULT_CODE_FAILED` with an invalid-transaction-identifier error | The identifier is wrong, expired, or belongs to a different merchant | Verify it came from a successful sale result, persisted storage, or the summary screen — never a literal |
| A refund that worked in development fails everywhere else | A transaction identifier was hardcoded | Identifiers are per-transaction. Retrieve them dynamically; a string literal in a `.refund("…")` call is always a defect. |
| `RESULT_CODE_FAILED` with an amount-exceeds error on a partial refund | The requested amount is greater than the original amount minus refunds already issued | Track refunds already issued against the original and cap the request accordingly |
| The refund button is missing from the summary screen | `SummaryFeature.REFUND_TRANSACTION` is absent from `summaryFeatures` | Add it to the **existing** set in `UiConfiguration` — see `act_TTP_06` Step 2 |
| The refund button was there and has now disappeared | A later gate rebuilt the `summaryFeatures` set instead of extending it, dropping `REFUND_TRANSACTION` | Restore the full set. See [TTP pre-auth](#ttp-pre-auth) → the summary-feature regression. |
| A stand-alone credit succeeded but is not linked to the original sale | A stand-alone credit is by definition unreferenced — nothing links it | Use a referenced refund whenever the original identifier exists. A stand-alone credit is a last resort, not a convenience. |
| A stand-alone credit paid out far more than intended | Nothing in an unreferenced credit bounds the amount against a prior authorization | Validate the amount in app code before building the parameters, and prefer a referenced refund |
| A stand-alone credit fails with the card absent | The card must be presented for a stand-alone credit | Have the shopper present the card, or use a referenced refund instead |
| The app **crashes** when a stand-alone credit is submitted, with `MposRuntimeException: custom identifier '<x>' needs to follow the pattern` | The stand-alone credit identifier is a free-text field the user types into, and `.customIdentifier(...)` throws on anything outside `^[a-zA-Z0-9_-]{0,256}$`. `.trim()` is not validation — it removes surrounding whitespace and leaves interior spaces, periods and slashes intact | Validate the field with `isValidTtpCustomIdentifier()` (`act_TTP_05` Step 1b) as the user types, show an inline error, and keep the submit control disabled until it passes. See [TTP charge](#ttp-charge) for the full row |
| A refund identifier overwrote the stored sale identifier, breaking a later capture | Charge and refund results were not distinguished in the shared `onActivityResult` | Branch on the recorded operation — see `act_TTP_06` Step 6 |
| The summary screen returns but nothing is handled | The summary screen returns `RESULT_CODE_SUMMARY_CLOSED` under `REQUEST_CODE_SHOW_SUMMARY`, not a payment result | Handle that request code as a separate branch, and read the outcome from `latestTransaction?.status` |
| Two `onActivityResult` methods, and one never fires | The refund handler was added as a duplicate instead of extending the existing one | There must be exactly one `onActivityResult` per Activity |

---

## TTP tipping

*Troubleshooting: On-Reader Tipping*

> Common errors are in [Tap to Pay](#tap-to-pay); shared transaction errors are in
> [TTP charge](#ttp-charge).

**Appears in:** TTP Gate 7 (`act_TTP_07_implement-tipping.md`).

### Gate-specific errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `cannot find symbol TippingProcessStepParameters` | Import missing — this is the most common failure in this gate | Resolve the import from the artifact per `references/ttp/constants/ttp-sdk-requirements.md`; the class lives under the `io.mpos` package root |
| `cannot find symbol TransactionProcessParameters` | Same cause | Same fix — both classes must be imported |
| `method createTransactionIntent cannot be applied to given types` | Only one argument was passed | Tipping needs the two-argument form: `createTransactionIntent(transactionParameters, processParameters)` |
| **The transaction works but no tip screen ever appears, and there is no error at all** | `processParameters` was not passed — the one-argument overload still compiles and still takes a payment | This is the failure mode to look for first. Grep every charge call site and confirm each passes two arguments. |
| Tipping works on one screen and not another | Only one charge call site was updated to the two-argument form | Every charge call site must be updated; refund and capture call sites must **not** be |
| `NullPointerException` reading the tip amount | The shopper declined the tip, so no tip is present — or the transaction itself is null | Null-check before use. A declined tip is a **successful** transaction, not an error. |
| Reported base amount is too high, and reconciliation drifts | The transaction amount was treated as the base price when it is the total (base + tip) | Derive base = total − tip; never present the transaction amount as the item price |
| `cannot find symbol adjustTip` / `cannot find symbol tipAdjustable` | On-receipt tipping was ported from a terminal-based integration. It is **not** part of the Tap to Pay on Android documented surface — only on-reader tipping is. | Remove them. If a tip must be added after the card is presented, use a pre-authorization plus a capture at the final amount — see [TTP pre-auth](#ttp-pre-auth). |
| `cannot find symbol ADJUST_TIP` on `SummaryFeature` | Same cause — that summary feature does not belong to this platform's flow | Remove it; do not substitute another feature to make it compile |
| `cannot find symbol maxTipAmount` | `.maxTipAmount(...)` is not documented for Tap to Pay on Android and may not be published by the builder | Confirm against the artifact before using it. If it is absent, enforce the ceiling in app code before starting the transaction. |
| The percentage choices shown are not the ones configured | `.percentages(...)` was omitted, so the SDK defaults apply — or it was placed before `.askForPercentageChoice()` | Call `.percentages(...)` immediately after `.askForPercentageChoice()`. Omit it entirely to accept the defaults. |
| Two tip prompts, or an unexpected confirmation screen | More than one `askFor*` strategy was added to the same step | Use exactly one of `.askForPercentageChoice()`, `.askForTipAmount()`, `.askForTotalAmount()` |
| An untipped payment path still exists | A parallel payment method was added instead of editing the existing call site | Edit the existing `startCharge()` call site; do not create a second payment method |
| The tip accessor does not compile | The property name on the transaction details object was assumed rather than resolved — the docs do not publish it | Read the published accessor from the artifact (`javap`) per the constants file, use that name, and record it in the gate report |

---

## TTP pre-auth

*Troubleshooting: Pre-Authorization and Capture*

> Common errors are in [Tap to Pay](#tap-to-pay); shared transaction errors are in
> [TTP charge](#ttp-charge). Incremental-authorization errors are in
> [TTP incremental auth](#ttp-incremental-auth).

**Appears in:** TTP Gate 8 (`act_TTP_08_implement-pre-auth-capture.md`). Capture errors live here
because that gate covers pre-authorization and capture together.

### Gate-specific errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| **The transaction completed as a sale — the shopper was charged immediately and there is nothing to capture** | `.autoCapture(false)` is missing from the builder chain. It is the *only* difference between a sale and a pre-authorization, and nothing about the code looks wrong without it. | Add `.autoCapture(false)` after `.charge(amount, currency)`. Verify with `grep -rn "autoCapture\s*(false)" "$SOURCE_ROOT"`. |
| `transactionIdentifier` is null after an approved pre-authorization | The identifier was never read from the result | Read `data.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)` on approval |
| The identifier existed at approval but is gone when capture runs | It was held in a field that did not survive navigation or process death | Persist it — `SharedPreferences` at minimum. A hold outlives an Activity, and often outlives the app process. |
| `AUTHORIZATION_EXPIRED` | The hold expired. Pre-authorization holds last roughly 5–7 days, issuer-determined. | An expired hold cannot be captured — take a new pre-authorization. Do not design a flow that assumes an indefinite hold. |
| `TRANSACTION_ALREADY_CAPTURED` | Capture was attempted twice — often because the capture button stayed visible after a successful capture | Validate the captured state before building parameters, and hide the capture affordance in `onCaptureApproved` |
| `CAPTURE_AMOUNT_EXCEEDS` | The partial capture amount is greater than the authorized amount, including any incremental authorizations | Track the current authorized total (original + increments) and cap the capture at it |
| `TRANSACTION_NOT_FOUND` | The identifier is invalid, belongs to another merchant, or was truncated in storage | Verify what was persisted matches what the pre-authorization returned |
| The capture button is missing from the summary screen | `SummaryFeature.CAPTURE_TRANSACTION` is absent from `summaryFeatures` | Add it to the **existing** set — see `act_TTP_08` Step 1 |
| **The refund button disappeared after this gate** | The `summaryFeatures` set was **rebuilt** rather than extended, dropping `REFUND_TRANSACTION` added in TTP Gate 5. This is the highest-risk regression in this integration path: three separate gates add to one set. | Restore the full set — `REFUND_TRANSACTION`, `CAPTURE_TRANSACTION`, `INCREMENT_TRANSACTION`. Guard it with `grep -rn "REFUND_TRANSACTION" "$SOURCE_ROOT"` after every gate that touches `UiConfiguration`. |
| A sale is handled as a capture, or vice versa | The result branch tests only whether the transaction is captured — but a completed sale and a completed capture are **both** captured, so that test cannot tell them apart | Branch on the recorded operation (`PaymentOperation`), and use the captured state only to validate that a hold is still capturable. See `act_TTP_08` Step 5. |
| Capture waits for a card tap that never comes | Capture is not a card-present operation — only the pre-authorization needed the NFC read | Do not prompt for a tap on capture |
| The pay button ignores the Sale / Pre-Auth selector | A leftover charge-only `setOnClickListener` is still attached alongside the new mode-branching one | There must be exactly one listener on the pay button. Verify with `grep -cn "setOnClickListener"`. |
| Capture and increment buttons overlap the pay or refund button | The buttons were added with no explicit positioning | Give every button `layout_marginTop` (LinearLayout) or `layout_constraintTop_toBottomOf` (ConstraintLayout) |
| Capture is tappable before any pre-authorization exists | The button is not hidden by default | Set `android:visibility="gone"` in the layout; show it only in `onPreAuthApproved` |
| A tip prompt appears during a pre-authorization | Tipping parameters were attached to the pre-authorization | The tip belongs to the final amount, which capture decides — do not attach tipping parameters to a pre-authorization |

---

## TTP incremental auth

*Troubleshooting: Incremental Authorization*

> Common errors are in [Tap to Pay](#tap-to-pay); pre-authorization and capture errors are in
> [TTP pre-auth](#ttp-pre-auth).

**Appears in:** TTP Gate 8 (`act_TTP_08_implement-pre-auth-capture.md`).

### Gate-specific errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `Unresolved reference: amountAndCurrency` / `too few arguments` on `incrementalAuthorization` | The **published documentation sample is stale**. SDK 2.115.0 has only `.incrementalAuthorization(String, BigDecimal, Currency)`, and `IncrementalAuthorizationBuilder` has no `amountAndCurrency()` | Use the three-argument call. Verify with `javap` against the resolved artifact — see `act_TTP_08` Step 6 |
| The increment is rejected, or nothing is added to the hold | The additional amount was passed as the **new total** rather than the delta, or the identifier belongs to an already-captured transaction | The second argument is the ADDITIONAL amount. Confirm the transaction is uncaptured first |
| **The hold ended up far larger than intended — roughly double** | The intended *new total* was passed instead of the *additional* amount. An incremental authorization does not replace the original authorization; it is issued **in addition** to the previously authorized amount, so a 100.00 hold plus a "120.00 increment" becomes a 220.00 hold. | Pass the delta. Confirm once in TEST mode: pre-authorize a known amount, increment by a different known amount, then read the authorized total back from the summary screen. Record the observed total in `project-plan.md`. |
| The increment is rejected against a working transaction | The target is a **sale**, not a pre-authorization. `autoCapture(true)` transactions cannot be increased. | Only an approved, uncaptured pre-authorization can be incremented |
| The increment is rejected after a successful capture | A captured transaction cannot be increased | Validate the uncaptured state before building parameters |
| The increment button is missing from the summary screen | `SummaryFeature.INCREMENT_TRANSACTION` is absent from `summaryFeatures` | Add it to the **existing** set — see `act_TTP_08` Step 1 |
| The issuer declines the increment | Not every scheme supports this flow — **American Express does not** — and an issuer may decline for its own reasons | Treat this as "the original hold is still valid". Do **not** clear the stored identifier and do **not** report a failed pre-authorization. Offer a new pre-authorization for the difference if the business flow needs one. |
| After an approved increment the stored identifier no longer works | The identifier was overwritten with a value from the increment result | The hold's identifier does not change. Keep the original; only the authorized total changes. |
| A later partial capture is rejected with `CAPTURE_AMOUNT_EXCEEDS` even though it is below the original hold plus increments | The running authorized total was never tracked, so the cap being enforced is the original amount | Track original + all approved increments as the current authorized total, and validate captures against that |
| An increment result is handled as a sale or a capture | The shared `onActivityResult` does not distinguish the operation | Branch on the recorded operation — see `act_TTP_08` Step 5 |
---

## TTP account verification

*Troubleshooting: Zero-Amount Account Verification*

> Common errors are in [Tap to Pay](#tap-to-pay). Because a verification returns under the same
> request code as a charge, several charge-path symptoms apply too — see [TTP charge](#ttp-charge).

**Appears in:** TTP Gate 9 (`act_TTP_09_implement-account-verification.md`).

### Gate-specific errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `Unresolved reference: amount` / `too many arguments` on `.verification(...)` | `.verification()` takes **only** a `Currency`. `VerificationBuilder` sets `amount = BigDecimal.ZERO` in its own constructor and publishes no `.amount(...)` | Pass the currency alone. There is no amount to supply — `act_TTP_09` Critical Rule 1 |
| `Unresolved reference: subject` / `autoCapture` / `includedTipAmount` / `tipAdjustable` after `.verification(...)` | Those members are on `ChargeBuilder`, not `VerificationBuilder` | A verification cannot be a pre-auth and cannot carry a tip. Remove the call; do not route this path through Gate 7 or Gate 8 |
| The chain compiles until an intermediate variable is extracted, then does not | `.verification(currency)` returns `VerificationBuilder`, not `TransactionParameters.Builder` | Declare the variable `VerificationBuilder`. See the constants file § *Builder chains switch type mid-chain* |
| **`Amount should be bigger than zero`** — the verification is rejected before any reader screen appears | The flow was built as `.charge(BigDecimal.ZERO, currency)` instead of `.verification(currency)`. `ChargeBuilder` validates amount > 0, so this is the **SDK working correctly** — a zero-amount charge is invalid, not a tolerated special case. "Zero-amount" names the outcome, never the call | Switch to `TransactionParameters.Builder().verification(currency)` — a distinct transaction type whose builder sets the zero itself. `BigDecimal.ZERO` should not appear in this gate's code at all. `act_TTP_09` Critical Rule 1 |
| `IllegalArgumentException` / the transaction is rejected before any screen appears, on a zero amount | A copied Gate 5 guard — `require(amount.signum() > 0)` — is rejecting `BigDecimal.ZERO`, the only legal value here | Delete the money guards from this path. Critical Rule 2 |
| `MposRuntimeException: custom identifier '<x>' needs to follow the pattern '^[a-zA-Z0-9_-]{0,256}$'` at `assertValidCustomIdentifier` | `.customIdentifier(...)` **is** present on `VerificationBuilder` and validates on-device, inside the builder, before any Activity launches. A space or a period is a crash, not a decline | Validate with `isValidTtpCustomIdentifier()` from `act_TTP_05` Step 1b **before** building. Reject the input with an inline error; never rewrite it silently |
| **The app reports a payment after a verification** | `RESULT_CODE_APPROVED` was handled by the charge branch, or the success string says "Paid" / "Payment approved" | Branch on the operation discriminator and use verification wording. This is the highest-consequence defect on this path: the merchant believes they were paid and no money moved. `act_TTP_09` Critical Rule 7 |
| A verification appears in the day's sales total, or marks an order as paid | The result was fed into the same accumulator or state machine as a charge | Zero-amount transactions have nothing to add, and the *count* misleads a payments report. Exclude them explicitly |
| The verification result is handled as a charge after the app was backgrounded mid-transaction | On Compose the operation discriminator was `mutableStateOf` without `rememberSaveable`, so it reset to `CHARGE` on process death | Make the discriminator `rememberSaveable`. Same defect as the refund path — constants file § *`UI_TOOLKIT = compose`* |
| **`IllegalStateException: MutableState(value=io.mpos.transactions.Transaction@…) cannot be saved using the current SaveableStateRegistry`** at `onSaveInstanceState` — the app dies the instant a charge, refund, capture or verification is launched | A `Transaction` (or any `io.mpos.*` object) was put in `rememberSaveable`. Saveable state is written to the Activity's `Bundle`, and no SDK model type is Bundle-safe. Launching the SDK's payment Activity **stops** the host Activity, which triggers the save — so the crash is on the way *in*, before any tap. **Refund and capture surface it first** because they are the only flows that select a `Transaction` beforehand; charge and verification never populate that state. Often a mis-generalisation of the correct rule that the operation *discriminator* must be `rememberSaveable` | Hold the **identifier `String`** in `rememberSaveable` (or as a navigation argument) and resolve the record from the history list, falling back to `lookupTransaction(id)`. Plain `remember` also stops the crash but loses the selection on Activity recreation. **Keep the discriminator enum saveable** — an enum is Bundle-safe and un-saving it reintroduces the misattribution bug. Do **not** narrow `TransactionDetailActions(transaction: Transaction)` to a `String`: a parameter is not saved state. `act_TTP_04` Critical Rules 11 and 12; constants file § *CRITICAL — `rememberSaveable` holds Bundle-safe values ONLY* |
| A second `onActivityResult` / launcher was added for verification | Verification shares `MposUi.REQUEST_CODE_PAYMENT` with charge and refund | Extend the single existing result site. A second one means one of them never fires |
| The merchant typed an amount and expected it to be held | The verification control read from the screen's amount input | A verification takes no money and cannot hold one. Do not wire it to an amount field; if the screen has one, make the zero-amount behaviour visible rather than ignoring the input |
| The reader prompts and then reports "verification inconclusive" | An SDK-side outcome distinct from approved and declined — the reader has a dedicated string for it (`ttp_verification_inconclusive`) | Treat it as **not verified**. Do not record a card-on-file reference from it, and do not retry automatically |
| A `Verify card` control is greyed out with "not implemented in this integration" although Gate 9 ran | The control's `unavailable_reason` was left at `not-implemented` from a previous run | `act_TTP_09` AC 12 — enable the control and delete the reason string |
| The whole flow works but confidence is unclear | This path is API-verified against the artifact and the SDK ships localised verification screens, but this skill has less real-hardware evidence for it than for charge or refund | Report that plainly (`act_TTP_09` Critical Rule 9). Do not present it as equally proven |
