# Troubleshooting — PAX Semi-Integrated

Semi-Integrated solution troubleshooting. These notes are developed from real integration testing and enterprise-environment experience — information **not available** in the official documentation.

## Topics

- [Corporate network / VPN blocking API endpoint](#si-corporate-network)
- [Corporate proxy / TLS interception](#si-corporate-proxy)
- [Activation codes](#si-activation-codes)
- [mTLS](#si-mtls)
- [Android mTLS — three required fixes (API 28+)](#si-android-mtls-fixes)
- [WSS echo check — post-mTLS application-layer readiness](#si-wss-echo)
- [RKI — Remote Key Injection (terminal-side)](#si-rki)
- [Transactions](#si-transactions)
- [validate-credentials.sh known bugs](#si-validate-credentials-bugs)

---

## Corporate network / VPN blocking API endpoint {#si-corporate-network}

*Troubleshooting: `apitest.visaacceptance.com` unreachable from dev machine*

**Symptom:** `curl` to `https://apitest.visaacceptance.com/...` times out or is refused.
`route get apitest.visaacceptance.com` shows `interface: utun*` (VPN tunnel), or the corporate
proxy blocks the host outright.

**Affects:** activation code generation, Root CA download, mTLS cert exchange — all REST API calls
in Gate SI-2.

### Option 1 — `adb shell curl` via USB-connected device (recommended when VPN cannot be disabled)

If a USB-connected device (Android POS or PAX terminal) has internet access (mobile data or
unrestricted WiFi), run the API calls through it via ADB. The device's network is independent of
the Mac's VPN routing.

**Check internet access on the device:**
```bash
# Android POS device
adb -s "$SI_POS_SERIAL" shell curl -s --max-time 5 \
  -o /dev/null -w "%{http_code}" https://apitest.visaacceptance.com/up
# PAX terminal (if ADB available)
adb -s "$PAX_SERIAL" shell curl -s --max-time 5 \
  -o /dev/null -w "%{http_code}" https://apitest.visaacceptance.com/up
```
HTTP 200 → device can reach the endpoint. Use it for all API calls.

**Run API calls via `adb shell`:**
```bash
# Example: generate activation code via Android device's network
adb -s "$SI_POS_SERIAL" shell curl -s -X POST \
  "https://apitest.visaacceptance.com/dms/v2/merchants/${TRANSACTING_MID}/activation-codes?size=1" \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: ${ORG_ID}" \
  -H "Date: $(date -u '+%a, %d %b %Y %H:%M:%S GMT')" \
  -H "Signature: ..." \
  -d "{}"
```

Pipe the JSON response back to the Mac normally — the output of `adb shell` prints to stdout.
Use the same pattern for Root CA download and mTLS cert exchange.

> **Note on `curl` availability:** most Android devices ship with `curl` in `/system/bin/` or
> `/data/local/tmp/`. If `curl` is not found, try `wget -O -` as a drop-in replacement for GET
> requests. For POST, a static `curl` binary can be pushed via `adb push`.

### Option 2 — Phone hotspot (fastest if VPN can be disconnected)

Disconnect VPN, tether to a phone hotspot, run the API calls, reconnect VPN.

### Option 3 — Jump server / cloud VM

SSH to any internet-reachable server, run the curl commands there, copy results back via `scp`.

### Option 4 — VPN lab tunnel

If a lab VPN exists that allows outbound traffic to `apitest.visaacceptance.com`, switch to it.

---

## Corporate proxy / TLS interception {#si-corporate-proxy}

*Troubleshooting: TLS handshake failures caused by a corporate proxy re-signing certificates*

**Appears in:** Gate SI-1, Gate SI-2, Gate SI-3 — any outbound HTTPS/WSS call to Visa Acceptance endpoints

---

### TLS handshake failure / connection reset to terminalstest.visaacceptance.com

| Symptom | Cause | Fix |
|---------|-------|-----|
| TLS handshake failure / connection reset to terminalstest.visaacceptance.com | A corporate proxy intercepts TLS and re-signs with its own CA, which is not trusted by the HTTP client by default | Add the corporate proxy CA to your HTTP client's trust store in development builds (see act_SI_01 Step 3b for platform-specific guidance). For curl: add `--noproxy "*"` to bypass the proxy entirely for Visa Acceptance endpoints. |

**Notes:**
- All `curl` commands in this skill should include `--noproxy "*"` for Visa Acceptance endpoints when running behind a corporate proxy.
- Apply CA trust expansion in development/debug builds only — production builds should use the default trust store.

---

## Activation codes

*Troubleshooting: Semi-Integrated Terminal Activation*

Issues encountered when generating or entering activation codes on PAX terminals running the Acceptance Devices app.

**Appears in:** Gate SI-2 (Terminal Activation)

---

### Activation code rejected — "Invalid code" on terminal

| Error | Cause | Fix |
|-------|-------|-----|
| "Invalid code" or "Activation failed" on terminal screen | Code expired (>24 hours), already used, or typo | Generate a fresh code and retry immediately |

**Diagnosis steps:**

1. Check that the code was entered exactly as displayed (including special characters like `%`, `!`, `@`)
2. Verify the code is less than 24 hours old — check `ttl` in the API response
3. Confirm the code has not been used on another terminal

**Verification command (API):**

```bash
# Generate a fresh code
curl -X POST \
  "https://apitest.visaacceptance.com/dms/v2/merchants/${TRANSACTING_MID}/activation-codes?size=1" \
  -H "Content-Type: application/json" \
  -H "Authorization: <auth_header>" \
  -d "{}"
```

If the API returns HTTP 200 with a new token, the issue was with the previous code (expired or consumed).

---

### API returns 401/403 when generating activation code

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid or expired REST credentials | Regenerate shared secret key or certificate in Business Center |
| `403 Forbidden` | MID not authorised for activation code generation | Verify the MID is configured for Semi-Integrated in Business Center |

**Diagnosis:**

```bash
# Test authentication independently
curl -X GET \
  "https://apitest.visaacceptance.com/dms/v2/merchants" \
  -H "Authorization: <auth_header>" \
  -w "\nHTTP Status: %{http_code}\n"
```

If this returns 401, your credentials are invalid — regenerate them in the Visa Acceptance Business Center under Security Keys.

---

### API returns 400 — invalid MID

| Error | Cause | Fix |
|-------|-------|-----|
| `400 Bad Request` with message about merchant ID | Transacting MID not found or not configured for device management | Use the correct transacting MID (not the reseller or portfolio MID) |

**Key distinction:** The activation API requires the **transacting MID** — the MID that will process transactions. This is different from the portfolio or reseller MID. Check Business Center → Organisation Management to confirm the correct MID hierarchy.

---

### Terminal shows "Device already activated"

| Error | Cause | Fix |
|-------|-------|-----|
| Terminal rejects new activation code | Terminal was previously activated and is still bound | Deactivate first via Business Center (Acceptance Devices → Manage Devices), then re-activate |

If re-activation is needed (e.g., switching MIDs), the terminal must be deactivated first through Business Center or the device management API.

---

### Activation succeeds but terminal shows "Generate Code to POS" (cloud mode)

| Symptom | Cause | Fix |
|---------|-------|-----|
| After activation, terminal shows "Generate Code to POS" screen instead of "Device connected" | Terminal security defaults to mTLS, which shows the pairing screen. In cloud mode this screen is irrelevant — the cloud connection is established in the background independently. | **Wait ~1 minute.** The terminal will auto-connect to the cloud backend and transition to "Device connected" on its own without completing the mTLS flow. |
| "Generate Code to POS" persists for more than 2 minutes without auto-connecting | Terminal may not have internet access, or customization needs updating | 1. Verify terminal has WiFi/internet. 2. If still stuck, change security to TLS via Business Center (Acceptance Devices → Customizations → Security → TLS) or via `PUT /dms/v2/customization` with body `{"type":"organization","id":"<ORG_ID>","customizations":{"SECURITY":"TLS"}}`. Note: the `localModeParameters` body schema returns HTTP 400 — use `customizations.SECURITY` instead. |

> **Why this happens:** The terminal's mTLS pairing screen is for the local-mode direct connection.
> In cloud mode, the terminal establishes a separate outbound connection to the Visa Acceptance
> backend that does not depend on the local mTLS security setting. The "Generate Code to POS"
> screen will display but the cloud connection proceeds in the background.
>
> **Note:** The security setting is NOT changed on the terminal itself — there is no "Settings → Security"
> menu on the terminal. It is configured remotely via Business Center or the REST customization API.

---

### Activation succeeds but terminal stays on "Not connected"

| Symptom | Cause | Fix |
|---------|-------|-----|
| Activation confirmation shown but server won't start | mTLS selected but pairing not completed | Complete mTLS certificate pairing (Activity SI-2, Step 4) before starting server. For cloud mode, switch terminal security to TLS instead — mTLS pairing is not needed. |
| Activation confirmation shown but server won't start | Network connectivity lost between activation and server start | Verify terminal has WiFi/Ethernet connectivity |
| Security setting changed via API (e.g., TLS→mTLS after cert exchange) but terminal still behaves as if the old setting is active | Terminal has not reloaded its security configuration | Navigate to AD app menu → **POS Setup** → tap **Generate Code**. This triggers a config reload. You do not need to use the displayed code — the navigation itself is the fix. Then proceed to Connect Device. |

---

## mTLS

*Troubleshooting: Semi-Integrated mTLS Certificate and Handshake Issues*

Issues encountered during mTLS pairing, certificate exchange, and WebSocket/TLS handshake with the PAX terminal.

**Appears in:** Gate SI-1 (Project Setup), Gate SI-2 (Terminal Activation)

---

### TLS handshake failed — `certificate_unknown` or `bad_certificate`

| Error | Cause | Fix |
|-------|-------|-----|
| `SSL alert: certificate_unknown` | Terminal does not trust the POS certificate | Re-run mTLS pairing (Activity SI-2, Step 4) — the setup code may have expired |
| `SSL alert: bad_certificate` | POS certificate is malformed or does not match the private key | Verify cert/key pair matches: `openssl x509 -noout -modulus -in pos-cert.pem` vs `openssl rsa -noout -modulus -in pos-key.pem` |
| Android: `SSLHandshakeException` / `bad_certificate` even though `openssl s_client` from Mac passes | Cert files are on the Mac but NOT on the Android device — the `openssl` test runs from the Mac and succeeds; the Android app has no cert to present | Run `adb -s $SI_POS_SERIAL push` for all three cert files (SI-2 Step 4.5), then rebuild and reinstall the APK so `copyCertToFilesDir()` runs at startup |
| Android: `SSLPeerUnverifiedException: Hostname verification failed` | OkHttp rejects the terminal cert because SAN `{serial}.cybs.seclib.io` doesn't match the IP in the WSS URL — Android cannot use `/etc/hosts` without root | Configure a custom `HostnameVerifier` in OkHttp (see act_SI_01 Step 4 Android section) |
| Android: `FileNotFoundException: /sdcard/…` | App reading directly from `/sdcard/` root — blocked on Android 7+ (API 25+) without `READ_EXTERNAL_STORAGE` | Push certs to `/sdcard/Android/data/<packageId>/files/` instead of `/sdcard/` root; ensure `copyCertToFilesDir()` runs at startup using `getExternalFilesDir(null)` as source |

**Verification:**

```bash
# Check that cert and key match (modulus must be identical)
POS_CERT_MOD=$(openssl x509 -noout -modulus -in /path/to/pos-certificate.pem | openssl md5)
POS_KEY_MOD=$(openssl rsa -noout -modulus -in /path/to/pos-private-key.pem | openssl md5)

if [ "$POS_CERT_MOD" = "$POS_KEY_MOD" ]; then
  echo "MATCH — cert and key are paired correctly"
else
  echo "MISMATCH — re-run mTLS pairing to get a fresh cert/key pair"
fi
```

---

### TLS handshake failed — `unknown_ca` or `PKIX path building failed`

| Error | Cause | Fix |
|-------|-------|-----|
| `unknown_ca` / `PKIX path building failed` | POS trust store does not contain the Visa Root CA | Download and install the Root CA certificate |

**Fix:**

```bash
# Re-download the Root CA
curl -X GET \
  "https://apitest.visaacceptance.com/dms/v2/devices/certificates/rootca" \
  -H "Authorization: <auth_header>" \
  | jq -r '.certificateChain' > /path/to/visa-root-ca.pem

# Verify the CA cert is valid
openssl x509 -in /path/to/visa-root-ca.pem -noout -subject -dates
```

For Java/Android applications, ensure the Root CA is imported into the JKS/BKS trust store:

```bash
keytool -importcert \
  -file /path/to/visa-root-ca.pem \
  -keystore /path/to/truststore.jks \
  -alias "visa-si-root-ca" \
  -storepass changeit \
  -noprompt
```

---

### Setup code expired during mTLS pairing

| Error | Cause | Fix |
|-------|-------|-----|
| API returns error when requesting POS certificate | Setup code refreshes every 300 seconds (5 minutes) | Get a fresh code from the terminal and retry immediately |

**Workflow:**
1. Navigate to the "Generate Code" screen on the terminal
2. Note the new 8-character code
3. Immediately call the certificates API with the fresh code
4. Complete within 5 minutes

**Tip:** Have the API request ready to execute before looking at the terminal screen. Copy the code and execute within seconds.

---

### Connection refused — port not open

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused` on port 8443 | Terminal server not started | Tap "Connect Device" on the terminal |
| `Connection refused` on port 8443 | Wrong port configured | Check terminal settings for actual port number |
| `Connection refused` on port 8443 | Terminal not on same network | Verify POS and terminal are on the same subnet |

**Diagnosis:**

```bash
# Verify port is open
nc -zv ${TERMINAL_IP} 8443 2>&1

# If refused, try common alternative ports
for port in 8443 443 8080; do
  nc -zv ${TERMINAL_IP} ${port} 2>&1
done

# Verify network reachability
ping -c 3 ${TERMINAL_IP}
```

---

### Hostname verification failure — SAN mismatch

| Error | Cause | Fix |
|-------|-------|-----|
| `Hostname verification failed` / `No subject alternative names matching` | WebSocket URL uses IP but cert has SAN `{serial}.cybs.seclib.io` | Add hosts file entry mapping IP to SAN hostname, or disable hostname verification |

**Fix Option 1 — Hosts file (recommended):**

```bash
# Get terminal serial (visible on terminal About screen)
echo "${TERMINAL_IP}    ${SERIAL_NUMBER}.cybs.seclib.io" | sudo tee -a /etc/hosts

# Then use: wss://${SERIAL_NUMBER}.cybs.seclib.io:8443/
```

**Fix Option 2 — Disable hostname verification (development only):**

For Java/Kotlin:
```kotlin
val hostnameVerifier = HostnameVerifier { _, _ -> true }  // DEV ONLY — never in production
```

For Python:
```python
ssl_ctx.check_hostname = False  # DEV ONLY
```

**Warning:** Disabling hostname verification removes a critical security layer. Only use during development.

---

### WebSocket connection drops immediately after handshake

| Error | Cause | Fix |
|-------|-------|-----|
| WSS connects but closes with code 1006 (abnormal) | Terminal server not fully initialised | Wait 5–10 seconds after "Device connected" before connecting |
| WSS connects but closes with code 1008 (policy) | POS certificate not authorised for this terminal | Verify POS certificate was generated for this specific terminal's setup code |

**Diagnosis:**

```bash
# Check if the TLS handshake succeeds even if WS fails
openssl s_client \
  -connect ${TERMINAL_IP}:8443 \
  -cert /path/to/pos-certificate.pem \
  -key /path/to/pos-private-key.pem \
  -CAfile /path/to/visa-root-ca.pem \
  </dev/null 2>&1 | grep "Verify return code"
```

If TLS handshake succeeds (`Verify return code: 0`) but WebSocket still fails, the issue is at the application protocol layer — retry after a brief delay or check the terminal app logs.

---

### Certificate expired

| Error | Cause | Fix |
|-------|-------|-----|
| `certificate has expired` | POS certificate past its validity period | Re-run mTLS pairing to obtain a fresh certificate |
| `certificate has expired` | Root CA certificate expired | Download a fresh Root CA from the API or Business Center |

**Check expiry:**

```bash
# POS certificate
openssl x509 -in /path/to/pos-certificate.pem -noout -dates

# Root CA
openssl x509 -in /path/to/visa-root-ca.pem -noout -dates
```

If either certificate shows `notAfter` in the past, re-download/re-pair to obtain fresh credentials.

---

---

## Android mTLS — three required fixes (API 28+) {#si-android-mtls-fixes}

*Applies to: `PLATFORM=android` + `SI_SECURITY=mtls`. All three fixes are required. They must be applied to `buildMtlsClient()` in `NetworkGateway.kt`.*

These issues do not appear in other platforms (Node.js, Python, Go) or in `curl`/`openssl` testing. They surface only when using Java's JCA/JSSE stack on Android API 28+. **Apply all three before attempting a live transaction.**

---

### Fix 1 — BouncyCastle RSA KeyFactory removed on Android P+ (API 28)

**Symptom:**
```
java.security.NoSuchAlgorithmException: The BC provider no longer provides
an implementation for KeyFactory.RSA
at org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter.getKeyPair(...)
```

**Root cause:** Android ships a stripped "BC" provider. `Security.addProvider(BouncyCastleProvider())` silently does nothing because "BC" is already registered — but Android's "BC" is missing RSA support.

**Fix:** Remove Android's BC first, then insert the full standalone provider:
```kotlin
// Replace this:
if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
    Security.addProvider(BouncyCastleProvider())
}

// With this:
Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME)
Security.insertProviderAt(BouncyCastleProvider(), 1)
```

---

### Fix 2 — Standalone BC at position 1 hijacks SSLContext away from Conscrypt

**Symptom:** After Fix 1, `SSLContext.getInstance("TLS")` picks BC's TLS stack (now at position 1) instead of Android's Conscrypt. BC's TLS stack behaves differently from the system stack and may cause cipher suite or handshake issues.

**Fix:** Request Conscrypt explicitly for the SSLContext. BC is still used for PEM key parsing; Conscrypt handles the TLS handshake:
```kotlin
// Replace:
val sslContext = SSLContext.getInstance("TLS")

// With:
val sslContext = runCatching { SSLContext.getInstance("TLS", "AndroidOpenSSL") }
    .recoverCatching { SSLContext.getInstance("TLS", "Conscrypt") }
    .getOrElse { SSLContext.getInstance("TLS") }
```

---

### Fix 3 — Java X509KeyManager issuer-DN mismatch sends empty Certificate (THE CRITICAL FIX)

**Symptom:** `SSLV3_ALERT_HANDSHAKE_FAILURE` from Conscrypt. `curl` with the same cert files **works**; OkHttp/Java **fails**.

**Root cause:** The PAX terminal's `CertificateRequest` lists the **Root CA** DN as the acceptable issuer. The POS client certificate is issued by the **Intermediate CA** (not the Root CA directly). Java's `X509KeyManager.chooseClientAlias()` does a **direct DN string match** — intermediate ≠ root → returns `null` → OkHttp sends an empty `Certificate` message → terminal sends `handshake_failure`.

`curl` and `openssl` use BoringSSL which **walks the certificate chain** when matching issuers, so they find a valid match and succeed. Java's `KeyManagerFactory` does not chain-walk.

**Fix:** Override `X509KeyManager` to unconditionally return the alias, bypassing issuer-matching:
```kotlin
val customKeyManager = object : X509KeyManager {
    // Always return our alias regardless of what issuers the server requests.
    override fun chooseClientAlias(
        keyType: Array<out String>?,
        issuers: Array<out java.security.Principal>?,
        socket: java.net.Socket?
    ) = "pos-client"

    override fun getClientAliases(keyType: String?, issuers: Array<out java.security.Principal>?) =
        arrayOf("pos-client")
    override fun getCertificateChain(alias: String?) =
        keyStore.getCertificateChain("pos-client")
            ?.filterIsInstance<java.security.cert.X509Certificate>()?.toTypedArray()
    override fun getPrivateKey(alias: String?) =
        keyStore.getKey("pos-client", null) as? java.security.PrivateKey
    override fun chooseServerAlias(keyType: String?, issuers: Array<out java.security.Principal>?, socket: java.net.Socket?) = null
    override fun getServerAliases(keyType: String?, issuers: Array<out java.security.Principal>?) = null
}

// Pass customKeyManager instead of kmf.keyManagers:
sslContext.init(arrayOf(customKeyManager), tmf.trustManagers, null)
```

**Why `curl` works and Java doesn't:** BoringSSL (used by curl/openssl) walks the certificate chain when evaluating `CertificateRequest` issuers. Java's `SunX509`/`X509` KeyManager does not. This is a known Java limitation documented in JDK-6432825.

---

### Complete buildMtlsClient() incorporating all three fixes

```kotlin
private fun buildMtlsClient(): OkHttpClient {
    // Fix 1: Replace Android's stripped BC provider with the full standalone one
    Security.removeProvider(BouncyCastleProvider.PROVIDER_NAME)
    Security.insertProviderAt(BouncyCastleProvider(), 1)

    val rootCaPath = copyCertToFilesDir(ROOT_CA_FILE)
        ?: error("Root CA not found — push $ROOT_CA_FILE to app external files dir")
    val cf = CertificateFactory.getInstance("X.509")
    val rootCa = java.io.File(rootCaPath).inputStream().use { cf.generateCertificate(it) }
    val trustStore = KeyStore.getInstance(KeyStore.getDefaultType()).also {
        it.load(null, null); it.setCertificateEntry("visa-root-ca", rootCa)
    }
    val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    tmf.init(trustStore)
    val trustManager = tmf.trustManagers.filterIsInstance<X509TrustManager>().first()

    val posCertPath = copyCertToFilesDir(POS_CERT_FILE) ?: error("POS cert not found")
    val posKeyPath = copyCertToFilesDir(POS_KEY_FILE) ?: error("POS private key not found")
    val posCert = java.io.File(posCertPath).inputStream().use { cf.generateCertificate(it) }
    val privateKey = PEMParser(FileReader(posKeyPath)).use { parser ->
        val obj = parser.readObject()
        (obj as? PEMKeyPair)?.let {
            JcaPEMKeyConverter().setProvider(BouncyCastleProvider.PROVIDER_NAME).getKeyPair(it).private
        } ?: error("Unexpected PEM type: ${obj?.javaClass?.simpleName}")
    }
    val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).also {
        it.load(null, null); it.setKeyEntry("pos-client", privateKey, null, arrayOf(posCert))
    }

    // Fix 3: Custom X509KeyManager — bypasses issuer-DN matching
    val customKeyManager = object : X509KeyManager {
        override fun chooseClientAlias(keyType: Array<out String>?, issuers: Array<out java.security.Principal>?, socket: java.net.Socket?) = "pos-client"
        override fun getClientAliases(keyType: String?, issuers: Array<out java.security.Principal>?) = arrayOf("pos-client")
        override fun getCertificateChain(alias: String?) = keyStore.getCertificateChain("pos-client")?.filterIsInstance<java.security.cert.X509Certificate>()?.toTypedArray()
        override fun getPrivateKey(alias: String?) = keyStore.getKey("pos-client", null) as? java.security.PrivateKey
        override fun chooseServerAlias(keyType: String?, issuers: Array<out java.security.Principal>?, socket: java.net.Socket?) = null
        override fun getServerAliases(keyType: String?, issuers: Array<out java.security.Principal>?) = null
    }

    // Fix 2: Use Conscrypt explicitly — BC at position 1 would otherwise hijack SSLContext
    val sslContext = (runCatching { SSLContext.getInstance("TLS", "AndroidOpenSSL") }
        .recoverCatching { SSLContext.getInstance("TLS", "Conscrypt") }
        .getOrElse { SSLContext.getInstance("TLS") }).also {
        it.init(arrayOf(customKeyManager), tmf.trustManagers, null)
    }

    val hostnameVerifier = HostnameVerifier { _, session ->
        try {
            val cert = session.peerCertificates.firstOrNull() as? java.security.cert.X509Certificate ?: return@HostnameVerifier false
            val sans = cert.subjectAlternativeNames ?: return@HostnameVerifier false
            sans.any { san -> san.size >= 2 && san[1].toString().endsWith(".cybs.seclib.io") }
        } catch (e: Exception) { false }
    }

    val tls12Spec = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
        .tlsVersions(TlsVersion.TLS_1_2).build()

    return OkHttpClient.Builder()
        .sslSocketFactory(sslContext.socketFactory, trustManager)
        .hostnameVerifier(hostnameVerifier)
        .connectionSpecs(listOf(tls12Spec))
        .connectTimeout(WS_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(WS_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()
}
```

## WSS echo check — post-mTLS application-layer readiness {#si-wss-echo}

*Troubleshooting: WebSocket application-layer connectivity between POS and terminal after mTLS pairing*

The WSS echo check (Activity SI-2, Step 6 Layer 3) sends a `StatusRequest` over the live
WSS connection and expects a `TransactionStatusResponse`. A passing TLS handshake is a
necessary but not sufficient condition — the echo check verifies the AD app WebSocket
listener is fully initialised and the POS can exchange application messages.

**Appears in:** Gate SI-2 (Terminal Activation)

---

### WSS echo fails — connection refused or timeout despite TLS passing

| Symptom | Cause | Fix |
|---------|-------|-----|
| `openssl s_client` succeeds (`Verify return code: 0`) but WSS echo fails with `Connection refused` | Terminal server is accepting TLS but the AD app WebSocket listener has not started | Wait 5–10 seconds after "Device connected" appears on the terminal screen, then retry the echo |
| WSS echo times out (no message after 15 s) | AD app is in a transitional state (e.g., just finished activation) | Wait up to 30 s, then retry. If it persists, restart the AD app on the terminal (tap Connect Device again) |
| WSS echo times out only when using ADB port forwarding | ADB forward was established before the terminal server started — stale tunnel | Re-run: `adb -s $PAX_SERIAL forward tcp:8443 tcp:8443`, then retry the echo |

**Diagnosis — confirm the AD app is in "Device connected" state:**

```bash
# Check that the port is open (prerequisite for any WSS connection)
nc -zv ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} 2>&1

# Re-run WSS echo check immediately after (within 5 s of port open) — use whichever
# variant (Python or Node) was generated at Gate SI-2 based on runtime availability:
python3 wss_echo_check.py ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} \
  /path/to/pos-cert.pem /path/to/pos-key.pem /path/to/visa-root-ca.pem
# or: node wss_echo_check.mjs ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT} \
#       /path/to/pos-cert.pem /path/to/pos-key.pem /path/to/visa-root-ca.pem
```

If `nc` shows the port open but the echo still times out, the WebSocket upgrade is being
accepted at the OS level but the AD app is not dispatching messages. Restart the terminal
server from the terminal UI (tap Connect Device).

---

### WSS echo fails — WebSocket closed with code 1008 (policy violation)

| Symptom | Cause | Fix |
|---------|-------|-----|
| WSS connects, handshake completes, but immediately closes with code 1008 | POS certificate was not generated for this specific terminal's setup code | Re-run mTLS pairing (Activity SI-2, Step 4) using a fresh setup code from the terminal; store the new cert/key pair and retry |

The terminal validates that the POS certificate it issued matches the connecting client.
If you've replaced the cert/key files since pairing, or paired with a different terminal,
the WSS will be rejected at the application layer even though TLS succeeds.

---

### WSS echo returns `ErrorResponse`

| Symptom | Cause | Fix |
|---------|-------|-----|
| Echo check receives `{"type":"ErrorResponse","message":"..."}` | Terminal is connected but AD app rejected the `StatusRequest` | Check `developerDescription`. If "not supported" — the terminal firmware predates `StatusRequest`; use a `PaymentRequest` with a $0.01 amount as the echo instead (see note below) |
| `ErrorResponse` with "Terminal busy" | Previous transaction still active on the terminal | Wait for it to clear or restart the terminal server |

> **Fallback for older firmware:** If `StatusRequest` is not supported, the terminal will
> return an `ErrorResponse`. In that case, the WSS echo check still confirms application-layer
> connectivity — an `ErrorResponse` means the AD app is live and responding. Treat receipt of
> ANY message (including `ErrorResponse`) as a connectivity PASS, but log the error type so
> you can distinguish "app is alive" from "app is ready for transactions".

---

### WSS echo fails — TLS certificate / hostname errors

These are mTLS layer issues, not WSS application issues. See `troubleshooting.md#si-mtls`.

Common cases that look like echo failures but are actually mTLS failures:
- `ssl.SSLCertVerificationError` — Root CA not trusted
- `ssl.SSLError: certificate_unknown` — terminal doesn't trust the POS cert
- `websockets.exceptions.InvalidStatusCode: 503` — hostname mismatch caught at connect time

Fix the underlying TLS issue first, then re-run the echo.

---

## RKI (Remote Key Injection) {#si-rki}

*This is a **terminal-side operations issue**, not a POS code issue. No code change will fix it.*

### Transaction fails immediately — "RKI missing" / "Key not injected" / terminal declines all cards

**What RKI is:**
Remote Key Injection loads the encryption keys (DUKPT/AES) the terminal uses to encrypt
real card data during a transaction. Without keys injected, the terminal cannot process live
card payments — it will reject every transaction at the terminal before any response reaches
the POS.

**Symptoms:**
- Transaction request sent from POS, terminal receives it and launches the payment screen
- Terminal immediately fails with "RKI missing", "Key not injected", or similar
- `ErrorResponse` returned to POS (or terminal shows error without prompting for card)
- Test cards may work; real cards fail — or all cards fail

**Root cause:** The terminal has not had payment encryption keys loaded. This is a
provisioning step performed by the key management server (KMS), not by the POS developer.

**This is NOT caused by:**
- POS request format or fields
- mTLS certificate configuration
- Activation code or terminal activation
- Any code the POS developer writes

**Resolution — contact your Visa Acceptance onboarding contact:**

> RKI is provisioned by Visa Acceptance / the acquirer's key management infrastructure.
> The developer cannot inject keys themselves.

Steps to resolve:
1. Confirm the terminal serial number matches what is registered in the key management system
2. Contact your Visa Acceptance onboarding or support contact — request RKI provisioning for
   the terminal serial number
3. Once provisioned, the AD app will receive keys automatically over the network (no physical
   action needed on the terminal in most cases)
4. Verify by attempting a transaction again — if RKI is complete, the terminal will prompt
   for card tap/insert instead of failing immediately

**Test environment note:** In the test/sandbox environment, RKI may be pre-provisioned for
specific test terminal serials. If you are testing with a terminal that was not pre-provisioned,
request provisioning from your Visa Acceptance sandbox support contact.

---

## Transactions

*Troubleshooting: Semi-Integrated Transaction Errors (Sale, Refund, Pre-Auth, Tipping, Lookup, Cancel)*

Issues encountered during transaction processing via HTTPS (cloud mode) or WebSocket (local mode).

**Appears in:** Gate SI-3 (Sale), Gate SI-4 (Refund), Gate SI-5 (Pre-Auth), Gate SI-6 (Tipping), Gate SI-7 (Transaction Management)

---

### Common transaction errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| `ErrorResponse`: "Terminal not found" | Serial number doesn't match an activated terminal | Verify `SI_TERMINAL_SERIAL` matches the terminal's actual serial (Settings → About on terminal) |
| `ErrorResponse`: "Terminal is offline" | Terminal not in "Device connected" state | Check terminal screen — tap Connect Device if needed |
| HTTP 500 `An unexpected error occurred.` (cloud) | Sent a P12-signed RS256 JWT (or a `v-c-merchant-id` header) instead of a bearer token | Authenticate with the bearer token from `/login`; drop `v-c-merchant-id`. See `cloud-transaction-auth.md`. |
| `Declined - Invalid currency` (cloud) | Auth succeeded (it's a real `PaymentResponse`); the currency is not boarded for this terminal's merchant | Send a currency the merchant is boarded for |
| HTTP 401 Unauthorized (cloud) | Bearer token missing/expired, or wrong `id`/`secret` at `/login` | Re-run `/login` with correct Acceptance Devices merchant credentials and retry with the fresh token. See `cloud-transaction-auth.md`. |
| HTTP 403 Forbidden (cloud) | The terminal's merchant lacks permission for this terminal | Verify the terminal is activated under the correct merchant |
| Connection timeout (>180s) | Terminal is processing but POS gave up | DO NOT retry immediately. Use TransactionLookup by merchantReferenceCode to check if it went through. |
| WebSocket closed unexpectedly (local) | mTLS certificate expired or terminal restarted | Re-establish WebSocket connection. If mTLS, check certificate expiry. |
| `ErrorResponse`: "Transaction declined" | Issuer declined the card | Not an integration error — try a different card or amount |
| `ErrorResponse`: "Duplicate merchant reference code" | merchantReferenceCode was reused | Generate a new UUID for each transaction |
| HTTP 400 "The following property is either invalid or missing: merchant_postal_code" | Merchant profile in Business Center has no postal code in the address | Add a postal code to the merchant address in Business Center → Merchant Information → Address. No device re-activation is required for a merchant profile field change to take effect. |

---

### Sale-specific errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| Response has `captured: false` unexpectedly | Request included `"capture": false` (pre-auth mode) | Remove `capture: false` from the PaymentRequest for a standard sale |
| Amount in response differs from request | Tipping was enabled — tip added to total | Check `includedTipAmount` in response. If tipping is unwanted, disable it in Business Center (Customizations) |
| `ErrorResponse`: "Invalid amount" | Amount format incorrect (e.g., negative, zero, or wrong decimal format) | Amount must be positive decimal string (e.g., "25.00" not "25" or "$25.00") |
| `ErrorResponse`: "Invalid currency" | Currency code not recognized | Use ISO 4217 codes: USD, GBP, EUR, CAD, etc. (3 uppercase letters) |

---

### Refund-specific errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| `ErrorResponse`: "Transaction not found" (linked refund) | `transactionId` is invalid or transaction already fully refunded | Verify ID from original sale response. Check `refundableAmount` > 0. |
| Refund button disabled / no amount (Android UI) | UI stores `txState.originalTransactionId` (the ID of the txn being **amended** — null for a fresh sale) instead of `txState.transactionIdentifier` (the **completed** sale's own ID). | Store `txState.result.transactionIdentifier` when a captured `Finished` state arrives — not `txState.originalTransactionId`. |
| `ErrorResponse`: "Amount exceeds refundable amount" | Partial refunds already issued, remaining is less than requested | Check original transaction's current `refundableAmount` via lookup |
| Standalone credit declined | Merchant configuration restricts standalone credits | Contact payment processor. Some MIDs require explicit enablement for standalone credits. |
| Token refund fails with "Invalid instrument" | `instrumentId` expired or revoked | Tokens can expire. Verify via a transaction lookup or request a new token. |

---

### Pre-auth and capture errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| `tipAdjustStatus: "NOT_ADJUSTABLE"` in pre-auth response + `"Tip cannot be adjusted for this transaction"` on TipAdjust | Merchant DMS is configured with `TIPPING_TYPE=PERCENT_CHOICE` (on-device tipping) — the terminal captures tip during the transaction and does not support post-transaction adjustment | In Business Center → Acceptance Devices → Customizations, change Tipping Type to **On Receipt** to enable TipAdjust. Alternatively, use on-reader tipping (SI-6, `askForTip=ON_DEVICE`) which doesn't require TipAdjust. **This is a provisioning issue, not a code bug.** |
| `tipAdjustStatus: "NOT_ADJUSTABLE"` | Transaction already captured, voided, or expired | Cannot capture twice. If expired (>24h), must create a new pre-auth. |
| `ErrorResponse`: "Transaction not found" (TipAdjust) | Wrong transactionId or pre-auth expired | Verify ID. Pre-auths expire after 24h (issuer-dependent, some allow 5-7 days). |
| Capture amount declined | Amount exceeds authorized amount beyond issuer tolerance | Reduce capture amount to <= authorized amount. Some issuers allow ~20% overage for restaurants. |
| `captured: false` persists after TipAdjust | TipAdjust failed silently | Check response type — should be `TipAdjustResponse` with `tipAdjustStatus: "ADJUSTED"`. If ErrorResponse, fix the error and retry. |
| `"Class discriminator was missing"` / `"Invalid request"` on TipAdjust | `TipAdjustRequest` encoded as concrete type — kotlinx.serialization omits `"type"` field when static type is the concrete class, not the base `AcceptanceProtocolRequest` | Declare the request variable as `AcceptanceProtocolRequest`: `val req: AcceptanceProtocolRequest = TipAdjustRequest(...)` — then `json.encodeToString(req)` includes `"type":"TipAdjustRequest"`. |
| Pre-auth approved but app shows "declined" / goes directly to `Finished` | `TransactionFeature` only enters `AwaitingTipEntry` when `tipAdjustStatus=ADJUSTABLE`. If merchant returns `NOT_ADJUSTABLE`, the Capture button never appears. | Update the guard to also enter `AwaitingTipEntry` when `isCaptured=false` and `originalTransactionType=PRE_AUTHORIZATION`, regardless of `tipAdjustStatus`. See `troubleshooting.md#si-transactions`. |

---

### Tipping errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| Terminal doesn't show tip screen (on-reader) | Tipping not enabled in terminal configuration | Enable tipping in Business Center (Acceptance Devices → Customizations) |
| `askForTip` field ignored | Terminal firmware may not support tipping | Check terminal firmware version. Update if needed. |
| On-receipt: auth expires before capture | TipAdjust not sent within 24 hours | Implement expiry tracking and alerts for pending on-receipt transactions |

---

### Transaction management errors

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| Lookup returns "not found" for known transaction | Transaction still processing, or wrong idType | Wait and retry. Verify `idType` matches the identifier format (TRANSACTION_ID vs MERCHANT_REFERENCE_CODE). |
| Cancel has no effect | Transaction already completed between status update and cancel | Transaction completed faster than cancel was sent. This is normal — handle the PaymentResponse that arrived. |
| Duplicate charges after timeout | POS retried without doing lookup first | ALWAYS lookup by merchantReferenceCode before retrying. If found with APPROVED status, do not retry. |

---

### Cloud mode async response issues

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| Response never arrives (sync mode) | Connection dropped or terminal lost internet | Use TransactionLookup by merchantReferenceCode to check final status |
| Interaction ID returned but no final response | Async mode — must poll for completion | Use the interaction ID to poll for transaction events per async docs |

---

### First sale fails with HTTP 500 errorCode 6000 (Certified Master Configuration not found)

| Symptom | Cause | Fix |
|---------|-------|-----|
| First live transaction returns HTTP 500 errorCode 6000 "Server error"; terminal extended log shows: `NOT_FOUND: Certified Master Configuration not found for readerModel='PAX_A920', maxVersionRestriction='...', clearingInstitute='CYBERSOURCE' and country='XX'` | Merchant registered in a country (e.g. DE) that has no certified terminal configuration for the PAX_A920 + CYBERSOURCE combination in the test environment. Login, activation, and customisation all pass — this is the first step of session registration that fails. | Align the merchant's registered country to one that has a certified config (typically US for USD/CYBERSOURCE). Do this in Business Center → Merchant Information → Address. Re-activation is NOT required — just re-submit the transaction after updating the country. **Re-activating the terminal will NOT fix this** — it is a provisioning/country mismatch, not a terminal binding issue. |

**Notes:**
- The authoritative reason is in the terminal's **extended transaction log** (on-device), NOT in the cloud API 6000 response body. Direct the developer to check the on-device log.
- Country/currency mismatches (e.g. country=DE + currency=USD + processor=CYBERSOURCE) are a common cause. Use a US-registered merchant account for USD test transactions.

---

### Diagnostic checklist

When a transaction fails, check these in order:

1. **Terminal status:** Is the terminal showing "Device connected"?
2. **Authentication:** Cloud: is the bearer token valid (freshly minted from `/login`)? Local: is WebSocket connected with mTLS?
3. **Request format:** Is `type` field correct? Is amount a valid decimal string? Is currency a valid ISO code?
4. **Serial number (cloud):** Does it match the activated terminal exactly?
5. **Network:** Can the POS reach the endpoint? (`curl -s https://terminalstest.visaacceptance.com` for cloud)
6. **Timeout:** Is client timeout >= 180s? Shorter timeouts cause false failures.
7. **Idempotency:** Is merchantReferenceCode unique? Reuse causes rejection.
8. **Response parsing:** Are you handling all response types (PaymentResponse, ErrorResponse, TransactionStatusResponse)?

---

## validate-credentials.sh known bugs {#si-validate-credentials-bugs}

*Known implementation pitfalls in validate-credentials.sh that produce false failures or misleading output*

These bugs affect the script's own logic — they do not reflect actual credential or merchant problems.

| Bug | Symptom | Fix |
|-----|---------|-----|
| `date` command uses system locale | Non-English date (e.g. "Di., 04 Aug.") breaks HMAC signature → 401 | Use `LC_TIME=C date -u` |
| HTTP status extraction using `cut -d_ -f5` | Status never extracted; check logic never triggers | Use `grep -o 'HTTP_STATUS:[0-9]*' \| cut -d: -f2` |
| DMS customization path `/dms/v2/customization` | HTTP 400 invalidOrMissingFields | Correct path: `/dms/v2/merchants/{transactingMid}/customization` |
| DMS customization 404 counted as FAIL | False credential failure | Treat 404 on GET customization as SKIP, not FAIL — this endpoint may be PUT-only |
| 502 on `/pts/v2/payments` counted as failure | False negative for PAX SI merchants | 502 = auth passed, merchant not provisioned for CNP = expected outcome |
