# Troubleshooting

PAX All-in-One SDK integration troubleshooting, consolidated into a single reference. These notes are developed from real integration testing and enterprise-environment experience — information **not available** in the official documentation.

## Topics

- [Network access](#network-access)
- [Common](#common)
- [SDK build](#sdk-build)
- [Merchant credentials](#merchant-credentials)
- [Refund](#refund)
- [Tipping](#tipping)
- [Pre-authorization](#pre-authorization)
- [Capture](#capture)
- [Offline transactions](#offline-transactions)
- [Install APK](#install-apk)
- [Verify diagnostics](#verify-diagnostics)

---

## Network access

*Troubleshooting: Network Access & Proxy Configuration*

Enterprise network issues that prevent Gradle from resolving PAX SDK dependencies.

**Appears in:** Pre-Check (Step 1c), Gate 1 (SDK Dependencies)

---

### `repo.visa.com` unreachable — connection timeout or refused

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection timed out` / `Connection refused` when accessing `repo.visa.com` | Corporate firewall or proxy blocking outbound HTTPS | Detect and configure proxy (see Escalation Sequence below) |

**Verification command:**

```bash
curl -sS --max-time 10 -o /dev/null -w "%{http_code}" https://repo.visa.com/mpos-releases/
```

If the request succeeds (HTTP 200 or 301/302), proceed to Gradle configuration.

---

### SSL error — `PKIX path building failed` / `unable to find valid certification path`

| Error | Cause | Fix |
|-------|-------|-----|
| `PKIX path building failed` / `unable to find valid certification path` during Gradle sync or wrapper download | Corporate SSL inspection replacing TLS certificates with its own CA | Import corporate CA into JDK truststore or configure proxy in `~/.gradle/gradle.properties` |

**Fix 1:** Ensure proxy is configured in `~/.gradle/gradle.properties`. The `systemProp.https.*` properties apply to all HTTPS connections Gradle makes, including the wrapper download.

**Fix 2:** Import the corporate CA certificate:

```bash
sudo keytool -importcert \
  -file "<corporate_ca_cert_path>" \
  -keystore "$JAVA_HOME/lib/security/cacerts" \
  -alias "corp-proxy-ca" \
  -storepass changeit \
  -noprompt
```

---

### Gradle wrapper download fails

| Error | Cause | Fix |
|-------|-------|-----|
| `Could not find or load main class org.gradle.wrapper.GradleWrapperMain` | Wrapper JAR missing from `gradle/wrapper/` | Regenerate with system Gradle or restore from version control |
| SSL/timeout errors during wrapper download | Corporate proxy intercepting `services.gradle.org` | Configure proxy in `~/.gradle/gradle.properties` (same `systemProp.https.*` settings apply to wrapper download) |

**Verification command:**

```bash
grep distributionUrl gradle/wrapper/gradle-wrapper.properties 2>/dev/null
./gradlew --version 2>&1 | head -20
```

**Do NOT proceed until `./gradlew --version` completes successfully.**

---

### Escalation Sequence

When `repo.visa.com` is unreachable, try each approach in order and stop at the first that works.

#### Approach A: Detect existing HTTP proxy

```bash
# Check environment proxy variables
echo "HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY"
echo "http_proxy=$http_proxy https_proxy=$https_proxy"

# Check macOS system proxy settings
scutil --proxy

# Check existing Gradle proxy config
grep -i proxy ~/.gradle/gradle.properties 2>/dev/null || true
```

If a proxy is already configured, verify it works:

```bash
curl -sS --max-time 10 --proxy "<proxy_url>" -o /dev/null -w "%{http_code}" https://repo.visa.com/mpos-releases/
```

---

#### Approach C: Configure an HTTP proxy manually

Ask the developer for their proxy host and port, then test:

```bash
curl -sS --max-time 10 --proxy "http://<proxy_host>:<proxy_port>" -o /dev/null -w "%{http_code}" https://repo.visa.com/mpos-releases/
```

If it works, configure it in `~/.gradle/gradle.properties` (create the file if it doesn't exist):

```properties
systemProp.http.proxyHost=<proxy_host>
systemProp.http.proxyPort=<proxy_port>
systemProp.https.proxyHost=<proxy_host>
systemProp.https.proxyPort=<proxy_port>
systemProp.http.nonProxyHosts=localhost|127.0.0.1
```

Proxy settings belong at the **user level** (`~/.gradle/gradle.properties`), not inside the project, to avoid committing them to source control.

---

#### Approach D: Ask the developer

If none of the above approaches work:

> "I cannot reach `repo.visa.com` directly or through a proxy. How does your team normally resolve Maven dependencies? Possible solutions:
> 1. A proxy host and port specific to your network
> 2. VPN or network configuration that may be required
>
> You can check your browser's proxy settings, `~/.gradle/init.gradle`, or ask your team lead / IT support."

**Do NOT proceed to Gradle configuration until `repo.visa.com` is confirmed reachable.**

---

## Common

*Troubleshooting: Common Errors (All Gates)*

These errors recur across multiple gates. Gate-specific files reference this document for shared issues.

---

### Wrong `Currency` import — `error: cannot find symbol Currency.EUR`

**Appears in:** Gates 3, 6, 8 (charge, pre-auth, offline)

| Error | Cause | Fix |
|-------|-------|-----|
| `error: cannot find symbol Currency.EUR` / `java.util.Currency` compilation error | Using `java.util.Currency` instead of `io.mpos.transactions.Currency` | Fix import to `io.mpos.transactions.Currency` |

---

### `IllegalStateException: MposUi not initialized`

**Appears in:** Gates 2, 3, 4, 5, 6, 7 (any gate that invokes a payment operation)

| Error | Cause | Fix |
|-------|-------|-----|
| `IllegalStateException: MposUi not initialized` or `mposUi is null` / crash | Payment method called before `MposUi.create()` completes in `Application.onCreate()` | Add `isMposUiReady()` guard before every payment call; verify `PaymentApplication` is registered in `AndroidManifest.xml` |

---

### `getLatestTransaction()` returns null

**Appears in:** Gates 3, 6 (charge, pre-auth)

| Error | Cause | Fix |
|-------|-------|-----|
| `getLatestTransaction()` returns null | Transaction never reached the card-read stage (user cancelled early or terminal not ready) | Check `isReadyForTransaction()` before calling `createTransactionIntent()` |

---

### Result code is neither APPROVED nor FAILED

**Appears in:** Gates 3, 6 (charge, pre-auth)

| Error | Cause | Fix |
|-------|-------|-----|
| Result code is neither `RESULT_CODE_APPROVED` nor `RESULT_CODE_FAILED` | User pressed back or aborted before card tap | Handle as cancellation — when `requestCode == REQUEST_CODE_PAYMENT` but `resultCode` is neither constant, treat as user-cancelled (no transaction object to inspect) |

---

### `ClassNotFoundException` at runtime (ProGuard)

**Appears in:** Gates 4, 7 (refund, capture)

| Error | Cause | Fix |
|-------|-------|-----|
| `ClassNotFoundException` at runtime | ProGuard/R8 stripping SDK classes when `isMinifyEnabled = true` | Add all required keep rules from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section). See also [SDK build](#sdk-build) for detailed diagnosis. |

---

### `CASHBACK_NOT_ALLOWED_ON_PRE_AUTH_TRANSACTION`

**Appears in:** Gates 6, 7 (pre-auth, capture)

| Error | Cause | Fix |
|-------|-------|-----|
| `CASHBACK_NOT_ALLOWED_ON_PRE_AUTH_TRANSACTION` | Cashback was requested on a pre-authorization or its capture | Remove any cashback parameters — cashback is not supported on pre-auth transactions |

---

## SDK build

*PAX All-in-One SDK - Troubleshooting*

If the build fails after configuration, diagnose using these common patterns.

**Reminder:** NEVER comment out PAX dependencies or revert `settings.gradle` as a workaround. Always fix the root cause.

---

### CRITICAL: `BuildConfig.MERCHANT_ID` is empty at runtime — empty merchant ID in backend URL

**Symptom:** Payment fails with `SERVER_INVALID_RESPONSE`. Logcat shows the backend URL contains a double slash: `https://test.pwtx.info/v2/merchants//transactionSessions` (the merchant ID field is empty). Results in HTTP 400 during auth and HTTP 500 during transaction registration → `TransactionFailed`.

**Cause:** The `build.gradle` template uses `project.findProperty("test.merchant.id")`. This reads **Gradle project properties**, NOT `local.properties`. Gradle project properties and `local.properties` are two separate systems — `project.findProperty()` does not read `local.properties`.

**Fix:** Load `local.properties` explicitly before the `android` block.

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

**Verify credentials are non-empty before building:**
```bash
grep "test.merchant.id=" local.properties && echo "OK" || echo "MISSING: add test.merchant.id to local.properties"
```

> **Root cause (confirmed by integration testing, run #14):** The fix for `project.findProperty()` was applied manually after observing the double-slash URL in logcat. The `Properties().load()` pattern is the only reliable way to read `local.properties` at Gradle evaluation time.

---

### `matchingFallbacks.apply{}` Kotlin DSL syntax — fails in Groovy DSL projects

**Symptom:** Build fails with a Groovy syntax or method-not-found error in the `debug` build type block.

**Cause:** The Kotlin DSL syntax for `matchingFallbacks` uses a lambda/`apply` block, which is not valid in Groovy DSL:

```kotlin
// Kotlin DSL — ONLY valid in .gradle.kts files
debug {
    matchingFallbacks.apply {
        clear()
        add("release")
    }
}
```

**Fix:** In Groovy DSL (`.gradle` files), use direct assignment:

```groovy
// Groovy DSL — use this in .gradle files
debug {
    matchingFallbacks = ['release']
}
```

**How to detect:** Check whether the file extension is `.gradle` (Groovy) or `.gradle.kts` (Kotlin DSL) before writing the configuration.

---

### `kotlinOptions` block — fails in Java-only modules

**Symptom:** Build fails with an error like `kotlinOptions is not applicable` or `Extension of type 'KotlinJvmOptions' does not exist`.

**Cause:** The `kotlinOptions { jvmTarget = "17" }` block is only valid when the `kotlin-android` plugin is applied. Java-only projects do not have Kotlin configured.

**Fix:** Remove the `kotlinOptions` block from pure Java projects. For Java-only projects, only `compileOptions` is needed:

```gradle
compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}
// DO NOT add kotlinOptions if there are no Kotlin source files
```

**How to detect:** Check whether any `.kt` files exist, or whether `org.jetbrains.kotlin.android` is in the plugins block:

```bash
find app/src -name "*.kt" | head -5
grep "kotlin" app/build.gradle app/build.gradle.kts 2>/dev/null
```

---

### Gradle JVM heap OOM (`Java heap space` during build)

**Symptom:** Build fails with `java.lang.OutOfMemoryError: Java heap space` or `GC overhead limit exceeded`, typically during D8 dexing after adding the PAX SDK.

**Cause:** The PAX SDK (`paybutton-android`) adds ~50–60 MB of dependencies (resulting in APK sizes of 56–61 MB). The default Gradle daemon JVM heap is insufficient for dexing this many classes.

**Fix:** Add to `gradle.properties` in the project root:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m
```

If 4 GB is still insufficient (rare), increase to 8 GB:

```properties
org.gradle.jvmargs=-Xmx8192m -XX:MaxMetaspaceSize=512m
```

---

### AGP 8.7.0 requires Gradle wrapper 8.9+

**Symptom:** Build fails with a minimum Gradle version error after upgrading Android Gradle Plugin to 8.7.0.

**Cause:** AGP 8.7.0 requires Gradle 8.9 or higher. Upgrading AGP without also upgrading the Gradle wrapper causes a version incompatibility error.

**Fix:** Update `gradle/wrapper/gradle-wrapper.properties`:

```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.9-bin.zip
```

> **Note:** AGP 8.7.0 is recommended when using `compileSdk 36` or higher (to eliminate an AGP 8.6.0 warning about unsupported platform versions). Upgrading AGP always requires checking the corresponding minimum Gradle wrapper version.

---

### SDK internally downgrades `AccessoryFamily.PAX` to `MOCK` — `ACCESSORY_NOT_WHITELISTED` (HTTP 404)

**Symptom:** Transaction fails with `ACCESSORY_NOT_WHITELISTED` (HTTP 404). Logcat shows the SDK using `MOCK/UNKNOWN` accessory with serial `999999999` instead of the actual PAX terminal, even though app source code correctly uses `AccessoryFamily.PAX` + `.integrated()` with no reference to `MOCK` anywhere.

**Root cause (confirmed 2026-04-17):** The SDK ignores the `AccessoryParameters` passed to `MposUi.create()` unless they are **also** applied via `UiConfiguration` — `mposUi.configuration = uiConfig` (Kotlin) or `mposUi.setConfiguration(uiConfig)` (Java). Without an explicit `UiConfiguration.terminalParameters()` call, the SDK reverts to `MOCK` accessory internally before connecting to the gateway.

**Fix:** Always apply the `UiConfiguration` immediately after `MposUi.create()` — `mposUi.configuration = uiConfig` (Kotlin) or `mposUi.setConfiguration(uiConfig)` (Java) — with `terminalParameters` explicitly set to `AccessoryFamily.PAX + .integrated()`:

```java
mposUi = MposUi.create(ProviderMode.TEST, merchantId, merchantSecret, terminalParameters);

// REQUIRED: re-assert terminal parameters in UiConfiguration or the SDK reverts to MOCK
mposUi.setConfiguration(new UiConfiguration.Builder()
    .summaryFeatures(EnumSet.of(SummaryFeature.REFUND_TRANSACTION))
    .terminalParameters(
        new AccessoryParameters.Builder(AccessoryFamily.PAX)
            .integrated()
            .build()
    )
    .build());
```

```kotlin
mposUi = MposUi.create(ProviderMode.TEST, merchantId, merchantSecret, terminalParameters)

mposUi.configuration = UiConfiguration.Builder()
    .summaryFeatures(EnumSet.of(SummaryFeature.REFUND_TRANSACTION))
    .terminalParameters(
        AccessoryParameters.Builder(AccessoryFamily.PAX)
            .integrated()
            .build()
    )
    .build()
```

**Verified:** After applying this fix to `shoomaher-app`, logcat confirms:
```
ConnectToAccessoryProcess: Requesting connect to accessory:
  AccessoryParameters{accessoryFamily=PAX, accessoryConnectionType=INTEGRATED}
PayButtonMviBoundary: VS: InfoScreen ... InfoText(Connecting to card reader)
```
Transaction reached the card-waiting screen and completed successfully.

**Workaround for UI testing:** If root-causing the hardware issue is blocked, use `ProviderMode.MOCK` with `AccessoryFamily.MOCK` + `.mocked()` temporarily to test the UI flow. This simulates transactions without hardware.

> **Background:** Confirmed by manual testing on device 0821081879, 2026-04-17. The fix is now part of the `act_2` Gate 2 implementation pattern — `UiConfiguration` with `terminalParameters` is always generated by the planning agent.

---

### "Could not resolve io.payworks:..."

**Cause:** Network connectivity issue — the machine cannot reach `repo.visa.com`. This is NOT a problem with the repository URL.

**Fix:**
1. Run the network verification:
   ```bash
   curl -sS --max-time 10 -o /dev/null -w "%{http_code}" https://repo.visa.com/mpos-releases/
   ```
2. Check if `~/.gradle/gradle.properties` proxy settings were overwritten or are missing.
3. Check if `~/.gradle/init.gradle` or other init scripts are overriding the repository configuration (e.g., replacing all repositories with a corporate Artifactory):
   ```bash
   cat ~/.gradle/init.gradle 2>/dev/null
   ```
4. Verify the `exclusiveContent` block exists with the correct URL and `includeGroup("io.payworks")`.
5. Configure HTTP proxy in `~/.gradle/gradle.properties` (ask the developer for their proxy host/port):
   ```properties
   systemProp.http.proxyHost=<proxy_host>
   systemProp.http.proxyPort=<proxy_port>
   systemProp.https.proxyHost=<proxy_host>
   systemProp.https.proxyPort=<proxy_port>
   systemProp.http.nonProxyHosts=localhost|127.0.0.1
   ```
6. If the proxy doesn't work, ask the developer for their network's proxy details.

**Do NOT** revert the `settings.gradle` to a previous configuration or remove the Visa Maven repository. The URL `https://repo.visa.com/mpos-releases/` is correct per official CyberSource documentation.

### Duplicate class or resource merge conflict

**Cause:** Missing packaging exclusions.

**Fix:**
- Ensure the `packaging.resources.excludes` block is present in the module `build.gradle`.
- Verify `META-INF/*`, `LICENSE.txt`, and `asm-license.txt` are all excluded.

### "No matching variant" / "Could not resolve debug"

**Cause:** The PAX SDK only publishes a release variant, and the debug build type has no fallback.

**Fix:**
- Ensure `matchingFallbacks` is configured in the `debug` build type to fall back to `release`.

### "Unsupported class file major version 61" or Java compilation errors

**Cause:** Java version is not set to 17.

**Fix:**
- Confirm `sourceCompatibility` and `targetCompatibility` are both set to `JavaVersion.VERSION_17`.
- Confirm `kotlinOptions.jvmTarget` is `"17"`.
- Verify your JDK is version 17. Check with: `java -version` or in Android Studio under File > Project Structure > SDK Location.

### Kotlin version incompatibility

**Cause:** Kotlin plugin version is below 2.1.0.

**Fix:**
- Ensure the Kotlin Gradle plugin version in the project `build.gradle` is **2.1.0 or higher**.
- Run `./gradlew --version` to verify the Kotlin version in use.

### Manifest merger failed — minSdkVersion conflict

**Cause:** The app's `minSdk` is lower than 25, but the PAX SDK manifest declares `minSdkVersion 25`.

**Fix:** Set `minSdk = 25` (or higher) in the module's `build.gradle` `defaultConfig` block.

### Manifest merger failed — `android:supportsRtl` conflict

**Cause:** The PAX SDK (`paybutton-android`) declares `android:supportsRtl="false"` in its merged manifest, which conflicts with most apps that either default to or explicitly set `android:supportsRtl="true"`.

**Symptom:**
```
Manifest merger failed: Attribute application@supportsRtl value=(true) from AndroidManifest.xml
is also present at [io.payworks:paybutton-android:X.X.X] with value=(false)
```

**Fix:** Add a `tools:replace` declaration to the `<application>` tag so the app's value wins over the SDK's:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <application
        android:supportsRtl="true"
        tools:replace="android:supportsRtl">
        <!-- ... -->
    </application>
</manifest>
```

Ensure `xmlns:tools="http://schemas.android.com/tools"` is present on the `<manifest>` tag (add it if missing).

---

### Namespace/package error — "`package` attribute in source AndroidManifest.xml is not allowed"

**Cause:** AGP 8.6.0+ treats `package=` in the source manifest as a hard error. The namespace must be defined in `build.gradle` instead.

**Fix:** Remove the `package="..."` attribute from `AndroidManifest.xml` and ensure `namespace = "..."` is set in the module's `build.gradle` `android` block.

### Runtime crash after enabling ProGuard/R8 (`ClassNotFoundException`, `NoSuchMethodError`, JSON parse error)

**Cause:** Missing ProGuard `-keep` rules. When `isMinifyEnabled = true`, R8/ProGuard strips or renames classes that appear unused at compile time but are required at runtime via reflection.

**Fix:**
1. Verify that `proguard-rules.pro` contains **all** required rules from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section).
2. Common missing rules and their symptoms:
   - **Jackson (`com.fasterxml.**`)** missing: JSON parsing failures, `ClassNotFoundException` for `ObjectMapper`
   - **OkHttp (`com.squareup.okhttp.**`)** missing: Network request failures, SSL handshake errors
   - **Otto (`@Subscribe`/`@Produce`)** missing: Events not delivered, silent failures in transaction flow
   - **mPOS (`io.mpos.**`)** missing: SDK initialization fails, `ClassNotFoundException` for core SDK classes
   - **PAX (`com.pax.**`)** missing: Terminal communication fails, hardware integration errors
3. After adding the missing rules, clean and rebuild:
   ```bash
   ./gradlew clean assembleRelease
   ```

**Diagnosis tip:** To identify which class was stripped, check the logcat for the exact `ClassNotFoundException` or `NoSuchMethodError` and match it to the rule table in [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section).

### Release APK crashes but debug APK works fine

**Cause:** Usually a ProGuard/R8 issue. Debug builds typically have `isMinifyEnabled = false`, so all classes are preserved. Release builds with `isMinifyEnabled = true` will strip classes unless keep rules are present.

**Fix:**
1. Ensure all ProGuard rules from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Configure ProGuard Rules section) are in `proguard-rules.pro`.
2. Temporarily set `isMinifyEnabled = false` in the release build type to confirm the issue is obfuscation-related.
3. If the release build works with `isMinifyEnabled = false`, the problem is definitively missing keep rules. Re-add all rules and test again with `isMinifyEnabled = true`.

### SSL errors ("PKIX path building failed", "unable to find valid certification path")

**Cause:** Corporate SSL inspection is replacing TLS certificates, and the corporate CA is not trusted by the JDK's truststore. This affects both the Gradle wrapper download and dependency resolution.

**Diagnosis:**
```bash
# Check if the Gradle wrapper can download at all
./gradlew --version 2>&1 | head -20

# Check the distribution URL
grep distributionUrl gradle/wrapper/gradle-wrapper.properties
```

**Fixes (try in order):**

1. **Ensure proxy is configured** in `~/.gradle/gradle.properties`. The `systemProp.https.*` settings apply to all HTTPS connections, including the wrapper download.

2. **Import the corporate CA certificate** into the Java truststore:
   ```bash
   # Find the JDK in use
   echo $JAVA_HOME
   # Import the cert
   sudo keytool -importcert -file <corp-ca.crt> -keystore "$JAVA_HOME/lib/security/cacerts" -alias "corp-proxy-ca" -storepass changeit -noprompt
   ```
   If you don't know the corporate CA cert path, ask the developer:
   > "The Gradle wrapper download is failing with an SSL certificate error. This usually means corporate SSL inspection is active. Could you provide the path to your corporate CA certificate file (`.crt` or `.pem`)?

---

## Merchant credentials

*Troubleshooting: Merchant Credentials & MposUi Initialization*

> Common errors (MposUi not initialized) are in [Common](#common).

### Gate-Specific Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Invalid merchant ID | Wrong or expired credentials | Verify in Gateway Manager |
| Invalid secret key | Wrong or rotated key | Regenerate in Gateway Manager |
| Empty `BuildConfig.MERCHANT_ID` | Missing `local.properties` entry | Add to `local.properties` and rebuild. See [SDK build](#sdk-build) for detailed fix. |
| `NoSuchMethodError: MposUi.initialize` | Using old API | Use `MposUi.create()` not `initialize()` |
| `ACCESSORY_NOT_WHITELISTED` at runtime | `UiConfiguration` missing `.terminalParameters()` | Every `UiConfiguration.Builder()` must include `.terminalParameters(terminalParameters)` |

---

### WARNING: Modifying UiConfiguration in Later Gates

**CRITICAL:** If you add or modify `UiConfiguration` in later gates (e.g., Gates 4-7 when adding summary features), you MUST include `.terminalParameters(terminalParameters)` in the new configuration.

Common mistake pattern that causes "terminal not whitelisted" errors:

```kotlin
// WRONG — SDK resets to MOCK when this config is applied
val uiConfiguration = UiConfiguration.Builder()
    .summaryFeatures(setOf(SummaryFeature.REFUND_TRANSACTION))
    .build()
mposUi.configuration = uiConfiguration  // Loses terminal parameters!

// CORRECT — Preserves terminal parameters
val uiConfiguration = UiConfiguration.Builder()
    .terminalParameters(terminalParameters)  // MUST be included
    .summaryFeatures(setOf(SummaryFeature.REFUND_TRANSACTION))
    .build()
mposUi.configuration = uiConfiguration
```

**Solution:** Store `terminalParameters` as a companion/static variable in `PaymentApplication` so it can be reused whenever `UiConfiguration` is created or updated:

```kotlin
companion object {
    lateinit var mposUi: MposUi
        private set

    private lateinit var terminalParameters: AccessoryParameters  // Store for reuse

    fun isMposUiReady(): Boolean = ::mposUi.isInitialized
}
```

Then any gate that modifies `UiConfiguration` can access `PaymentApplication.terminalParameters`.

---

## Refund

*Troubleshooting: Refund Transactions*

> Common errors (MposUi not initialized, ClassNotFoundException/ProGuard) are in [Common](#common).

### Gate-Specific Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `RESULT_CODE_FAILED` with "invalid transaction identifier" | Wrong or expired identifier | Verify the identifier was retrieved from a successful charge result |
| `RESULT_CODE_FAILED` with "amount exceeds original" | Partial refund amount too high | Must be <= original amount minus previous refunds |
| `RESULT_CODE_FAILED` with "token service not enabled" | TMS not configured | Enable TMS in merchant configuration |

---

## Tipping

*Troubleshooting: Tipping*

### On-Reader Tipping Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `error: cannot find symbol TippingProcessStepParameters` | Import missing | Add `import io.mpos.transactionprovider.processparameters.steps.tipping.TippingProcessStepParameters;` |
| `error: method createTransactionIntent cannot be applied to given types` | Passing only one parameter | Change to `createTransactionIntent(params, processParams)` |
| `NullPointerException` on `getIncludedTipAmount()` | Transaction is null or customer declined tip | Add null check before using |
| Tip screen not appearing on terminal | `processParams` not passed to `createTransactionIntent` | Verify second parameter is included |

### On-Receipt Tipping Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Transaction auto-captures immediately | `.autoCapture()` not set to `false` | Add `.autoCapture(false)` before `.build()` |
| Tip adjust rejected with "amount too high" | Tip exceeds 20% of original amount | Reduce tip amount to within 20% limit |
| Tip adjust fails with "transaction not found" | Wrong transaction identifier or transaction expired | Verify transaction ID and ensure tip adjust sent within 24 hours |
| `error: cannot find symbol adjustTip` | Wrong method name or signature | Ensure using `.adjustTip(transactionId, tipAmount, currency)` |

---

## Pre-authorization

*Troubleshooting: Pre-Authorization Transaction*

> Common errors (Currency import, MposUi not initialized, getLatestTransaction null, user cancellation, CASHBACK_NOT_ALLOWED) are in [Common](#common).

### Gate-Specific Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Transaction completes as a sale instead of pre-auth | Missing `.autoCapture(false)` in the builder chain | Add `.autoCapture(false)` after `.charge(amount, currency)` |
| `transactionIdentifier` is null after approval | Not reading the identifier from the result | Use `data.getStringExtra(MposUi.RESULT_EXTRA_TRANSACTION_IDENTIFIER)` or `transaction.getIdentifier()` |

---

## Capture

*Troubleshooting: Capture Transaction*

> Common errors (MposUi not initialized, ClassNotFoundException/ProGuard, CASHBACK_NOT_ALLOWED) are in [Common](#common).

### Gate-Specific Errors

| Error / Symptom | Cause | Fix |
|---|---|---|
| `CAPTURE_AMOUNT_EXCEEDS` | Partial capture amount exceeds authorized amount | Reduce capture amount to <= authorized amount (including incremental auths) |
| `TRANSACTION_ALREADY_CAPTURED` | Transaction was already captured | Check `transaction.isCaptured()` before attempting capture; prevent double-capture in UI |
| `TRANSACTION_NOT_FOUND` | Invalid or expired `transactionIdentifier` | Verify the identifier was persisted correctly from the pre-auth result |
| `AUTHORIZATION_EXPIRED` | Pre-auth expired (5–7 days, issuer-determined) | Create a new pre-authorization — expired auths cannot be captured |
| Capture button not visible on summary screen | `CAPTURE_TRANSACTION` not in `SummaryFeature` set | Add `SummaryFeature.CAPTURE_TRANSACTION` to `UiConfiguration` |

---

## Offline transactions

*Troubleshooting: Offline (Store-and-Forward) Transactions*

> Common errors (Currency import) are in [Common](#common).

### Gate-Specific Errors

| Error                                                       | Cause | Fix                                                                                                                                                                                                                                                           |
|-------------------------------------------------------------|---|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `offlineModule` not found                                   | Referencing a local `mposUi` variable instead of the singleton | Ensure `mposUi` is from `PaymentApplication.mposUi` — not a local variable                                                                                                                                                                                    |
| `createTransactionIntent` signature mismatch                | Calling the method on `mposUi` instead of its offline module | Confirm you are calling on the offline module, not on `mposUi` directly                                                                                                                                                                                       |
| `getPendingTransactions()` compilation error                | API removed in SDK 2.112.0 | Method does not exist in SDK 2.112.0 — use manual counter instead                                                                                                                                                                                             |
| `createSubmitBatchIntent()` not found                       | Wrong method name for current SDK version | Use `submitOfflineTransactionBatchIntent()` (correct name in SDK 2.112.0)                                                                                                                                                                                     |
| Offline sales fail silently / terminal rejects offline mode | Missing configuration sync at startup | `synchronizeConfiguration()` was not called in `PaymentApplication` — add Step 0b                                                                                                                                                                             |
| `OfflineTransactionConfiguration` not found                 | Missing import statement | Import `io.mpos.paybutton.offline.OfflineTransactionConfiguration`                                                                                                                                                                                            |
| "Amount mismatch with ICC data" EMV error                   | Floating-point arithmetic on amount | Use `.multiply(BigDecimal("1.19")).setScale(2, RoundingMode.HALF_UP)`                                                                                                                                                                                         |
| `PaymentApplication` not found                              | Gate 2 prerequisite not completed | Gate 2 (merchant config) must be completed first                                                                                                                                                                                                              |
| Infinite batch-sync loop after offline batch submitted      | (1) Batch-sync handler doesn't check the correct result code — `submitOfflineTransactionBatchIntent()` returns `RESULT_CODE_SUBMIT_BATCH_*`, so the pending counter never resets.<br><br>(2) `NetworkCallback.onAvailable()` fires on registration when a default network exists, re-triggering sync on every `onResume`. | (1) Handle `REQUEST_CODE_SUBMIT_BATCH` + `RESULT_CODE_SUBMIT_BATCH_*` in `onActivityResult`; reset counter on success.<br><br>(2) Make connectivity-triggered sync edge-only and non-reentrant. See `act_08_implement-offline-transactions.md` Steps 2 and 3. |

---

## Install APK

*Troubleshooting: APK Installation on PAX Terminal*

### APK file not found

Respond that the provided APK path is invalid or the file does not exist.

### adb not found

Respond that adb is not installed or could not be found. Share the installation steps for the user's operating system.

### No device connected

Tell the user to connect an Android device over USB and ensure the cable supports data transfer.

### Unauthorized device

Tell the user to:
- Unlock the Android device
- Enable USB debugging if needed
- Approve the laptop when prompted

### Offline device

Tell the user to reconnect the device and verify USB debugging is enabled.

### PAX A920 disconnected after install <!-- REC-03 -->

The PAX A920 may disconnect immediately after install due to USB re-enumeration. Do NOT conclude
the install failed without first:
1. Running `adb devices` every 5 s for up to 180 s.
2. Once back online, running `adb shell pm list packages | grep <pkg>` to confirm install status.

### `adb root` called — device disconnected <!-- REC-03 -->

`adb root` is **forbidden** on PAX A920. If it was called and the device disconnected:
- Instruct the user to physically unplug and replug the USB cable.
- Wait for the device to reappear in `adb devices` before continuing.
- Do NOT attempt further adb commands until the device is back online.

### Multiple devices connected

Ask the user to specify which device should be used.

### INSTALL_FAILED_ALREADY_EXISTS

Explain that the app is already installed and reinstall behavior may be needed.

### INSTALL_FAILED_VERSION_DOWNGRADE

Explain that the APK version is older than the installed version and the existing app may need to be removed first.

### INSTALL_FAILED_UPDATE_INCOMPATIBLE

Explain that the installed app was signed with a different certificate and may need to be uninstalled first.

### INSTALL_PARSE_FAILED_*

Explain that the APK may be invalid, incomplete, corrupted, or not a standalone installable APK.

### App crash after launch

If the post-install verification detects that the app process is not running after launch, warn the user and suggest:
- Checking the device screen for a crash dialog
- Running `adb logcat` to capture the crash log

---

## Verify diagnostics

*Troubleshooting: Transaction Verification Diagnostics*

### Failure Analysis Priority

When analyzing logcat output after a transaction attempt, check these failure indicators in priority order:

1. **Accessory error**: `ACCESSORY_NOT_WHITELISTED`, `ConnectToAccessoryProcess` errors → "Accessory not connected or not whitelisted"
2. **Auth error**: `unauthorized`, `401`, `403` → "Merchant credentials rejected by gateway"
3. **Crash**: `FATAL`, `AndroidRuntime` exception → "Application crashed — see logcat"
4. **Declined**: `RESULT_CODE_FAILED`, `2004`, `declined` → "Transaction declined by gateway"
5. **Silent failure**: No success or failure indicators at all → "No transaction result in logs — verify the transaction was triggered"

### Success Indicators

A transaction is considered successful (PASS) if:
- A success indicator is found (`RESULT_CODE_APPROVED`, `2001`, `approved`, `transaction.completed`)
- AND no FATAL/crash/auth errors are present

### Diagnostic Commands

```bash
# Capture success indicators
adb -s "$DEVICE" logcat -d 2>/dev/null \
  | grep -iE "RESULT_CODE_APPROVED|2001|approved|transaction.completed" | tail -5

# Capture failure indicators
adb -s "$DEVICE" logcat -d 2>/dev/null \
  | grep -iE "RESULT_CODE_FAILED|2004|declined|FATAL|AndroidRuntime|unauthorized|401|403|ACCESSORY_NOT_WHITELISTED|exception|error" | tail -10
```

Extract the specific failure reason from the highest-priority match.
