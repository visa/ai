# Activity SI-2: Terminal Activation and Server Startup

Generate an activation code, enter it on the PAX terminal, configure security (TLS/mTLS), and start the terminal server so the POS system can connect.

**Official docs (fetch for API details):**
- [SI PAX Get Started](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-solution-pax-get-started-intro.md) — activation code generation, server startup
- [Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) — mTLS certificate exchange API

**Troubleshooting:** `troubleshooting.md#si-activation-codes`, `troubleshooting.md#si-mtls`

**HTTP auth reference:** `http-signature-auth.md` — MUST read before making any authenticated API call. Contains the exact signing string format and HMAC computation for bash/curl.

> **Locale note — `validate-credentials.sh` and any HMAC signing script:** The `validate-credentials.sh` generated at Step 0 (and any other script that constructs an HTTP Signature `Date:` header) must use `LC_TIME=C date -u`, not bare `date -u`. On systems with a non-English locale, `date -u` may produce a locale-specific month or day-of-week abbreviation (e.g. `lun.` instead of `Mon`). The resulting date string does not match the RFC 7231 format the HMAC is computed over, causing every signed request to return HTTP 401 even though the credentials are correct.

## Critical Rules (NEVER violate these)

1. **NEVER use an expired activation code.** Codes are valid for 24 hours only. If activation fails, generate a fresh code — do NOT retry an old one.
2. **NEVER skip mTLS pairing when the terminal security is set to mTLS.** The POS must complete the certificate exchange before the server can accept connections. Connecting without pairing will fail with a TLS handshake error.
3. **NEVER silently change the terminal security mode.** Switching between mTLS and TLS
   must always be done with explicit developer awareness and approval — never as a silent
   fallback. This applies in both directions:
   - Downgrading mTLS → TLS because pairing failed: **always explain why and ask first**
   - The temporary TLS-first pattern (switch to TLS to complete pairing, then back to mTLS)
     is a valid two-phase approach — but it must be presented as a clear plan to the
     developer before starting, not discovered silently mid-flow.
4. **NEVER share activation codes across terminals.** Each terminal requires its own unique activation code tied to the transacting MID.

## Prerequisites

1. **Activity SI-1 complete** — HTTP/WSS client and TLS dependencies are configured
2. **PAX terminal powered on** with the Acceptance Devices app installed
3. **Terminal on the network** — same LAN as POS (Local mode) or internet access (Cloud mode)
4. **Visa Acceptance merchant credentials** — REST shared secret key or REST certificate
5. **Transacting MID** — the merchant ID the terminal will process transactions under

## Workflow

Follow these steps in order. Each step depends on the previous.

---

### Step 1: Generate an Activation Code

Fetch the **SI PAX Get Started** page for the exact REST API endpoint and Business Center steps.

**Key facts (not always clear in docs):**
- API endpoint: `POST /dms/v2/merchants/{transacting_mid}/activation-codes?size=1`
- Response field `token` is the 8-character code (may include special chars like `%`, `!`, `@`)
- Response field `ttl` is time-to-live in milliseconds (~86,400,000 = 24 hours)
- Business Center path: Acceptance Devices → Activation Codes → select MID → Generate

**Generate codes just before use** to maximise the 24-hour window.

**Before making any API call — check endpoint reachability:**

```bash
curl -s --max-time 5 -o /dev/null -w "%{http_code}" \
  https://apitest.visaacceptance.com/up 2>/dev/null
```

- HTTP 200 → proceed normally.
- Timeout / non-200 → corporate network or VPN is blocking the endpoint.
  **Do NOT skip to Business Center yet.** First check if a USB-connected device can reach it:

  ```bash
  # Try Android POS device (if USB-connected)
  adb -s "$SI_POS_SERIAL" shell curl -s --max-time 5 \
    -o /dev/null -w "%{http_code}" https://apitest.visaacceptance.com/up 2>/dev/null

  # Try PAX terminal (if USB-connected via ADB)
  adb -s "$PAX_SERIAL" shell curl -s --max-time 5 \
    -o /dev/null -w "%{http_code}" https://apitest.visaacceptance.com/up 2>/dev/null
  ```

  If either device returns 200, run **all remaining API calls for this gate via `adb shell`**
  on that device — it has internet access that bypasses the Mac's VPN routing.
  See `troubleshooting.md#si-corporate-network` for the full pattern.

  If no USB device is available or reachable, present the developer with the options in
  `troubleshooting.md#si-corporate-network` (hotspot, jump server, lab VPN) and wait for
  their choice before proceeding.

