# Activity SI-1: Set Up Semi-Integrated Project

Configure the HTTP/WebSocket client, base URL and port, and TLS dependencies so the POS system can communicate with the PAX terminal running the Acceptance Devices app.

**Official docs (fetch for API details):**
- [SI PAX Get Started](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-solution-pax-get-started-intro.md)
- [Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md)
- [Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md)

**Troubleshooting:** `troubleshooting.md#si-mtls`

## Critical Rules (NEVER violate these)

1. **NEVER disable TLS certificate verification** as a workaround for connection failures. If certificate validation fails, fix the root cause (missing Root CA, expired cert, wrong SAN) — do NOT skip verification.
2. **NEVER hardcode the terminal IP address or port** in application source code. These must come from configuration (environment variable, config file, or runtime discovery) because they change between environments and terminal reboots.
3. **NEVER store the POS private key in source control.** The RSA private key returned during mTLS setup must be stored outside the repository (e.g., local keystore, environment variable, secrets manager).

## Prerequisites

1. **A PAX terminal** with the Acceptance Devices app installed (PAX A920 or compatible)
2. **Network connectivity** — POS and terminal on same network (Local mode) or POS has internet access (Cloud mode)
3. **A development environment** capable of making HTTPS/WSS connections (any language/platform)
4. **Visa Acceptance merchant credentials** — REST shared secret key or REST certificate for API authentication

## Workflow

### Step 0: Determine Integration Mode

**If `SI_MODE` was provided by the workflow**, use it directly. Otherwise ask:

| Mode | Transport | Use case |
|------|-----------|----------|
| **Local** | WSS directly to terminal | Same network; lowest latency |
| **Cloud** | HTTPS to Visa Acceptance backend | Different networks; centralised |

Store as `SI_MODE` (`local` | `cloud`).

### Step 1: Configure Base URL and Port

#### Local Mode

Fetch the **Local Mode Payment Services** page above for the exact WSS URL pattern and default port.

**Configuration pattern** (platform-agnostic — NEVER hardcode):

```
# Environment or config file
SI_TERMINAL_HOST=192.168.1.100
SI_TERMINAL_PORT=8443
SI_BASE_URL=wss://${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT}/
```

**Important:** Terminal IP may change on DHCP networks. Recommend static IP or runtime discovery.

#### Cloud Mode

Fetch the **Cloud Mode Payment Services** page above for the exact HTTPS endpoints (test and production).

```
# Environment or config file
SI_ENVIRONMENT=test
SI_TERMINAL_SERIAL=<serial_number_from_terminal>
```

### Step 2: Add TLS Dependencies

The official docs do NOT cover platform-specific dependency setup. Use the table and examples below.

#### Required TLS Capabilities

| Capability | Local mode | Cloud mode |
|------------|-----------|------------|
| TLS 1.2+ client | Required | Required |
| mTLS (client certificate auth) | Required (recommended) or TLS-only | Not required |
| WebSocket (WSS) client | Required | Not required |
| Root CA trust store management | Required | Standard (system CAs) |
| HTTPS client | Not required | Required |

#### Platform-Specific Dependencies

**Java/Kotlin (Android or backend):**

```gradle
// OkHttp — supports WSS + mTLS
implementation("com.squareup.okhttp3:okhttp:4.12.0")

// For mTLS certificate handling — PEM parsing
implementation("org.bouncycastle:bcpkix-jdk18on:1.78")
```

> **CRITICAL — Android mTLS requires three non-obvious fixes (API 28+):** building the
> mTLS `OkHttpClient` on Android hits three sequential issues that don't occur on other
> platforms: (1) BouncyCastle provider registration is silently skipped, (2) that fix then
> hijacks `SSLContext` selection away from Conscrypt, and (3) Java's default `X509KeyManager`
> drops the client cert on an issuer-DN mismatch (Root CA vs Intermediate CA) even though
> `curl`/`openssl` connect fine. All three must be fixed together — see
> `troubleshooting.md#si-android-mtls-fixes` for the full root-cause explanation and the
> complete `buildMtlsClient()` implementation.