---

### Step 2: Enter Activation Code on Terminal

1. Open the **Acceptance Devices app** on the PAX terminal
2. The app presents the **Device Activation** screen on first launch
3. Enter the code exactly as displayed (including special characters)
4. Tap **Continue**
5. Wait for confirmation: "Device activated successfully"

**If activation fails:** See `troubleshooting.md#si-activation-codes`

---

### Step 3: Configure Terminal Security

> **Pre-check: Verify the actual security setting in EBC2 before proceeding.**
>
> The developer stated `SI_SECURITY = <SI_SECURITY>` during configuration, but the
> terminal's actual setting in Business Center (EBC2) may differ — especially if the
> merchant account was previously configured, or if a different team member changed it.
> A mismatch causes unexpected behaviour (e.g., TLS handshake failures, certificate
> exchange errors, or the terminal accepting connections without a client cert when mTLS
> was expected).
>
> Run this before deciding what to do in Step 3:
>
> ```bash
> # GET the current terminal security setting from EBC2
> # (use the same HTTP Signature auth as any other API call — see http-signature-auth.md)
> curl -s "https://apitest.visaacceptance.com/dms/v2/customization?type=organization&id=<ORG_ID>" \
>   -H "v-c-merchant-id: <ORG_ID>" \
>   -H "Date: ..." \
>   -H "Signature: ..." \
>   | python3 -c "import sys,json; d=json.load(sys.stdin); print('SECURITY:', d.get('customizations',{}).get('SECURITY','NOT FOUND'))"
> ```
>
> | EBC2 setting | Developer said | Action |
> |---|---|---|
> | `MTLS` | mTLS | Proceed normally — settings match |
> | `TLS` | TLS | Proceed normally — settings match |
> | `MTLS` | TLS | Mismatch: EBC2 is mTLS but developer wants TLS. Confirm with developer, then PUT to change to TLS before proceeding |
> | `TLS` | mTLS | Mismatch: EBC2 is TLS but developer wants mTLS. Confirm with developer, then PUT to change to MTLS before proceeding |
>
> Use `AskUserQuestion` to inform the developer of any mismatch and agree on which setting
> to use before changing anything.

The terminal's security level (mTLS vs TLS) is configured via **Business Center** or the
**REST API** — NOT through a settings menu on the terminal itself.

#### Cloud Mode

**Important:** The terminal defaults to mTLS security and may show a "Generate Code to POS"
screen after activation. This is the local-mode mTLS pairing screen — it is NOT needed for
cloud mode. **You can safely ignore it.**

**What happens:** In cloud mode, the terminal establishes its outbound connection to the Visa
Acceptance backend independently in the background, regardless of the mTLS pairing screen.
After a short time (typically under a minute), the terminal will automatically transition to
"Device connected" without completing or dismissing the mTLS flow.

**Recommended action:**
1. If the terminal shows "Generate Code to POS" — **do nothing / leave it**
2. The terminal will connect to the cloud backend on its own
3. Wait for the screen to change to "Device connected"

**If the terminal does NOT auto-connect after ~2 minutes**, you can change the security
setting to TLS to remove the pairing requirement entirely:
- Via **Business Center**: Acceptance Devices → Customizations → Security → change to `TLS`
- Via **REST API**: `PUT /dms/v2/customization` with the correct body schema:
  ```json
  {
    "type": "organization",
    "id": "<ORG_ID>",
    "customizations": { "SECURITY": "TLS" }
  }
  ```
  Note: field key is `SECURITY` (uppercase), value is `"TLS"` (uppercase). The
  `localModeParameters` schema shown in some docs is incorrect and returns HTTP 400.
- Terminal may need a restart after the change

> **Why this works:** In cloud mode, the terminal connects outbound to the Visa Acceptance
> backend (not inbound from POS). The mTLS pairing screen is for the local-mode direct
> connection which cloud mode doesn't use. The cloud connection is established via a
> separate channel that doesn't depend on the local security setting.

---

#### Local Mode

Configure via Business Center (Acceptance Devices → Customizations) or the `PUT /dms/v2/customization` API.

**Correct API body schema** (the `localModeParameters` schema documented in some pages
returns HTTP 400 — use this instead):

```json
{
  "type": "organization",
  "id": "<ORG_ID>",
  "customizations": { "SECURITY": "MTLS" }
}
```

Replace `"MTLS"` with `"TLS"` to switch to TLS. Other customizable fields visible via
`GET /dms/v2/customization?type=organization&id=<ORG_ID>` — use the exact key names
returned by GET in the PUT `customizations` block.

| Setting | Options | Default | Recommendation |
|---------|---------|---------|----------------|
| Security | mTLS, TLS | mTLS | **mTLS** (two-way verification) |
| Port | 1024–65535 | 8443 | Keep default unless port conflict |
| Protocol | ADP | ADP | Keep default |

**If mTLS selected** → proceed to Step 4
**If TLS selected** → skip to Step 5

---

### Step 4: mTLS Certificate Pairing (Local Mode Only)

Fetch the **Local Mode Payment Services** page for exact API endpoints and response formats.

> ⚠️ **Certificate exchange requires an unauthenticated TLS connection to the terminal.**
> The certificate exchange API (`POST /dms/v2/devices/certificates`) is called from the POS
> *before* the POS has a client certificate — so the terminal must temporarily accept
> connections without requiring a client cert. If the terminal is already in mTLS mode
> when this call is made, it will reject the connection with a TLS handshake error (exit 35).
>
> **Two-phase approach — explain this to the developer before starting:**
>
> 1. Temporarily switch terminal to **TLS** (no client cert required)
>    ```json
>    PUT /dms/v2/customization
>    {"type":"organization","id":"<ORG_ID>","customizations":{"SECURITY":"TLS"}}
>    ```
> 2. Perform the certificate exchange (Steps 2–4 below) — this now succeeds
> 3. Switch the terminal back to **mTLS**
>    ```json
>    PUT /dms/v2/customization
>    {"type":"organization","id":"<ORG_ID>","customizations":{"SECURITY":"MTLS"}}
>    ```
> 4. **Refresh the terminal so it picks up the new mTLS security setting:**
>    On the terminal, navigate to the AD app menu → **POS Setup** → tap **Generate Code**.
>    This forces the terminal to reload its security configuration. The terminal will display
>    a new 8-character setup code — you do NOT need to use this code for anything; the
>    navigation itself triggers the config reload.
>    After the screen refreshes, proceed to Step 5 (Connect Device).
> 5. Now connect with mTLS using the freshly obtained POS certificate + key
>
> **Always confirm this plan with the developer before changing the security setting.**
> Use `AskUserQuestion`:
> - "To complete mTLS certificate pairing, the terminal must temporarily be set to TLS so
>   the certificate exchange API can connect without a client certificate. After the exchange,
>   we'll switch it back to mTLS and reconnect using the new certificates. Shall I proceed?"
>
> If the developer declines, escalate to `troubleshooting.md#si-mtls` — do not change
> the security setting without approval.

**Sequence (the flow that matters — docs have the API details):**

1. **Retrieve Root CA** — if not done in Activity SI-1 (API: `GET /dms/v2/devices/certificates/rootca` or download from Business Center → Activation Codes)
2. **Get setup code from terminal** — navigate to mTLS Setup screen; terminal displays 8-char code that refreshes every 300 seconds
3. **Request POS certificates** — call the certificates API with `posId` + `setupCode`; response returns RSA private key + certificate
4. **Store securely** — save private key and certificate outside source control, in
   `.si-certs/` (project root, git-ignored) with restrictive permissions (`chmod 600`).
   This is the path the workflow re-reads from later if certs need re-pushing to a device.
   After writing them, show:
   > **Files created:** `.si-certs/visa-root-ca.pem`, `.si-certs/pos-certificate.pem`,
   > `.si-certs/pos-private-key.pem` — mTLS credentials for this terminal (git-ignored,
   > contains a private key). Add `.si-certs/` to `.gitignore` if not already present.