> **CRITICAL — JSON serialization `type` discriminator trap:**
> Every SI request body requires a `type` discriminator field (`"type": "PaymentRequest"`,
> `"type": "TipAdjustRequest"`, etc.). Many serialization libraries omit fields that match
> their default value. If your serializer is configured to skip default-valued fields, it will
> silently strip the `type` field from the JSON body. The backend rejects every such request
> with **HTTP 400 `errorCode 5100`**. The code looks correct and compiles cleanly, making
> this very hard to diagnose.
>
> Fix: configure your serializer to always include the `type` field regardless of its value
> (e.g. force-encode defaults, or annotate the field as always-serialized). Verify the emitted
> JSON contains `"type": "..."` before investigating other causes of `errorCode 5100`.

**Node.js:**

```json
{ "dependencies": { "ws": "^8.16.0" } }
```

Built-in `tls` and `https` modules handle TLS/mTLS. The `ws` library supports WSS with custom TLS options.

**Python:**

```
websockets>=12.0
```

Built-in `ssl` module handles TLS/mTLS. `websockets` supports WSS with custom SSL contexts.

**.NET (C#):** Built-in `System.Net.WebSockets` and `System.Net.Http` — no additional packages.

**Go:** Built-in `crypto/tls` + `gorilla/websocket` (or `nhooyr.io/websocket`).

### Step 3: Configure TLS Security

#### Local Mode — mTLS (Recommended)

Three assets needed (fetch **Local Mode Payment Services** page for retrieval APIs):

| Asset | Purpose | Source |
|-------|---------|--------|
| Root CA certificate | POS trusts terminal's cert | REST API or Business Center |
| POS certificate | Terminal trusts POS | Generated during mTLS pairing (Activity SI-2) |
| POS private key | POS proves identity | Returned with POS certificate |

**Configuration pattern (platform-agnostic — NEVER hardcode):**

```
# local.properties / .env / config file — NEVER commit to source control
SI_ROOT_CA_PATH=/path/to/visa-root-ca.pem
SI_POS_CERT_PATH=/path/to/pos-certificate.pem
SI_POS_KEY_PATH=/path/to/pos-private-key.pem
```

**Where to store the cert files — by platform:**

| Platform | Recommended location | How to get files there |
|----------|---------------------|------------------------|
| Android | `context.filesDir` (private app storage) | `adb push` to app-scoped external path, then copy to `filesDir` at startup (see note below) |
| Node.js / Python / Go / .NET (server) | Any directory outside the project repo | Copy manually or via deploy script |
| Java backend | Outside the project repo; path in env var | Copy manually or via deploy script |

> **Android cert deployment — use the app-scoped external path, not `/sdcard/` root.**
>
> Push cert files to the app's scoped external directory. This path requires no special
> permissions on any Android version:
>
> ```bash
> PKG=<your.app.package.name>   # e.g. com.example.posapp
> adb -s "$SI_POS_SERIAL" push visa-root-ca.pem    /sdcard/Android/data/${PKG}/files/visa-root-ca.pem
> adb -s "$SI_POS_SERIAL" push pos-certificate.pem /sdcard/Android/data/${PKG}/files/pos-certificate.pem
> adb -s "$SI_POS_SERIAL" push pos-private-key.pem /sdcard/Android/data/${PKG}/files/pos-private-key.pem
> ```
>
> The app reads from `context.getExternalFilesDir(null)`, which resolves to
> `/sdcard/Android/data/<packageId>/files/` — no `READ_EXTERNAL_STORAGE` permission needed.
>
> **`copyCertToFilesDir` helper — with `getExternalFilesDir` as primary source:**
>
> ```kotlin
> private fun copyCertToFilesDir(fileName: String): String? {
>     val dest = java.io.File(context.filesDir, fileName)
>     if (dest.exists() && dest.length() > 0L) return dest.absolutePath
>
>     // Primary: app-scoped external storage — matches the adb push target above
>     val externalSource = java.io.File(context.getExternalFilesDir(null), fileName)
>     // Fallback: legacy /sdcard/ root (older setups or manual transfer)
>     val legacySource = java.io.File("/sdcard/$fileName")
>
>     val source = when {
>         externalSource.exists() && externalSource.length() > 0L -> externalSource
>         legacySource.exists() && legacySource.length() > 0L -> legacySource
>         else -> {
>             android.util.Log.e("SI", "Cert not found: $fileName — push to ${externalSource.absolutePath}")
>             return null
>         }
>     }
>     return try {
>         source.inputStream().use { i -> dest.outputStream().use { o -> i.copyTo(o) } }
>         dest.absolutePath
>     } catch (e: Exception) {
>         android.util.Log.e("SI", "Cannot copy cert ${source.absolutePath}: ${e.message}")
>         null
>     }
> }
> ```
>
> Call `copyCertToFilesDir(fileName)` before building the `SSLContext`. Pass the returned
> `filesDir` path into `SslContextBuilder`. If it returns `null`, the file was not found —
> verify `adb push` completed to the scoped path.
>
> **All other platforms:** read the cert file directly from the configured path.
> Use an environment variable or config file for the path — never hardcode it.

#### Local Mode — TLS Only (Minimum)

- Still requires Root CA in trust store
- Does NOT require POS certificate/key
- Change terminal setting: Settings → Security → TLS

#### Cloud Mode — Standard HTTPS

Standard HTTPS with a **bearer token obtained from `/login`** (exchange the Acceptance Devices merchant `id`/`secret`). No custom CA needed. **Ignore the docs'/llms.txt JWT/P12 construction for the transaction endpoint** — that returns HTTP 500. See `cloud-transaction-auth.md`.

### Step 3b: Corporate Proxy TLS Trust (debug builds only)

**Symptom, cause, and the `--noproxy` curl rule:** see `troubleshooting.md#si-corporate-proxy`.

**Fix — platform-specific trust-store configuration (canonical, referenced from
`troubleshooting.md#si-corporate-proxy`):** In your development/debug build configuration,
add the corporate proxy CA to your HTTP client's trust store:
- **Android:** add a debug-only `network_security_config.xml` that trusts the system CA store
- **Python/Node.js/other:** set the `REQUESTS_CA_BUNDLE` / `NODE_EXTRA_CA_CERTS` / equivalent env var, or pass the CA bundle path to your HTTP client
- **curl:** use `--cacert /path/to/corporate-ca.pem` or `--noproxy "*"` to bypass the proxy entirely for Visa Acceptance endpoints

Only apply the CA trust expansion in development builds — production builds should use the default trust store.

### Step 4: Configure Hostname Validation (Local Mode — mTLS Only)

The terminal certificate uses a SAN:

```
{terminal-serial-number}.cybs.seclib.io
```

#### Non-Android platforms (Node.js, Python, Go, .NET, Java backend)

1. Get the terminal serial number
2. Add a hosts file entry:

```
# /etc/hosts (Unix) or C:\Windows\System32\drivers\etc\hosts (Windows)
192.168.1.100    ABC123456789.cybs.seclib.io
```

3. Use the SAN hostname in the WebSocket URL:

```
wss://ABC123456789.cybs.seclib.io:8443/
```

#### Android (OkHttp)

> ⚠️ **Android devices cannot modify `/etc/hosts` without root.** A `/etc/hosts` entry on the
> dev machine (Mac) only helps the dev machine's own `openssl s_client` test — it has no effect
> on the Android app running on the device.

For development, configure OkHttp with a custom `HostnameVerifier` that accepts the terminal's
certificate:

```kotlin
// DEV ONLY — accepts any hostname on connections using the known Root CA
// Replace with a proper hostname→serial mapping before production use
val hostnameVerifier = HostnameVerifier { _, session ->
    try {
        val cert = session.peerCertificates.firstOrNull()
            as? java.security.cert.X509Certificate ?: return@HostnameVerifier false
        // Accept if the cert's SAN ends with .cybs.seclib.io (Visa terminal cert)
        val sans = cert.subjectAlternativeNames ?: return@HostnameVerifier false
        sans.any { san ->
            san.size >= 2 && san[1].toString().endsWith(".cybs.seclib.io")
        }
    } catch (e: Exception) { false }
}

val client = OkHttpClient.Builder()
    .sslSocketFactory(sslSocketFactory, trustManager)
    .hostnameVerifier(hostnameVerifier)
    .build()
```

Use the terminal's IP address directly in the WebSocket URL (no hostname mapping needed):

```
wss://<SI_TERMINAL_HOST>:8443/
```

**Alternative (simplest for development):** Fully disable hostname verification.
Only use in isolated dev environments — never in production:

```kotlin
// DEV ONLY
val client = OkHttpClient.Builder()
    .sslSocketFactory(sslSocketFactory, trustManager)
    .hostnameVerifier { _, _ -> true }
    .build()
```

### Step 5: Verify Connectivity

#### Local Mode

```bash
# Network reachability
ping -c 3 ${SI_TERMINAL_HOST}

# Port open (terminal server must be running — see Activity SI-2)
nc -zv ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} 2>&1

# TLS handshake (requires terminal activated and server started)
openssl s_client -connect ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT} -showcerts </dev/null 2>&1 | head -30
```

#### Cloud Mode

```bash
curl -sS --max-time 10 -o /dev/null -w "%{http_code}" https://terminalstest.visaacceptance.com/
```

## Troubleshooting

If connectivity fails:
- `troubleshooting.md#si-mtls` — for mTLS certificate, handshake, and network issues

## Acceptance Criteria

1. Integration mode determined (`local` or `cloud`)
2. Base URL and port configuration externalised (not hardcoded in source)
3. TLS dependencies added to the project for the chosen platform
4. For Local mode:
   - Root CA certificate retrieved and stored outside source control
   - TLS client configured to trust the Root CA
   - If mTLS: key store configured for client certificate (placeholder until Activity SI-2)
   - Hostname validation strategy determined
5. For Cloud mode:
   - HTTPS client configured with standard TLS
   - Bearer-token acquisition scaffolded (`/login` → `{token}`; see `cloud-transaction-auth.md`)
   - Terminal serial number stored in configuration
6. Connectivity verification passes (network-level reachability confirmed)

> **CRITICAL — a scaffold-only pass is not a passing gate.** If this activity is run as
> Gate SI-1a (early-start, before credentials are available — see `workflow.md` SI-Q2a),
> auth header construction, bearer-token exchange, and signed-request logic are the ONLY
> things allowed to be incomplete, and each must be marked `// TODO(SI-1b): requires
> validated credentials` at its call site — not silently stubbed or omitted. Gate SI-1 as
> a whole is NOT complete, and must NOT be reported PASS, until Gate SI-1b has replaced
> every `TODO(SI-1b)` marker with working code using validated credentials. Grep for
> `TODO(SI-1b)` before reporting PASS — any remaining match is a gate failure.

> **CRITICAL — Gate SI-1 is NOT complete until the demo POS app's primary action button
> dispatches a real transaction via `boundary.send(Event.StartTransaction(...))`.
> A compiling network layer is NOT sufficient.** Every stub `onClick`/handler must be
> replaced with a real dispatch. Acceptance criterion: the app performs a live transaction
> from its own UI on the target device.
>
> Before closing this gate, enumerate every user-facing action the chosen gate set
> requires (sale, refund, pre-auth, capture, tip-adjust, lookup, cancel) and verify that
> BOTH a UI affordance (button, menu item, or screen) AND a matching `NetworkGateway`
> handler exist for each. Missing either side of this pair is a gate failure.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-1 of the Semi-Integrated solution: HTTP client and TLS project setup.

Working directory: <project root>

## Inputs

SI_MODE=<SI_MODE>
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>
SI_ADB_FORWARDING=<SI_ADB_FORWARDING>
SI_POS_SERIAL=<SI_POS_SERIAL>
PLATFORM=<PLATFORM>
GATE_SI1_PHASE=<full | scaffold-only-SI-1a | complete-SI-1b>

## Phase scope

- **`full`** (default — credentials already validated): implement everything in this
  activity, including auth header construction, bearer-token exchange, and signed-request
  logic. No TODO markers should remain when you report.
- **`scaffold-only-SI-1a`** (credentials not yet available — developer opted into early
  start): implement Steps 1, 2, 3 (cert file paths/loading, NOT the auth values
  themselves), 4, and 5. For every place that needs a credential-dependent value (auth
  header, bearer token exchange, signed request), write the call site but mark it
  `// TODO(SI-1b): requires validated credentials` — do NOT invent placeholder credential
  values or pretend the call is complete. Report `Status: DEFERRED`, not `PASS`.
- **`complete-SI-1b`** (credentials now validated — completing an SI-1a scaffold): search
  the project for `TODO(SI-1b)` markers and implement the real credential-dependent logic
  at each site using the now-validated credentials. Do not re-scaffold anything already
  done in SI-1a. Verify zero `TODO(SI-1b)` markers remain before reporting `PASS`.

## Device context

Two physical devices are involved in this integration:
- **PAX terminal** — runs the Acceptance Devices app, handles card interaction.
  ADB serial (if USB-connected): derived from the PAX model filter in the workflow.
- **POS device** — runs the POS application you are building. ADB serial: SI_POS_SERIAL.

When PLATFORM=android and SI_POS_SERIAL is set, all build and install commands MUST
target the POS device explicitly:

  ./gradlew assembleDebug
  adb -s <SI_POS_SERIAL> install -r app/build/outputs/apk/debug/app-debug.apk

Do NOT run `adb install` without `-s <SI_POS_SERIAL>` when two devices are connected —
ADB will error with "more than one device/emulator" and the install will fail.

If SI_POS_SERIAL is empty and PLATFORM=android, ask the developer for the POS device ADB
serial before running any `adb` commands:

  adb devices -l   # show developer the list so they can identify the POS device

## Reference docs — fetch these for API details

- Local Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md
- Cloud Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md

Read these files before writing any code:
1. `project-plan.md` (in the project root) — contains project context and SI configuration
2. `activities/act_SI_01_setup-project.md` — the activity definition (this file)

## Your task

Implement Gate SI-1 using the activity file as your primary guide.
Fetch the relevant official docs page above for exact API endpoints and URL patterns.
The activity file provides: critical rules, platform-specific deps, verification commands,
and acceptance criteria. The official docs provide: API details and configuration specifics.

Platform: <PLATFORM> (android, node, python, dotnet, go, java)
Choose appropriate dependencies and patterns for this platform.

For Local mode: set up WSS client with TLS/mTLS support.
For Cloud mode: set up HTTPS client with bearer-token authentication (token from `/login`; NOT a P12-signed JWT — see `cloud-transaction-auth.md`).

## Mandatory verification

After applying all changes:
- Verify the project builds/compiles without errors
- If PLATFORM=android: install the built APK on the POS device using `adb -s <SI_POS_SERIAL> install`
- Verify network connectivity to the terminal (local) or backend (cloud)
- Do NOT attempt WebSocket connection yet — terminal may not be activated (Activity SI-2)

## Required report

```
GATE SI-1 REPORT
Phase: full | scaffold-only-SI-1a | complete-SI-1b
Status: PASS | FAIL | DEFERRED
Mode: LOCAL | CLOUD
Platform: <platform>
TLS security: mTLS | TLS | Standard HTTPS
Base URL configured: <url pattern>
Dependencies added: <list>
Files modified: <list>
POS device serial used for install: <SI_POS_SERIAL> | N/A (non-Android)
Connectivity check: PASS | FAIL
TODO(SI-1b) markers remaining: <count> (must be 0 for Status: PASS)
Acceptance criteria met: <list>
```
```