5. **Deploy to Android POS device (PLATFORM=android only)** — the certificate files are now on the dev machine. The Android POS app connects directly to the PAX terminal over WiFi — the dev machine is NOT in the live connection path and cannot serve certificates at runtime. The files must be on the Android device itself.

   ```bash
   # Push to the app's scoped external directory — no READ_EXTERNAL_STORAGE permission needed
   PKG=<your.app.package.name>   # e.g. com.example.posapp
   DEST="/sdcard/Android/data/${PKG}/files"

   adb -s "$SI_POS_SERIAL" push /path/to/visa-root-ca.pem    "${DEST}/visa-root-ca.pem"
   adb -s "$SI_POS_SERIAL" push /path/to/pos-certificate.pem "${DEST}/pos-certificate.pem"
   adb -s "$SI_POS_SERIAL" push /path/to/pos-private-key.pem "${DEST}/pos-private-key.pem"

   # Verify all three are present and non-empty
   adb -s "$SI_POS_SERIAL" shell ls -la \
     "${DEST}/visa-root-ca.pem" "${DEST}/pos-certificate.pem" "${DEST}/pos-private-key.pem"
   ```

   > `$SI_POS_SERIAL` is the ADB serial of the Android POS device — NOT the PAX terminal (`$PAX_SERIAL`).

   The app's startup `copyCertToFilesDir()` helper (from Gate SI-1) copies these from
   `context.getExternalFilesDir(null)` (primary) or `/sdcard/` root (legacy fallback) to
   `context.filesDir`. The OkHttp SSLContext references the `context.filesDir` paths.

   > ⚠️ **If `SI_POS_SERIAL` is not set** (WiFi-only POS — no USB connection detected, or VPN/AP
   > isolation is blocking network access to the device):
   > **Ask the developer to connect the Android POS device via USB cable**, then re-run
   > `adb devices -l` to get its serial. Once the serial is known, the `adb push` above can run
   > automatically. USB bypasses all network/VPN restrictions and is always the preferred path.
   >
   > Only fall back to out-of-band transfer (shared folder, email, etc.) if USB is physically
   > impossible. If using out-of-band, place the files at
   > `/sdcard/Android/data/<packageId>/files/` (preferred) or `/sdcard/` root (legacy fallback).

   Do NOT continue to step 6 until the developer confirms all three files are on the device.

6. **Configure SAN hostname** — terminal cert uses SAN `{serial}.cybs.seclib.io`; see Act SI-1 Step 4 for platform-specific hostname validation strategy (Android cannot modify `/etc/hosts` — use OkHttp custom `HostnameVerifier` instead).

**Verification (from dev machine — confirms cert validity, NOT Android app connectivity):**

```bash
# This test runs from the dev machine. It confirms the TLS channel is functional
# but does NOT verify the Android app's cert loading or hostname verifier.
openssl s_client \
  -connect ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT} \
  -cert /path/to/pos-certificate.pem \
  -key /path/to/pos-private-key.pem \
  -CAfile /path/to/visa-root-ca.pem \
  </dev/null 2>&1 | grep -E "Verify return code|SSL handshake"
```

Expected: `Verify return code: 0 (ok)`

> **Android-specific:** a passing `openssl s_client` from the dev machine does NOT mean the
> Android app will connect successfully. The app uses the Java/OkHttp TLS stack with cert files
> read from `context.filesDir`. If the files were not pushed (step 5 above) or the
> `HostnameVerifier` is not configured (Act SI-1 Step 4), the Android connection will fail
> even though this test passes.

**If handshake fails:** See `troubleshooting.md#si-mtls`

---

### Step 5: Start the Terminal Server

1. On terminal, navigate to **Device Status** screen
2. Screen shows "Device is not connected"
3. Tap **Connect Device**
4. Wait for status: "Device connected"

The terminal is now listening for POS connections.

---

### Step 6: Verify End-to-End Connection

#### Local Mode

Run in three layers — TCP reachability, TLS handshake, then WebSocket application-layer
echo (the same three-layer breakdown used at Gate SI-3's pre-flight check and in
`troubleshooting.md#si-wss-echo`). All three must pass before reporting PASS.

**Layer 1 — TCP reachability**

```bash
nc -zv ${SI_TERMINAL_HOST} ${SI_TERMINAL_PORT}
```

Expected: `succeeded` / `open`. If refused or unreachable, see
`troubleshooting.md#si-wss-echo` before proceeding to Layer 2.

**Layer 2 — TLS handshake**

```bash
# TLS-only verification
openssl s_client -connect ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT} -showcerts </dev/null

# mTLS verification
openssl s_client \
  -connect ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT} \
  -cert /path/to/pos-certificate.pem \
  -key /path/to/pos-private-key.pem \
  -CAfile /path/to/visa-root-ca.pem \
  </dev/null
```

Expected: `Verify return code: 0 (ok)`. If this fails, see `troubleshooting.md#si-mtls`.

**Layer 3 — WebSocket application-layer echo (POS ↔ terminal readiness check)**

A successful TLS handshake confirms the transport but does NOT confirm:
- The terminal's AD app has fully initialised the WebSocket listener
- The POS and terminal can exchange application-layer messages
- The terminal is in the correct state to accept payment requests

After the TLS check passes, verify the full WebSocket stack by sending a lightweight
`StatusRequest` over the live WSS connection and confirming a `TransactionStatusResponse`
is returned. This requires a small script — a raw WebSocket handshake plus message framing
cannot be done reliably with `curl`/`openssl` alone, so unlike the credential checks in
`workflow.md` (which are pure `curl` and can run inline with no file), this check has no
scriptless option.

**Choosing which runtime to use — do not assume Python is available:**

1. **If `PLATFORM` (from SI-Q2) is `node` or `python`**, use the matching script below —
   the developer's POS platform already requires that runtime, so no new dependency is
   introduced.
2. **Otherwise (`PLATFORM` is `android` or `other`)**, detect what's actually on the dev
   machine before picking a script:
   ```bash
   command -v python3 >/dev/null 2>&1 && echo "python3: available" || echo "python3: NOT FOUND"
   command -v node    >/dev/null 2>&1 && echo "node: available"    || echo "node: NOT FOUND"
   ```
   Use whichever is available. If both are available, prefer whichever needs no new
   package install (check `python3 -c "import websockets"` / `node -e "require('ws')"`
   against what's already installed).
3. **If neither `python3` nor `node` is found**, this check cannot run. Tell the developer
   and ask them to install one before continuing — do not skip the check or silently fall
   back to TLS-only, since Layer 3 catches a real, common failure mode (AD app WebSocket
   listener not yet live) that Layers 1–2 cannot see. Use `AskUserQuestion`:
   > Neither `python3` nor `node` was found on this machine — the WebSocket application-layer
   > check needs one of them (there's no way to do this with `curl`/`openssl` alone). Please
   > install Python 3 or Node.js, then let me know when it's ready to retry.

**Before writing either script to disk, show its full contents in the chat reply** — same
rule as any other generated script in this skill: nothing runs unseen.

**Python (run directly from the dev machine — no POS code needed):**

Before writing this file, confirm the `websockets` package is actually importable — do not
assume `pip install` will succeed or is even needed:

```bash
python3 -c "import websockets" 2>/dev/null && echo "websockets: available" || echo "websockets: NOT FOUND — needs: pip install websockets"
```

If not found, ask the developer before running any `pip install` — installing a package is
a change to their environment, not just a diagnostic:

> The `websockets` package isn't installed. I can run `pip install websockets` to add it,
> or you can switch to the Node.js version instead if you'd rather not install a new Python
> package. Which do you prefer?

```python
# wss_echo_check.py  — run with: python3 wss_echo_check.py
import ssl, json, asyncio, sys
import websockets  # pip install websockets

HOST = sys.argv[1] if len(sys.argv) > 1 else "SI_TERMINAL_HOST"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8443
CERT = sys.argv[3] if len(sys.argv) > 3 else "/path/to/pos-certificate.pem"
KEY  = sys.argv[4] if len(sys.argv) > 4 else "/path/to/pos-private-key.pem"
CA   = sys.argv[5] if len(sys.argv) > 5 else "/path/to/visa-root-ca.pem"

async def check():
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.load_verify_locations(CA)
    ctx.load_cert_chain(certfile=CERT, keyfile=KEY)
    # If using /etc/hosts SAN mapping, hostname is already correct.
    # Otherwise set ctx.check_hostname = False for dev-only IP connections.

    uri = f"wss://{HOST}:{PORT}/"
    try:
        async with websockets.connect(uri, ssl=ctx, open_timeout=10) as ws:
            req = json.dumps({"type": "StatusRequest"})
            await ws.send(req)
            resp = await asyncio.wait_for(ws.recv(), timeout=15)
            data = json.loads(resp)
            t = data.get("type", "unknown")
            print(f"PASS — terminal responded with type={t}")
            if t == "TransactionStatusResponse":
                print(f"  Terminal message: {data.get('message', '<none>')}")
            elif t == "ErrorResponse":
                print(f"  WARNING: ErrorResponse — {data.get('message')}")
            sys.exit(0)
    except Exception as e:
        print(f"FAIL — {type(e).__name__}: {e}")
        sys.exit(1)

asyncio.run(check())
```

**Node.js alternative:**

Same check before writing this file — confirm `ws` is importable, and ask before installing:

```bash
node -e "require('ws')" 2>/dev/null && echo "ws: available" || echo "ws: NOT FOUND — needs: npm install ws"
```

If not found, ask the developer before running `npm install ws` (same reasoning as the
Python package above — it's an environment change, not just a diagnostic).

```js
// wss_echo_check.mjs  — node wss_echo_check.mjs HOST PORT CERT KEY CA
import WebSocket from 'ws';   // npm install ws
import fs from 'fs';
const [,, HOST='SI_TERMINAL_HOST', PORT='8443', CERT, KEY, CA] = process.argv;
const ws = new WebSocket(`wss://${HOST}:${PORT}/`, {
  cert: fs.readFileSync(CERT), key: fs.readFileSync(KEY), ca: fs.readFileSync(CA),
  rejectUnauthorized: true,
});
ws.on('open', () => ws.send(JSON.stringify({ type: 'StatusRequest' })));
ws.on('message', d => {
  const r = JSON.parse(d);
  console.log(`PASS — type=${r.type} message=${r.message ?? ''}`);
  ws.close(); process.exit(0);
});
ws.on('error', e => { console.error('FAIL —', e.message); process.exit(1); });
setTimeout(() => { console.error('FAIL — timeout'); process.exit(1); }, 20000);
```

**Interpreting results:**

| Response | Meaning | Action |
|----------|---------|--------|
| `TransactionStatusResponse` with any `message` | Terminal WebSocket layer is live and the AD app is responding. **PASS** — proceed to Gate SI-3. | None |
| `ErrorResponse` | WS connected but AD app returned an error. Check `message` and `developerDescription`. | See `troubleshooting.md#si-wss-echo` |
| Connection refused / timeout | Terminal server is not accepting WSS connections. TLS passed but app layer failed. | See `troubleshooting.md#si-wss-echo` |
| TLS error (certificate / hostname) | mTLS setup has an issue. | See `troubleshooting.md#si-mtls` |

> **Why `StatusRequest`?** It is the lightest transaction-type message the terminal understands
> — it returns the terminal's current state without initiating or reserving anything on the
> payment processor. It is safe to call at any time with no side effects.

#### Cloud Mode

Fetch the **Cloud Mode Payment Services** page for the exact transaction request format. For authentication, use the **bearer token from `/login`** (exchange `SI_AD_LOGIN_ID`/`SI_AD_LOGIN_SECRET` from `si-credentials.env` → `{token}`), NOT the docs' JWT/P12 construction — see `cloud-transaction-auth.md`. Verify the terminal is reachable via the backend.

> **WARNING — curl harness vs app payload:** Any standalone curl transaction harness (e.g. `run-cloud-transaction.sh` or any ad-hoc curl example used to probe the cloud endpoint) must include the `type` discriminator field in every request body (see act_SI_01 — JSON serialization trap). Without it, the curl harness returns HTTP 400/500 while the app — which has the fix applied — succeeds. This is a false negative: a failing curl probe does NOT mean the integration is broken; it means the harness is missing the discriminator field. The app is the source of truth for transaction correctness. If you emit a standalone curl harness, either generate it from the same serialized payload structure the app uses, or prepend a banner to the script:
>
> ```
> # WARNING — THIS IS A CONNECTIVITY/AUTH PROBE ONLY.
> # THE APP IS THE SOURCE OF TRUTH FOR TRANSACTION CORRECTNESS.
> # This harness may omit type discriminators present in the app payload.
> # A 400/500 here does NOT indicate a bug in the app.
> ```

## Troubleshooting

- **Activation code rejected:** See `troubleshooting.md#si-activation-codes`
- **TLS/mTLS handshake failures:** See `troubleshooting.md#si-mtls`
- **Network unreachable:** See `troubleshooting.md#si-mtls` (network connectivity section)

## Acceptance Criteria

1. Activation code generated successfully (via API or Business Center)
2. Terminal activated — confirmation message displayed on terminal
3. Terminal security configured (mTLS or TLS as chosen)
4. For mTLS mode:
   - Root CA certificate retrieved and stored in POS trust store
   - POS certificate and private key obtained via setup code exchange
   - Credentials stored securely outside source control
   - SAN hostname configured (or alternative validation strategy)
   - `openssl s_client` mTLS handshake succeeds with `Verify return code: 0 (ok)`
5. Terminal server started — status shows "Device connected"
6. End-to-end connectivity verified:
   - Local mode (Layers 1–2): TCP reachability + TLS/mTLS handshake succeed (`Verify return code: 0`)
   - Local mode (Layer 3): WSS echo check returns a `TransactionStatusResponse` — confirms the AD app WebSocket listener is live and the POS can exchange application messages with the terminal
   - Cloud mode: HTTPS request to backend reaches the terminal

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate SI-2 of the Semi-Integrated solution: Terminal activation and server startup.

Working directory: <project root>

## Inputs

SI_MODE=<SI_MODE>
SI_CONN_METHOD=<SI_CONN_METHOD>          # usb | wifi — determines IP discovery method
PAX_SERIAL=<PAX_SERIAL>                  # set for USB mode; empty for WiFi mode
SI_POS_SERIAL=<SI_POS_SERIAL>            # Android POS ADB serial; may be empty
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>  # cloud mode only
SI_SECURITY=<SI_SECURITY>
CREDENTIAL_METHOD=<CREDENTIAL_METHOD>

# SI_TERMINAL_HOST, SI_TERMINAL_PORT, SI_ADB_FORWARDING are NOT inputs.
# Discover and set them after Step 5 (server start) — see workflow.md Gate SI-2.

## Credentials — read from file, never ask the developer to paste them

`ORG_ID` and `TRANSACTING_MID` are NOT injected as literal values above. Read them
directly from `si-credentials.env` in the project root before making any API call:

  source ./si-credentials.env

This keeps merchant identifiers out of the prompt text and any transcript/log of this
session. Never ask the developer to type or paste `ORG_ID`, `TRANSACTING_MID`, `KEY_ID`,
or `SECRET_KEY` into chat — if a value is missing or wrong, tell the developer which field
in `si-credentials.env` to check, and let them edit the file directly.

## Reference docs — fetch these for API details

- Get Started: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-solution-pax-get-started-intro.md
- Local Mode: https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md

Read these files before starting:
1. `project-plan.md` (in the project root) — contains project context and SI configuration
2. `si-credentials.env` (in the project root) — `ORG_ID`, `TRANSACTING_MID`, and (if
   `CREDENTIAL_METHOD = shared_secret`) `KEY_ID`/`SECRET_KEY` for DMS auth. If
   `SI_MODE = cloud`, also `SI_AD_LOGIN_ID`/`SI_AD_LOGIN_SECRET` — the separate Acceptance
   Devices login pair used for the transaction bearer token (see `cloud-transaction-auth.md`),
   NOT the DMS credentials above.
3. `activities/act_SI_02_terminal-activation.md` — the activity definition (this file)
4. `http-signature-auth.md` — HTTP Signature authentication reference (REQUIRED for API calls)

## Your task

Guide the developer through terminal activation and server startup.
Fetch the official docs pages above for exact API endpoints, request/response formats.
The activity file provides: critical rules, step sequencing, verification commands,
and acceptance criteria. The official docs provide: API details.

This activity is INTERACTIVE — it requires physical actions on the terminal and
real-time API calls. Your role is to:

1. Generate the activation code (or guide Business Center steps)
2. Instruct the developer to enter it on the terminal
3. Guide security configuration
4. If mTLS: execute the certificate exchange API calls
5. Instruct the developer to start the server
6. Verify end-to-end connectivity

Credential method: <CREDENTIAL_METHOD> (shared_secret | certificate)
Use this for all API authentication headers.

## Interactive checkpoints

After each physical terminal step, ask the developer to confirm before proceeding:
- "Have you entered the activation code? Did the terminal show success?"
- For cloud mode: "The terminal may show a 'Generate Code to POS' screen — this is the mTLS pairing screen which is NOT needed for cloud mode. Ignore it and wait ~1 minute — the terminal will auto-connect to the cloud backend in the background. Has the screen changed to 'Device connected'?"
- For local mode with mTLS: "Have you configured the security setting to mTLS (via Business Center → Customizations)?"
- For local mode with mTLS: "Is the setup code visible on the terminal screen? What is it?"
- "Have you tapped Connect Device? Does it show 'Device connected'?"

## Mandatory verification

After the server is running, verify connectivity in three layers (local mode — see Step 6):

1. **TCP + TLS layers (1–2)** — `nc`/`openssl s_client` confirm reachability and that the
   mTLS handshake returns `Verify return code: 0 (ok)`
2. **Application layer (3)** — the WSS echo check (Step 6, Layer 3) confirms the AD app
   WebSocket listener responds with a `TransactionStatusResponse`

For cloud mode: verify terminal reachability (if possible without live transaction).

Do NOT report PASS until both layers confirm for local mode. The TLS handshake alone is NOT sufficient — the WSS echo confirms the AD app is live and ready to accept payment requests.

## Mandatory Android readiness check (PLATFORM=android, local mode mTLS)

After TLS + WSS echo pass, there is one more required step before reporting PASS:

**The cert files and APK must be confirmed on the Android POS device.** This step is blocking —
do not skip it and do not report PASS without confirmation.

1. If `SI_POS_SERIAL` is empty: ask the developer to connect the Android POS device via USB and
   provide its ADB serial (`adb devices -l`). Store it.
2. Push cert files to the device (Step 4.5 above).
3. Install the APK if Gate SI-1 could not (empty `SI_POS_SERIAL` at the time):
   ```bash
   ./gradlew assembleDebug
   adb -s "$SI_POS_SERIAL" install -r app/build/outputs/apk/debug/app-debug.apk
   ```
4. Ask the developer to launch the app and confirm no crash on startup (cert loading error would
   appear here as a `FileNotFoundException` or `SSLException`).

**Why the openssl test is not enough:** the TLS handshake test runs from the dev machine using the
cert files on disk. The Android app uses an entirely separate code path — Java `KeyStore` loading
cert files from `context.filesDir`. An openssl PASS means the cert/key pair is valid; it does NOT
mean the Android device has the files or that the `KeyStore` is configured correctly.

## Required report

```
GATE SI-2 REPORT
Status: PASS | FAIL
Mode: LOCAL | CLOUD
Security: mTLS | TLS
Activation method: API | Business Center
Terminal activated: YES | NO
mTLS pairing complete: YES | NO | N/A
Server started: YES | NO
TLS handshake verified: YES | NO | N/A (cloud)
WSS echo check: PASS | FAIL | N/A (cloud) — TransactionStatusResponse received: YES | NO
Android POS cert files deployed: YES | NO | N/A (non-Android or cloud)
Android APK installed on POS device: YES | NO | N/A (non-Android or cloud)
Android app launches without crash: YES | NO | N/A
POS device ADB serial (SI_POS_SERIAL): <serial> | NOT YET KNOWN
Issues encountered: <list or none>
Acceptance criteria met: <list>
```
```
