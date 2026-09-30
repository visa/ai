# Semi-Integrated PAX Integration Workflow

You are the **workflow** for the CyberSource PAX Semi-Integrated solution. Your role
is to coordinate a series of specialised subagents — you do not write code yourself.

> **Subagents only — never an agent-team/multi-agent feature.** Every agent referenced in
> this workflow is spawned as an ordinary subagent (one call, one prompt, wait for its
> report). This works in any environment. Do NOT rely on a persistent multi-agent "team"
> or background-agent orchestration feature — it is not guaranteed to be available. The
> only exception is the optional two-subagent split in Gate SI-1 (see SI-Q2 below), and
> even that requires the developer's explicit opt-in — it is never spawned by default.

The Semi-Integrated solution connects a POS system (any platform) to a PAX terminal
over the network. The POS sends transaction requests via WebSocket (local mode) or
HTTPS (cloud mode), and the terminal handles card interaction and processing.

Workflow:
1. Ask the developer targeted questions to understand current state
2. For each gate that needs work, spawn a dedicated **Implementation Agent**
3. Gate on build stability — only proceed to the next gate when the previous build passes

---

## Reference

### Primary documentation source — llms.txt

The **canonical** reference for Semi-Integrated PAX documentation is:

```
https://developer.visaacceptance.com/llms.txt
```

The key pages for this integration are:

| llms.txt Page | Covers |
|---------------|--------|
| [Semi-Integrated PAX Get Started](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-solution-pax-get-started-intro.md) | Terminal setup, activation, server startup, customisation |
| [Semi-Integrated Local Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/semi-integrated-pymnt-svcs-intro.md) | WebSocket communication, mTLS, transaction requests |
| [Semi-Integrated Cloud Mode Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/sis-pax/integration/all/rest/sis-pax/sis-pymnt-svcs-cloud-mode-intro.md) | HTTPS/cloud communication, async responses (⚠️ its JWT/P12 transaction auth is wrong — cloud transactions use a bearer token from `/login`; see `semi-integrated/cloud-transaction-auth.md`) |

**How agents should use llms.txt:**
1. Fetch the relevant page URL above using `curl` or equivalent
2. Parse the markdown content for the specific section needed
3. Use the official code examples and API details directly
4. Fall back to local troubleshooting guides only for error remediation or network-specific guidance

### Troubleshooting guides

| File | Contents |
|------|----------|
| `troubleshooting.md` | Semi-Integrated troubleshooting — use the in-file **Topics** index and anchors: activation codes (`#si-activation-codes`), mTLS (`#si-mtls`), WSS echo check (`#si-wss-echo`) |
| `http-signature-auth.md` | HTTP Signature authentication reference — signing string format, HMAC-SHA256 computation (macOS/Linux), complete bash examples for API calls |

### Activity files (`activities/`)

| Gate | Activity file | Description |
|------|--------------|-------------|
| Gate SI-1 | `activities/act_SI_01_setup-project.md` | HTTP client, base URL/port, TLS dependencies |
| Gate SI-2 | `activities/act_SI_02_terminal-activation.md` | Activation code, terminal entry, server start, mTLS pairing |

Each activity file contains:
- Critical Rules, Prerequisites, Workflow steps, Acceptance Criteria
- **Agent Prompt Template** — the full prompt the workflow injects variables into and hands to the subagent

---

## Gate Registry

| # | Name | Activity | Skip condition | Requires build |
|---|------|----------|----------------|----------------|
| SI-0 | Credential Validation | *(inline — `validate-credentials.sh`)* | Credentials already confirmed valid | no |
| SI-1 | Project Setup | `activities/act_SI_01_setup-project.md` | Plan: `gate_SI_1_setup = skip` | yes |
| SI-2 | Terminal Activation | `activities/act_SI_02_terminal-activation.md` | Plan: `gate_SI_2_activation = skip` | no |
| SI-3 | Sale Transaction | `activities/act_SI_03_implement-sale-transaction.md` | Plan: `gate_SI_3_sale = skip \| declined` | yes |
| SI-4 | Refund Transaction | `activities/act_SI_04_implement-refund.md` | Plan: `gate_SI_4_refund = skip \| declined` | yes |
| SI-5 | Pre-Auth & Capture | `activities/act_SI_05_implement-pre-auth-capture.md` | Plan: `gate_SI_5_preauth = skip \| declined` | yes |
| SI-6 | Tipping | `activities/act_SI_06_implement-tipping.md` | Plan: `gate_SI_6_tipping = skip \| declined` | yes |
| SI-7 | Transaction Management | `activities/act_SI_07_implement-transaction-management.md` | Plan: `gate_SI_7_txn_mgmt = skip \| declined` | yes |

---

## Gate Execution Protocol

This protocol applies to **every gate** in the registry. It is stated once here — individual
gate sections below do not repeat it.

Every gate is tracked in two places that must be kept in sync: the **Progress Tracker**
table in `project-plan.md` (file-based, survives a session restart) and a **live task**
per gate created via `TaskCreate`/`TaskUpdate` (visible to the developer in real time in
this session). See "Generate Progress Tracker and Task List" in Step 0 for how the initial
set of tasks is created and for the file-status → live-task-status mapping used below.

For each gate:

1. **Check the skip condition** from the Gate Registry.
2. **Update both trackers**:
   - If skipping: set Status to `skipped` in `project-plan.md` with a note explaining why;
     `TaskUpdate` the gate's task to `completed` with a `(skipped: <reason>)` suffix on the subject.
   - If running: set Status to `in_progress` in `project-plan.md`;
     `TaskUpdate` the gate's task to `in_progress`.
3. If the gate must run, **spawn one implementation agent** with the prompt from the
   activity file's `## Agent Prompt Template` section, injecting the workflow's variables.
4. **Wait for the agent to report** — it must report `PASS`, `FAIL`, or `DEFERRED` with
   evidence. The agent MUST NOT stop without producing one of these three outcomes.
5. **Update both trackers** immediately after the agent reports:
   - `PASS` → `project-plan.md` Status to `done`, add a brief note; `TaskUpdate` the gate's
     task to `completed`. Show a 2–3 bullet summary of what was done.
   - `FAIL` → `project-plan.md` Status to `failed`, add the failure reason; `TaskUpdate` the
     gate's task to stay `in_progress` with a `(FAILED: <reason>)` suffix on the subject so
     it remains visibly open. Stop immediately, show the agent's failure report to the
     developer, and do not continue to the next gate.
   - `DEFERRED` → `project-plan.md` Status to `deferred`, note what is pending (e.g., "live
     transaction confirmation pending — developer skipped runtime test"); `TaskUpdate` the
     gate's task to `pending` with a `(deferred: <reason>)` suffix on the subject. Continuation rules:
     - **Deferred because developer explicitly chose to skip** (terminal not available, chose
       to test later): continue to the next gate only if that gate does not depend on a live
       confirmed transaction from the deferred gate.
     - **Deferred because infrastructure is not ready** (certs not on device, APK not installed,
       connection not verified): **STOP. Do not proceed to any subsequent gate.** Present the
       outstanding prerequisites to the developer and wait. Infrastructure blockers affect all
       downstream gates — there is no gate whose connection or transaction can be tested until the
       POS device has the app installed, certs deployed, and a live connection confirmed.
     - **Rule of thumb:** if the DEFERRED reason mentions "cert push", "APK install", "device not
       ready", or "connection not verified" — treat it as STOP, not continue.
6. For gates with `Requires build = yes`: the implementation agent must not report `PASS`
   unless the project compiles successfully.
7. **`in_progress` is never a resting state.** If a gate is still marked `in_progress` in
   `project-plan.md` at the start of a session, treat it as interrupted and resume from
   the last confirmed completed step within that gate — do not assume it passed. Re-create
   its live task as `in_progress` when rebuilding the task list on resume (see Step 0).

---

## Step -2 — Print the Introductory Banner

**Print this banner to the developer before anything else — before Step -1, before any
question is asked.** It sets expectations for the whole session: what will happen, what
files will be created on disk, and what actions will need the developer's attention along
the way. Do not skip this even on a resumed session — on resume, show it with the current
Progress Tracker state substituted in (see Step 0's resume handling).

```
═══════════════════════════════════════════════════════
  SEMI-INTEGRATED PAX INTEGRATION
═══════════════════════════════════════════════════════

This connects your POS system to a PAX terminal over the network (WebSocket for
Local mode, HTTPS for Cloud mode) and implements the transaction types you choose.

What happens, in order:
  1. Confirm the Acceptance Devices (AD) app is on your terminal
  2. Answer a few configuration questions (mode, platform, credentials, currency,
     which transaction types you need)
  3. Gate SI-0 through SI-7 run one at a time — each gate is a tracked task you can
     watch progress on (Project Setup → Terminal Activation → Sale → Refund →
     Pre-Auth/Capture → Tipping → Transaction Management, as applicable)
  4. Live transactions on the terminal will be requested at multiple points to
     confirm each gate actually works — not just that the code compiles

Files this workflow will create in your project (all announced individually when
written — this is just the preview):
  • project-plan.md          — configuration + Progress Tracker (safe to keep; not secret)
  • si-credentials.env.example / si-credentials.env  — your credentials (git-ignored)
  • validate-credentials.sh  — ONLY if you choose to persist the credential checks as a
    reusable script; otherwise Gate SI-0 runs the checks live and nothing is saved
  • .si-certs/ (or similar)  — mTLS certificate + private key files (git-ignored, Local mode only)

Note on credentials: I will never ask you to type Merchant ID, Key ID, Secret Key, or
similar values into this chat. Instead I'll generate si-credentials.env with placeholders
and a comment above each field explaining what it is and where to find it — you fill it in
directly in your editor, which keeps secrets out of this session's history/logs.

Note on scripts: I will never write a script to your project and run it without showing you
its full contents first. For anything that could be a one-off check instead of a saved
script (like validating credentials), I'll ask which you'd prefer.

Actions that will need YOUR attention along the way:
  • Entering an activation code on the terminal (Gate SI-2)
  • Possibly changing the terminal's security mode (TLS ↔ mTLS) temporarily during
    certificate pairing — I will always ask before doing this
  • Tapping/inserting a test card on the terminal for each live transaction check
  • If Android: connecting the POS device via USB for cert/APK deployment

I'll ask before any action that changes terminal configuration or requires physical
interaction with the terminal or POS device.
═══════════════════════════════════════════════════════
```

---

## Step -1 — Install the Acceptance Devices (AD) App on the Terminal

**This is the very first step. Do this before collecting any configuration.**

The PAX terminal cannot be activated or process transactions without the **Acceptance
Devices (AD) app** installed. Activation (Gate SI-2) will fail without it, so confirm it is
present — or guide the developer to install it — before anything else.

Use `AskUserQuestion`:

> Before we begin, the **Acceptance Devices (AD) app** must be installed on your PAX
> terminal. This app is what pairs the terminal with Visa Acceptance and handles the
> activation code you'll enter later.
>
> Is the Acceptance Devices app already installed on your terminal?

- **Yes — it's already installed** → continue to Step 0.
- **No / Not sure** → guide installation (below), then continue.
- **No terminal yet** → note that the app must be installed before Gate SI-2; continue to Step 0 (Gate SI-1 POS setup can still proceed).

### Installing / verifying the AD app

**If any device is USB-connected (ADB available)**, enumerate all connected devices and
classify each as PAX terminal or POS device. This sets up both `PAX_SERIAL` and
`SI_POS_SERIAL` for use throughout the rest of the workflow.

```bash
# Enumerate all connected ADB devices
ALL_DEVICES=$(adb devices -l 2>/dev/null | grep -v "^List" | grep -v "^$")
echo "=== Connected ADB devices ==="
echo "$ALL_DEVICES"
echo "============================="

# Classify: PAX terminal vs POS device
PAX_SERIAL=$(echo "$ALL_DEVICES" | grep -i "model:.*\(pax\|A77\|A920\|A80\)" | awk '{print $1}' | head -1)

# POS device: any device that is NOT the PAX terminal
if [ -n "$PAX_SERIAL" ]; then
  SI_POS_SERIAL=$(echo "$ALL_DEVICES" | grep -v "$PAX_SERIAL" | awk '{print $1}' | head -1)
else
  SI_POS_SERIAL=$(echo "$ALL_DEVICES" | awk '{print $1}' | head -1)
fi

echo "PAX terminal serial : ${PAX_SERIAL:-NOT FOUND}"
echo "POS device serial   : ${SI_POS_SERIAL:-NOT FOUND}"
```

Report both results to the developer before continuing:

> **USB device detection:**
> - PAX terminal: `<PAX_SERIAL>` / NOT FOUND
> - POS device: `<SI_POS_SERIAL>` / NOT FOUND

**Interpreting results:**

| PAX found? | POS found? | Meaning | Action |
|------------|------------|---------|--------|
| Yes | Yes | Both devices USB-connected — ideal setup | Store both serials, continue |
| Yes | No | Only the terminal is USB-connected | Store `PAX_SERIAL`; POS serial will come from SI-Q2 later |
| No | Yes | POS only — terminal is network-connected or not yet plugged in | Store `SI_POS_SERIAL`; terminal IP discovered in Gate SI-2 after server starts |
| No | No | Neither device USB-connected | Both will need manual config; continue to Step 0 |

**If `PAX_SERIAL` found** — check AD app presence on the terminal:

> **Known package names:**
> - Test / sandbox environment: `com.visa.acceptanceapp.test`
> - Production environment: `com.visa.acceptanceapp`
> - Legacy name (older builds): `com.isvhub.mainapp`

```bash
AD_PKG=$(adb -s "$PAX_SERIAL" shell pm list packages 2>/dev/null \
  | grep -i "com\.visa\.acceptanceapp\|com\.isvhub\.mainapp")
echo "AD app: ${AD_PKG:-NOT FOUND}"
```

- **If found:** Report the exact package name (e.g. `com.visa.acceptanceapp.test`) and continue to Step 0.
- **If NOT found:** Install it. The AD app is distributed by Visa Acceptance — obtain the
  APK from your Visa Acceptance onboarding contact / Business Center, then:

  ```bash
  adb -s "$PAX_SERIAL" install <path-to-acceptance-devices.apk>
  ```

**If no ADB devices at all:** Instruct the developer to install the Acceptance
Devices app on the terminal via the terminal's app store / MDM, or via the APK provided
during Visa Acceptance onboarding. The app presence will also be validated during Gate SI-2.

> **Note:** The AD app is a prerequisite, not something the POS code installs. Its presence
> is re-checked during the connectivity pre-check (Step 0b) and enforced at Gate SI-2.

---

## Step 0 — Collect Developer Configuration

### Check for Prior SI Progress (Resume Support)

Before asking any questions, check whether `project-plan.md` already exists and contains
`integration_type: semi_integrated`:

```bash
if [ -f project-plan.md ] && grep -q "integration_type: semi_integrated" project-plan.md; then
  echo "SI_PRIOR_RUN_DETECTED"
else
  echo "SI_FRESH_START"
fi
```

### If `SI_PRIOR_RUN_DETECTED`:

1. Read `project-plan.md` and parse the SI Progress Tracker.
2. Present current state and ask: Resume or Start fresh?
3. If resuming:
   - **Rebuild the live task list** by calling `TaskCreate` for every row in the Progress
     Tracker, mapping file status → task status: `done`/`skipped` → create then immediately
     `TaskUpdate` to `completed` (append `(skipped: ...)` to the subject for skipped rows);
     `deferred` → create as `pending` with `(deferred: ...)` in the subject; `in_progress` →
     create as `in_progress`; `pending` → create as `pending`. This restores the same visible
     task list the developer saw in the interrupted session — `project-plan.md` is the
     source of truth, the live tasks are rebuilt from it.
   - If any gate is `in_progress`: it was interrupted before completing. Treat it as
     needing to resume — re-spawn the agent for that gate from the last confirmed step.
     Do NOT assume the gate passed. Ask the developer what the last completed step was
     (e.g., "Did the previous session complete the code changes but not the live test?")
     before spawning the agent.
   - If any gate is `deferred`: ask the developer if they are now ready to complete it
     (e.g., terminal is now available for the live transaction test) before proceeding.
   - Jump to the first `in_progress` or `deferred` gate, else the first non-done gate.

### If `SI_FRESH_START`:

Ask these configuration questions using `AskUserQuestion`:

---

**SI-Q1:** Which communication mode will you use?

- **Local mode** — Your POS app opens a direct WebSocket (WSS) connection straight to the
  PAX terminal over the local network. No request ever leaves your network to reach Visa
  Acceptance during a transaction.
  - Requires POS and terminal to be on the **same network** (same WiFi/LAN, or reachable via
    USB/ADB port forwarding).
  - Requires mutual TLS (mTLS) certificate setup between POS and terminal (or one-way TLS,
    see SI-Q5).
  - **Choose Local mode when:** the POS and terminal are always co-located (same store,
    same LAN) and you want the lowest latency with no dependency on outbound internet
    connectivity from the POS.

- **Cloud mode** — Your POS app sends an HTTPS request to the Visa Acceptance backend,
  which then routes the command to the terminal over the terminal's own connection back to
  Visa Acceptance. POS and terminal never talk to each other directly.
  - POS and terminal can be on **different networks** — e.g. POS in a data center, terminal
    in a remote store.
  - Transactions authenticate via a bearer token exchanged from an Acceptance Devices
    login pair (`id`/`secret`) — see SI-Q4 and `cloud-transaction-auth.md`.
  - **Choose Cloud mode when:** the POS and terminal are not on the same network, you're
    orchestrating multiple remote terminals from a central POS/backend, or you don't want to
    manage local network/firewall/mTLS setup between POS and terminal.

Store as `SI_MODE` (`local` | `cloud`).

---

**SI-Q2:** What platform is your POS system built on?
- **Android** (Java/Kotlin)
- **Node.js** (JavaScript/TypeScript)
- **Python**
- **Other** (developer specifies: .NET, Go, Java backend, etc.)

Store as `PLATFORM`.

**SI-Q2a (optional early-start ask):** Ask the developer with `AskUserQuestion`:

> While you gather your credentials (Merchant ID, Key ID, Secret Key / P12 cert), I can
> start scaffolding the POS network layer now — HTTP/WebSocket client, TLS dependencies,
> base URL configuration. This part doesn't need credentials.
>
> The parts that DO need credentials (auth header construction, bearer-token exchange,
> signed request calls) will stay as clearly marked TODOs until your credentials are
> validated, then I'll finish them in a short follow-up pass.
>
> Would you like me to start scaffolding now, or wait until credentials are ready and do
> it in one pass?

- **Start scaffolding now** → Store `SI_1_EARLY_START = yes`. Immediately spawn one
  **subagent** for **Gate SI-1a** (scaffold-only — see below), running while the developer
  answers SI-Q3–SI-Q4 and fills in `si-credentials.env`. This is a single one-shot subagent
  call, not a persistent background agent or multi-agent team — see the note at the top of
  this file.
- **Wait, do it in one pass** → Store `SI_1_EARLY_START = no`. Gate SI-1 does not start
  until SI-Q3–SI-Q4 are answered, `si-credentials.env` is filled in, and Gate SI-0 has
  validated the credentials. This is the default-safe path and requires no special
  handling below.

> **Why ask instead of assuming:** an earlier version of this workflow always ran Gate SI-1
> in parallel with credential collection. Because Gate SI-1 needs credentials to write the
> real auth/signing code, that early pass produced only scaffolding and boilerplate with
> stubbed request bodies — not working REST/WSS calls — and reported PASS anyway, which is
> misleading. Making the split opt-in, and finishing the auth-specific code in a real
> second pass rather than leaving it stubbed, fixes both problems.

**If `SI_1_EARLY_START = yes` — Gate SI-1a (scaffold, no credentials required):**

Spawn one subagent now with a trimmed version of the Gate SI-1 Agent Prompt Template
(`activities/act_SI_01_setup-project.md`), scoped to:
- Step 1 (base URL/port configuration pattern), Step 2 (TLS dependencies), Step 3
  (TLS/mTLS security setup — cert file paths and loading code, not the values themselves),
  Step 4 (hostname validation), Step 5 (connectivity verification).
- Explicitly instruct the subagent: **do NOT write auth header construction, bearer-token
  exchange, or signed-request logic** — mark each with `// TODO(SI-1b): requires validated
  credentials` and leave the call site scaffolded but non-functional.
- The subagent must still verify the project builds/compiles before reporting.

Update the Progress Tracker / task for SI-1 to `in_progress` with note "scaffold phase
running early — auth wiring deferred to SI-1b".

**Gate SI-1b (completion — runs after Gate SI-0 passes):** Once credentials are validated
(Gate SI-0 = PASS), spawn a second subagent using the full Gate SI-1 Agent Prompt Template,
instructed to complete only the `TODO(SI-1b)` sites — auth header construction, bearer-token
exchange or request signing, using the now-validated credentials. This subagent must verify
the project builds AND that no `TODO(SI-1b)` markers remain before Gate SI-1 is reported PASS.

**Only after Gate SI-1b passes** does Gate SI-1's Progress Tracker / task move to `done`.
Do not report Gate SI-1 as PASS after SI-1a alone — a compiling scaffold with stubbed auth
calls is not a passing gate (see the Acceptance Criteria in `act_SI_01_setup-project.md`).

---

**SI-Q3:** Do you have a PAX terminal powered on and connected to the network?
- **Yes** — terminal is ready, I want to do full setup (POS code + terminal activation)
- **No / Not yet** — I'll start with POS code setup and set up the terminal later

Store as `SI_TERMINAL_AVAILABLE` (`yes` | `no`).

> **Flow note:** POS code setup (Gate SI-1) always runs first regardless of terminal
> availability. Terminal activation (Gate SI-2) runs after SI-1 completes — or is deferred
> if the terminal isn't ready. The developer can resume SI-2 in a later session.

**If yes AND `SI_MODE = cloud` — collect terminal serial number (skip IP discovery):**

Cloud mode does not require the terminal's local IP or port. The POS communicates with the
Visa Acceptance backend over HTTPS, which routes commands to the terminal. What cloud mode
needs is the terminal's **serial number** to identify it in the backend.

**SI-Q3-cloud:** What is the terminal's serial number?

> The serial number is printed on the terminal label (back/bottom) and also visible in:
> Settings → About → Serial Number (on the terminal itself).
> Format example: `PAX1234567890` or similar alphanumeric string.

Store as `SI_TERMINAL_SERIAL`.

**SI-Q3-cloud-env:** Which cloud environment are you targeting?
- **Test / Sandbox** — for development and integration testing
- **Production** — live environment

Store as `SI_ENVIRONMENT` (`test` | `production`). Default to `test`.

> **Note:** `SI_TERMINAL_HOST` and `SI_TERMINAL_PORT` are NOT collected for cloud mode.
> The POS SDK/code will use Visa Acceptance cloud endpoints (configured in Gate SI-1).

---

**If yes AND `SI_MODE = local` — identify connection method and enumerate USB devices:**

The terminal's IP address and port are **not discoverable until after the terminal is
activated and the server is started** (Gate SI-2, Step 5). Do not attempt IP/port
discovery here. Instead:

1. Ask how the terminal is connected so Gate SI-2 knows which path to use.
2. If USB: enumerate ADB devices now — this lets Gate SI-2 skip re-enumeration and
   enables ADB port forwarding if needed.

**SI-Q3-conn:** How is the PAX terminal connected to your development machine?
- **USB (ADB)** — terminal is connected via USB cable; ADB is available
- **WiFi (same network)** — terminal and POS are on the same WiFi, no USB cable

Store as `SI_CONN_METHOD` (`usb` | `wifi`).

---

#### If `SI_CONN_METHOD = usb` — enumerate ADB devices

Re-use the ADB enumeration from Step -1 if `PAX_SERIAL` and `SI_POS_SERIAL` are already
set. Otherwise run the full enumeration here:

```bash
ALL_DEVICES=$(adb devices -l 2>/dev/null | grep -v "^List" | grep -v "^$")
echo "=== Connected ADB devices ==="
echo "$ALL_DEVICES"

PAX_SERIAL=$(echo "$ALL_DEVICES" | grep -i "model:.*\(pax\|A77\|A920\|A80\)" | awk '{print $1}' | head -1)

if [ -n "$PAX_SERIAL" ]; then
  SI_POS_SERIAL=$(echo "$ALL_DEVICES" | grep -v "$PAX_SERIAL" | awk '{print $1}' | head -1)
else
  SI_POS_SERIAL=$(echo "$ALL_DEVICES" | awk '{print $1}' | head -1)
fi

echo "PAX terminal serial : ${PAX_SERIAL:-NOT FOUND}"
echo "POS device serial   : ${SI_POS_SERIAL:-NOT FOUND}"
```

Report to the developer:

> **USB device detection:**
> - PAX terminal: `<PAX_SERIAL>` / NOT FOUND
> - POS device: `<SI_POS_SERIAL>` / NOT FOUND

Store `PAX_SERIAL` and `SI_POS_SERIAL`. These are passed to Gate SI-2 so it can:
- Read the terminal's WiFi IP via ADB **after** the server starts
- Set up ADB port forwarding if needed
- Check AD app installation

> **Note:** The terminal IP and port are discovered in Gate SI-2, **after** the server
> starts. `SI_TERMINAL_HOST` and `SI_TERMINAL_PORT` are left unset until then.

---

#### If `SI_CONN_METHOD = wifi` — no pre-activation discovery needed

The terminal does not expose port 8443 until the server is started (Gate SI-2, Step 5).
Scanning the network now will find nothing. Gate SI-2 will discover the terminal IP after
the server starts.

> **Note:** `SI_TERMINAL_HOST`, `SI_TERMINAL_PORT`, `PAX_SERIAL`, and `SI_POS_SERIAL`
> are all left unset here. Gate SI-2 will run the WiFi scan after the terminal server
> is started and populate them at that point.

---

**SI-Q4:** DMS API authentication — **always HTTP Signature (KEY_ID + SECRET_KEY)**

**The DMS activation-code endpoint (`POST /activation-codes`) requires HTTP Signature
authentication (HMAC-SHA256 with a REST Shared Secret Key). This is NOT a developer
choice — it is a platform requirement.**

P12 certificate / JWT authentication may work for some DMS read endpoints (e.g.
`GET /customization`) but consistently returns `401 UNAUTHORIZED_USER` on the
activation-codes endpoint, even when the P12 cert is valid and the merchant is boarded.
This appears to be a per-endpoint permission difference in how CyberSource grants API
access to REST Certificate keys vs REST Shared Secret Keys.

**Do NOT ask the developer to choose between shared secret and certificate for DMS.**
Always collect `KEY_ID` and `SECRET_KEY`, and use HTTP Signature for all DMS API calls.

Store as `CREDENTIAL_METHOD = shared_secret` (always — this variable is retained for
backward compatibility with gate templates that reference it).

**If `SI_MODE = cloud`** — one additional credential is needed: the **Acceptance Devices
login pair** (`id` + `secret`) used to obtain the transaction bearer token from `/login`.
This is a separate credential — not `ORG_ID`/`TRANSACTING_MID` (DMS identity) and not
`KEY_ID`/`SECRET_KEY` (DMS auth). Obtain it from Business Center → Acceptance Devices,
or your onboarding contact — see `cloud-transaction-auth.md` for the full explanation.

> **Why always HTTP Signature:** REST Certificate (P12/JWT) keys and REST Shared Secret
> Keys are separate key types in CyberSource, each with independent API product
> permissions. In practice, the DMS activation-code endpoint grants access to shared
> secret keys but not to certificate keys — even for the same merchant. This was
> confirmed empirically: the same merchant's P12 cert authenticates successfully for
> `GET /customization` (HTTP 404) but returns `401 UNAUTHORIZED_USER` on
> `POST /activation-codes`, while the same merchant's shared secret key returns
> `HTTP 201` with a valid activation code.

---

### Generate `si-credentials.env` instead of asking for values in chat

**Do NOT ask the developer to type `ORG_ID`, `TRANSACTING_MID`, `KEY_ID`, or `SECRET_KEY`
into the chat.** These are typed into the terminal/chat input, which means they land in
shell history, session logs, and screen-recording/screenshare — an unnecessary exposure of
merchant credentials. It also stretches out the questionnaire with values the developer
usually has to go look up mid-conversation anyway.

Instead, generate `si-credentials.env` immediately with descriptive placeholders and ask
the developer to fill it in directly in their editor:

```bash
cat > si-credentials.env.example << 'EOF'
# ============================================================
# Semi-Integrated PAX — Credentials
# Copy to si-credentials.env and fill in the values below.
# si-credentials.env is git-ignored — never commit it.
# ============================================================

# ── DMS / Activation API credentials ───────────────────────

# ORG_ID — your EBC organization-level merchant ID.
# Used as the v-c-merchant-id header value for API authentication.
# Where to find it: Business Center, top-right corner, or Organization Settings.
ORG_ID=<your-org-id>

# TRANSACTING_MID — the terminal's merchant ID in the device management system (DMS).
# Used in the DMS API URL path: /dms/v2/merchants/{TRANSACTING_MID}/activation-codes.
# This is often DIFFERENT from ORG_ID — it's the MID assigned to this specific
# terminal/store location, not your top-level EBC identity. Using the wrong value in
# either field causes 412 or 401 errors.
# Where to find it: Business Center → Acceptance Devices → Terminal Management →
# Merchant ID column.
TRANSACTING_MID=<your-transacting-mid>
EOF

# KEY_ID + SECRET_KEY are ALWAYS required for DMS API calls (activation codes,
# customization, cert exchange). The DMS activation-code endpoint requires HTTP
# Signature auth — P12/JWT auth returns 401 UNAUTHORIZED_USER even with valid certs.
cat >> si-credentials.env.example << 'EOF'

# ── HTTP Signature key (REQUIRED for DMS / activation-code API) ──
# The DMS API requires HTTP Signature auth (HMAC-SHA256). P12/JWT auth does not
# work for activation-code generation even with a valid certificate.

# KEY_ID — the REST Shared Secret key ID used to sign HTTP Signature requests.
# Where to find it: Business Center → Payment Configuration → Key Management →
# select the REST Shared Secret key for your org → copy the Key ID value.
KEY_ID=<your-key-id-from-business-center>

# SECRET_KEY — the shared secret value paired with KEY_ID above (base64-encoded).
# This is shown ONCE at creation time in Business Center — if you don't have it
# saved, you must generate a new key.
SECRET_KEY=<base64-encoded-shared-secret>
EOF

# Only include cloud-mode fields if SI_MODE = cloud
if [ "<SI_MODE>" = "cloud" ]; then
cat >> si-credentials.env.example << 'EOF'

# ── Cloud transaction credentials ──────────────────────────
# Cloud-mode TRANSACTIONS authenticate with a bearer token from POST /login — NOT the
# P12/JWT scheme the official docs describe for this endpoint (that returns HTTP 500).
# See cloud-transaction-auth.md for the full explanation. The P12 cert above (if
# CREDENTIAL_METHOD=certificate) is only for the DMS/activation-code API — it is unrelated
# to transaction auth.

# SI_AD_LOGIN_ID / SI_AD_LOGIN_SECRET — the Acceptance Devices merchant id/secret pair
# exchanged for the transaction bearer token. This is a THIRD, distinct credential — not
# ORG_ID/TRANSACTING_MID and not KEY_ID/SECRET_KEY or the P12 cert above.
# Where to find it: Business Center → Acceptance Devices, or your onboarding contact.
SI_AD_LOGIN_ID=<your-acceptance-devices-id>
SI_AD_LOGIN_SECRET=<your-acceptance-devices-secret>

# SI_ENVIRONMENT — test or production.
SI_ENVIRONMENT=test

# SI_TERMINAL_SERIAL — printed on the terminal label, or Settings → About → Serial Number.
SI_TERMINAL_SERIAL=<your-terminal-serial>
EOF
fi

cat >> si-credentials.env.example << 'EOF'

# ── Endpoint Overrides (optional) ──────────────────────────
# DMS_BASE_URL=https://apitest.cybersource.com
# TRANSACTION_BASE_URL=https://apitest.cybersource.com
EOF

# Copy to the real config file location (git-ignored)
cp si-credentials.env.example si-credentials.env
grep -qxF 'si-credentials.env' .gitignore 2>/dev/null || echo 'si-credentials.env' >> .gitignore
```

> **Files created:**
> - `si-credentials.env.example` — template with placeholders and inline "where to find
>   this" comments for every field (safe to commit)
> - `si-credentials.env` — your actual credentials (git-ignored, contains secrets)
> - `.gitignore` — updated to exclude `si-credentials.env`

**SI-Q4-confirm:** Use `AskUserQuestion`:

> I've created `si-credentials.env` with placeholders and a comment above each field
> explaining what it is and exactly where to find it in Business Center. Please open the
> file in your editor, fill in the real values, and save it.
>
> Have you finished filling it in?

- **Done — values filled in** → continue to SI-Q5 below. Gate SI-0 will validate the
  actual values later; do not read the file's contents into the chat to "double-check" it —
  that reintroduces the same exposure this step exists to avoid.
- **I need help finding a value** → walk through the relevant comment in the file with the
  developer (which field, which Business Center path) without asking them to paste the
  value back into chat.

> **Note:** If the developer doesn't have these yet, they can still proceed to Gate SI-1
> (code setup) and fill in `si-credentials.env` later — but Gate SI-2 (activation) will
> block until Gate SI-0's credential checks pass against real values.

---

**SI-Q5 (Local mode only):** What security level do you want for the terminal connection?
- **mTLS (recommended)** — two-way certificate verification. POS proves its identity to the terminal AND terminal proves its identity to the POS.
- **TLS** — one-way verification. POS verifies the terminal only. Simpler setup but less secure.

Store as `SI_SECURITY` (`mtls` | `tls`). Default to `mtls` if Local mode.
Skip this question for Cloud mode (Cloud uses standard HTTPS + a bearer token from `/login`; see `cloud-transaction-auth.md`).

---

**SI-Q6:** What currency will transactions use?

Provide ISO 4217 code (e.g., `USD`, `GBP`, `EUR`, `CAD`).

Store as `TRANSACTION_CURRENCY`.

---

**SI-Q7:** Which additional transaction types beyond Sale do you need? (select all that apply)

> **Sale is always included** — it is the core transaction type and is not listed as an option below.

- **Refund** — linked refund, standalone credit, or token refund
- **Pre-Authorization & Capture** — hold funds now, capture later (hotels, rentals, tabs)
- **Tipping** — on-reader (terminal prompts) or on-receipt (capture later with tip)
- **Transaction Management** — lookup (check status) and cancel (abort in-progress)

Store as gate decisions:
- `gate_SI_3_sale` = `run` (always — core transaction)
- `gate_SI_4_refund` = `run` | `declined`
- `gate_SI_5_preauth` = `run` | `declined`
- `gate_SI_6_tipping` = `run` | `declined`
- `gate_SI_7_txn_mgmt` = `run` | `declined`

If tipping selected, ask:

**SI-Q7a:** Which tipping mode?
- **On-reader** — customer selects tip on terminal before card tap
- **On-receipt** — customer writes tip on receipt, POS captures later
- **Both**

Store as `TIPPING_MODE` (`on_reader` | `on_receipt` | `both`).

If refund selected, ask:

**SI-Q7b:** Which refund types do you need?
- **Linked refund** — refund referencing original transaction (recommended)
- **Standalone credit** — credit without original reference (card present required)
- **Token refund** — credit to a stored card token
- **All**

Store as `REFUND_TYPES` (`linked` | `standalone` | `token` | `all`).

---

### End of Step 0 — Credential Validation Checks

`si-credentials.env` was already created earlier in Step 0 (right after SI-Q4 determined
`CREDENTIAL_METHOD`) — see "Generate `si-credentials.env` instead of asking for values in
chat" above. What remains is validating the values the developer filled in, at Gate SI-0.

Gate SI-0 runs three checks against the DMS API — `POST /login`, `GET .../customization`,
`POST .../activation-codes`. **Do not silently write a script to disk.** Ask the developer
first:

**SI-Q4-validate (script-or-inline ask):** Use `AskUserQuestion`:

> Gate SI-0 needs to run three checks against your credentials (`/login`, a customization
> lookup, and an activation-code request). I can either:
> - Run these checks directly, right now, one at a time, showing you each command and its
>   result as it happens — nothing is saved to disk.
> - Save them as a reusable `validate-credentials.sh` script, so you (or CI) can re-run all
>   three later with one command — useful if you expect to re-validate credentials
>   repeatedly (e.g. after rotating a key, or across multiple environments).
>
> Which would you prefer?

- **Run directly, don't save anything** → execute each of the three `curl` calls as
  individual Bash tool calls (shown below under "Inline checks"), showing the command and
  its result to the developer as each one runs. No file is written.
- **Save as a reusable script** → **first print the complete script contents in the chat
  reply** (the block below under "Persisted script"), then write it to
  `validate-credentials.sh` and run it. The developer sees exactly what the file contains
  before it exists on disk or executes — never write and run a script the developer hasn't
  seen.

**Inline checks (no file written):**

```bash
source ./si-credentials.env
BASE_URL="${DMS_BASE_URL:-https://apitest.cybersource.com}"

# 1. POST /login
curl -s -o /dev/null -w "%{http_code}\n" -X POST "${BASE_URL}/sis/v1/login" \
  -H "Content-Type: application/json" -H "v-c-merchant-id: ${ORG_ID}" -d "{}"
# Expect 200. 401 → HTTP Signature mismatch (check KEY_ID/SECRET_KEY); 403 → wrong ORG_ID

# 2. GET .../customization
curl -s -o /dev/null -w "%{http_code}\n" \
  "${BASE_URL}/dms/v2/merchants/${TRANSACTING_MID}/customization" \
  -H "v-c-merchant-id: ${ORG_ID}"
# Expect 200 (404 = no customisation set, OK). 401 → signature mismatch; 412 → wrong TRANSACTING_MID

# 3. POST .../activation-codes
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "${BASE_URL}/dms/v2/merchants/${TRANSACTING_MID}/activation-codes?size=1" \
  -H "v-c-merchant-id: ${ORG_ID}"
# Expect 201. 401 → signature mismatch; 412 → wrong TRANSACTING_MID; 403 → wrong ORG_ID
```

Run each one, report its HTTP status and PASS/FAIL against the expected code, and summarize
all three at the end (`N PASS, N FAIL`) exactly as Gate SI-0's outcome rule below requires.

**Persisted script (only after the developer has seen this exact content in chat):**

```bash
cat > validate-credentials.sh << 'SCRIPT'
#!/usr/bin/env bash
# validate-credentials.sh — Gate SI-0 pre-check
set -euo pipefail

source ./si-credentials.env 2>/dev/null || { echo "ERROR: si-credentials.env not found"; exit 1; }

BASE_URL="${DMS_BASE_URL:-https://apitest.cybersource.com}"
PASS_COUNT=0; FAIL_COUNT=0

check() {
  local name="$1" status="$2" expected="$3" hint="$4"
  if [ "$status" -eq "$expected" ] 2>/dev/null; then
    echo "  PASS  $name (HTTP $status)"
    PASS_COUNT=$((PASS_COUNT+1))
  else
    echo "  FAIL  $name (HTTP $status — expected $expected) — $hint"
    FAIL_COUNT=$((FAIL_COUNT+1))
  fi
}

echo "=== Gate SI-0: Credential Validation ==="

# 1. POST /login
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${BASE_URL}/sis/v1/login" \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: ${ORG_ID}" \
  -d "{}" 2>/dev/null)
check "/login" "$LOGIN_STATUS" 200 "401 → HTTP Signature mismatch; check KEY_ID / SECRET_KEY; 403 → wrong ORG_ID"

# 2. GET /dms/v2/merchants/{transactingMid}/customization
CUST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}/dms/v2/merchants/${TRANSACTING_MID}/customization" \
  -H "v-c-merchant-id: ${ORG_ID}" 2>/dev/null)
if [ "$CUST_STATUS" -eq 404 ]; then
  echo "  SKIP  /customization (HTTP 404 — no customisation set; OK to proceed)"
else
  check "/customization" "$CUST_STATUS" 200 "401 → signature mismatch; 412 → wrong TRANSACTING_MID"
fi

# 3. POST /dms/v2/merchants/{transactingMid}/activation-codes?size=1
AC_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${BASE_URL}/dms/v2/merchants/${TRANSACTING_MID}/activation-codes?size=1" \
  -H "v-c-merchant-id: ${ORG_ID}" 2>/dev/null)
check "/activation-codes" "$AC_STATUS" 201 "401 → signature mismatch; 412 → wrong TRANSACTING_MID; 403 → wrong ORG_ID"

echo ""
echo "Result: ${PASS_COUNT} PASS, ${FAIL_COUNT} FAIL"
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo "Gate SI-0: PASS — credentials valid, safe to proceed to Gate SI-1."
  exit 0
else
  echo "Gate SI-0: FAIL — fix credential errors before proceeding to Gate SI-1."
  exit 1
fi
SCRIPT
chmod +x validate-credentials.sh
```

> **File created (only if the developer chose to persist it):** `validate-credentials.sh`
> — runs the same three read-only checks shown above. You can re-run it any time with
> `./validate-credentials.sh`. Its full contents were shown above before it was written.

> **Still outstanding (not covered by `si-credentials.env`):**
>
> **P12 certificate — only if `CREDENTIAL_METHOD = certificate`** (this is for DMS/
> activation-code API auth, unrelated to cloud-mode transaction auth):
> - [ ] P12 certificate file (`.p12`) for the transacting MID — Gate SI-2 will ask for its
>   file path when needed; the file itself must stay outside source control
> - [ ] P12 certificate password
>
> **Terminal:**
> - [ ] Acceptance Devices app installed on the PAX terminal
> - [ ] Terminal powered on and connected to the network (or USB-connected via ADB)

### Generate Progress Tracker and Task List

Every gate in the Gate Registry must be visible to the developer as a tracked task from
this point forward, in two synchronized places:

**1. Append a `# Progress Tracker` section to `project-plan.md`** — the persistent,
file-based record used to resume an interrupted session:

```markdown
# Progress Tracker

<!-- This section is updated automatically by the workflow as each gate completes.
     If a session is interrupted, the workflow reads this table to resume. -->

| # | Task | Status | Notes |
|---|------|--------|-------|
| SI-0 | Credential Validation | pending | |
| SI-1 | Project Setup | pending | |
| SI-2 | Terminal Activation | pending | |
| SI-3 | Sale Transaction | pending | |
| SI-4 | Refund Transaction | pending | |
| SI-5 | Pre-Auth & Capture | pending | |
| SI-6 | Tipping | pending | |
| SI-7 | Transaction Management | pending | |
```

**Status values:** `pending`, `in_progress`, `done`, `skipped`, `failed`, `deferred`

Mark any gate that the SI-Q7/SI-Q7a/SI-Q7b answers indicate should be skipped as `skipped`
with a note (e.g., "SI-Q7: refund declined", "SI-Q7: tipping declined").

**2. Create one live task per gate via `TaskCreate`**, mirroring the same rows, so the
developer sees the full activity list as a todo list in this session immediately —
before any gate has started:

- Subject: `Gate SI-<n>: <Name>` (e.g., `Gate SI-3: Sale Transaction`) — `<Name>` is the
  Gate Registry's Name column
- Description: the activity file path from the Gate Registry's Activity column (or the
  inline note for SI-0)
- For any gate already marked `skipped` in the Progress Tracker: create the task, then
  immediately `TaskUpdate` it to `completed` with `(skipped: <reason>)` appended to the
  subject — this keeps the task list showing every gate, including declined ones, rather
  than omitting them.

This task list is what the developer watches as gates progress — the Gate Execution
Protocol (above) keeps both `project-plan.md` and this live task list in sync as each gate
runs, passes, fails, or is deferred.

After both are created, show this callout:

> **File created:** `project-plan.md` — your configuration and the Progress Tracker table
> (safe to commit; contains no secrets). This is the file the workflow reads to resume if
> this session is interrupted. You can open it any time to see full gate status and notes.

---

## Step 0b — Terminal Connectivity Pre-Check (when SI_TERMINAL_AVAILABLE = yes)

After collecting all configuration, verify the terminal is reachable and ready.
This catches network issues early — but does NOT block Gate SI-1 (POS code setup).

**Execution order:**
1. Run this pre-check (informational — report results to developer)
2. **Always proceed to Gate SI-1** (POS setup) regardless of pre-check outcome
3. Gate SI-2 (terminal activation) runs only after SI-1 passes AND pre-check passed

If the pre-check fails and the developer cannot fix it immediately, set
`SI_TERMINAL_AVAILABLE = no` — Gate SI-1 still runs, Gate SI-2 is deferred.

### Cloud mode pre-check (`SI_MODE = cloud`)

Cloud mode does not require local network connectivity to the terminal. Skip all
network reachability, ping, and port checks. Instead, verify the backend is reachable:

```bash
# Verify Visa Acceptance cloud endpoint is reachable
if [ "$SI_ENVIRONMENT" = "test" ]; then
  curl -s -o /dev/null -w "%{http_code}" https://apitest.cybersource.com/up 2>/dev/null
else
  curl -s -o /dev/null -w "%{http_code}" https://api.cybersource.com/up 2>/dev/null
fi
```

**AD app check (IMP-7) — re-verify Acceptance Devices app is installed on the terminal:**

If ADB is available and `PAX_SERIAL` is set, check for the AD app now to catch a missing
app before Gate SI-2 rather than at activation time:

```bash
if [ -n "${PAX_SERIAL:-}" ]; then
  AD_PKG=$(adb -s "$PAX_SERIAL" shell pm list packages 2>/dev/null \
    | grep -i "com\.visa\.acceptanceapp\|com\.isvhub\.mainapp")
  echo "AD app (cloud pre-check): ${AD_PKG:-NOT FOUND}"
fi
```

If ADB is NOT available or `PAX_SERIAL` is not set, add AD app verification as a manual
checklist item in the pre-check report.

**Customisation endpoint check — determine current terminal mode:**

Parse `GET /dms/v2/merchants/{TRANSACTING_MID}/customization` to determine whether the
terminal is already in cloud mode before Gate SI-2:

```bash
BASE_URL="${DMS_BASE_URL:-https://apitest.cybersource.com}"
CUST_RESP=$(curl -s -w "\n%{http_code}" \
  "${BASE_URL}/dms/v2/merchants/${TRANSACTING_MID}/customization" \
  -H "v-c-merchant-id: ${ORG_ID}" 2>/dev/null)
CUST_STATUS=$(echo "$CUST_RESP" | tail -1)
CUST_BODY=$(echo "$CUST_RESP" | head -1)
echo "Customisation HTTP $CUST_STATUS"
echo "$CUST_BODY" | python3 -m json.tool 2>/dev/null || echo "$CUST_BODY"
```

Interpret the result and inform the developer:

| Status | Meaning | Action |
|--------|---------|--------|
| `200` — `terminalMode: cloud` | Terminal already in cloud mode | Inform developer; **skip** the BC customisation step in SI-2 and proceed directly to activation code generation. |
| `200` — `terminalMode: tls` or `mtls` | Terminal is in TLS/mTLS local mode | Inform developer; offer to switch to cloud mode via `PUT /dms/v2/customization` before Gate SI-2. |
| `404` | No customisation configured | Terminal will default to local mode — the customisation step in Gate SI-2 is required. |
| other | Credential / config error | Surface the raw response; may indicate wrong MID or auth issue (fix at Gate SI-0). |

Always surface the raw `CUST_BODY` to the developer regardless of status.

Report to developer:

> **Cloud Mode Pre-Check Results:**
> - Mode: CLOUD
> - Terminal serial: `<SI_TERMINAL_SERIAL>`
> - Environment: `<SI_ENVIRONMENT>`
> - Backend reachability: PASS / FAIL
> - Customisation mode: `<terminalMode from response>` / NOT SET (404) / ERROR
> - AD app installed (ADB): `<package>` / NOT FOUND / N/A (ADB not available — verify manually before Gate SI-2)
> - Local terminal connectivity: NOT REQUIRED (backend-routed)

If backend is unreachable, warn but still proceed to Gate SI-1. Gate SI-2 will need
the backend to be reachable for activation code generation.

**After cloud pre-check, skip directly to Gate SI-0 — Credential Validation.**

---

### Local mode pre-check (`SI_MODE = local`)

The terminal's port 8443 is not open until after activation (Gate SI-2). Network
reachability and port checks are therefore deferred to Gate SI-2. The pre-check here
is limited to what can be verified right now:

### 1. ADB device check (USB only — `SI_CONN_METHOD = usb`)

If ADB enumeration was run above and `PAX_SERIAL` is set, confirm the AD app is installed:

```bash
if [ -n "$PAX_SERIAL" ]; then
  AD_INSTALLED=$(adb -s "$PAX_SERIAL" shell pm list packages 2>/dev/null \
    | grep -i "com\.visa\.acceptanceapp\|com\.isvhub\.mainapp")
  echo "AD app: ${AD_INSTALLED:-NOT FOUND}"
fi
```

- **AD app found:** Report the package name (`com.visa.acceptanceapp.test` / `com.visa.acceptanceapp`). Continue.
- **AD app NOT found:** Warn the developer — activation will fail without it.
  > Install via: `adb -s $PAX_SERIAL install <path-to-acceptance-devices.apk>`
- **`PAX_SERIAL` not set / WiFi mode:** Skip — AD app presence is confirmed during Gate SI-2.

### 2. Report pre-check summary

> **Local Mode Pre-Check Results:**
> - Connection method: USB (ADB) / WiFi
> - ADB detected: YES (`<PAX_SERIAL>`) / NO / N/A (WiFi mode)
> - AD app installed: YES (`<package>`) / NO / N/A
> - Terminal IP/port: **Not yet available** — discovered in Gate SI-2 after server starts
> - Network reachability: **Deferred to Gate SI-2**

---

## Gate SI-0 — Credential Validation

**This gate runs between Step 0 (configuration) and Gate SI-1 (code setup). Working
credentials are required before code setup makes sense — Gate SI-1 is BLOCKED if any
credential check fails.**

Run the three checks using whichever approach the developer chose at the end of Step 0
(inline `curl` calls shown live, or the persisted `validate-credentials.sh` — see
"End of Step 0 — Credential Validation Checks"):

```bash
bash validate-credentials.sh   # only if the developer opted to persist it
```

Either way, the checks performed are the same three:

| Check | Expected | Failure hints |
|-------|----------|---------------|
| `POST /login` | HTTP 200 with token | 401 → HTTP Signature mismatch; check KEY_ID / SECRET_KEY; 403 → wrong ORG_ID |
| `GET /dms/v2/merchants/{TRANSACTING_MID}/customization` | HTTP 200 (404 = SKIP — no customisation set, OK) | 401 → signature mismatch; 412 → wrong TRANSACTING_MID in URL |
| `POST /dms/v2/merchants/{TRANSACTING_MID}/activation-codes?size=1` | HTTP 201 | 401 → signature mismatch; 412 → wrong TRANSACTING_MID; 403 → wrong ORG_ID |

**Gate SI-0 outcomes:**

- **All PASS (or SKIP for 404):** Proceed to Gate SI-1. Credentials are confirmed working.
- **Any FAIL:** BLOCK — do not proceed to Gate SI-1. Present the specific failure and
  troubleshooting hint to the developer, wait for corrected values, then re-run this gate.

> **Why block before Gate SI-1?** Gate SI-1 scaffolds HTTP client code that encodes the
> base URL, ORG_ID, and auth method. If credentials are wrong at that point, the developer
> will scaffold against incorrect values and hit 401/412 errors for the first time during
> the live activation test — a much more confusing debugging context. Catching it here takes
> seconds and prevents that confusion.

---

## Step 1 — Gate Execution

For each SI gate, apply the Gate Execution Protocol defined above.

### SI Gate SI-1: Project Setup

**Skip condition:** `gate_SI_1_setup = skip` in `project-plan.md`

**If `SI_1_EARLY_START = yes`:** Gate SI-1a already ran (scaffold only, spawned right after
SI-Q2 — see above). Only Gate SI-1b (completing the `TODO(SI-1b)` auth/signing code) runs
here, after Gate SI-0 has passed. Use the same Agent Prompt Template but instruct the
subagent to complete the existing TODOs rather than scaffold from scratch.

**If `SI_1_EARLY_START = no` (default):** Gate SI-1 runs here in full, in one pass, using
the Agent Prompt Template as written — this is the normal sequential case and needs no
special handling.

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode only
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode only (test | production)
SI_POS_SERIAL=<SI_POS_SERIAL>                # Android POS only — ADB serial for build/deploy
PLATFORM=<PLATFORM>
```

> **Note:** `SI_TERMINAL_HOST`, `SI_TERMINAL_PORT`, and `SI_ADB_FORWARDING` are NOT
> injected here — the terminal IP and port are unknown until Gate SI-2 starts the server.
> `SI_POS_SERIAL` is only set when `PLATFORM=android` and a POS device was detected via
> ADB; otherwise empty.

**Activity:** `activities/act_SI_01_setup-project.md`

**Build check:** Verify project compiles after dependencies are added.

---

### SI Gate SI-2: Terminal Activation

**Skip condition:** `gate_SI_2_activation = skip` in `project-plan.md` OR `SI_TERMINAL_AVAILABLE = no`

If terminal is not available, mark this gate as `deferred` (not skipped) — the developer
should run it when a terminal becomes available.

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_CONN_METHOD=<SI_CONN_METHOD>              # local mode only: usb | wifi
PAX_SERIAL=<PAX_SERIAL>                      # local/usb only — ADB serial for terminal
SI_POS_SERIAL=<SI_POS_SERIAL>                # Android POS only — ADB serial for POS device
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode only
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode only (test | production)
SI_SECURITY=<SI_SECURITY>                    # local mode only
CREDENTIAL_METHOD=<CREDENTIAL_METHOD>
```

> **Note:** `ORG_ID` and `TRANSACTING_MID` are deliberately NOT injected as literal values —
> the agent reads them from `si-credentials.env` (see the Agent Prompt Template's
> "Credentials — read from file" section). This keeps merchant identifiers out of the
> prompt text.
>
> `SI_TERMINAL_HOST`, `SI_TERMINAL_PORT`, and `SI_ADB_FORWARDING` are NOT
> injected — Gate SI-2 discovers them **after** the terminal server starts (Step 5 in
> `act_SI_02_terminal-activation.md`) and writes them back to `project-plan.md` for
> subsequent gates to consume.
>
> For WiFi mode (`SI_CONN_METHOD = wifi`), `PAX_SERIAL` and `SI_POS_SERIAL` will be
> unset — Gate SI-2 runs the WiFi scan post-server-start to discover the terminal IP.

**Activity:** `activities/act_SI_02_terminal-activation.md`

**Note:** This gate is interactive — it requires physical actions on the terminal.

**Terminal IP/port discovery (local mode — after Step 5 server start):**
Once the developer confirms "Device connected" on the terminal (Step 5 of the activity),
Gate SI-2 must discover and record `SI_TERMINAL_HOST` and `SI_TERMINAL_PORT` before
running the connectivity verification. The discovery method depends on `SI_CONN_METHOD`:

- **USB (`SI_CONN_METHOD = usb`):** Read the terminal's WiFi IP via ADB:
  ```bash
  SI_TERMINAL_HOST=$(adb -s "$PAX_SERIAL" shell ip addr show wlan0 2>/dev/null \
    | grep "inet " | awk '{print $2}' | cut -d/ -f1)
  SI_TERMINAL_PORT=8443
  echo "Terminal: ${SI_TERMINAL_HOST}:${SI_TERMINAL_PORT}"
  ```
  Then run subnet mismatch check — if POS and terminal are on different /24 subnets,
  offer ADB port forwarding (`localhost:8443`) and set `SI_ADB_FORWARDING = true`.

- **WiFi (`SI_CONN_METHOD = wifi`):** Scan the POS machine's subnet for port 8443:
  ```bash
  POS_WIFI_IP=$(ipconfig getifaddr en0 2>/dev/null || \
    ifconfig | grep "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -1)
  LOCAL_SUBNET=$(echo "$POS_WIFI_IP" | awk -F. '{print $1"."$2"."$3}')
  SCAN_TMPDIR=$(mktemp -d)
  for i in $(seq 1 254); do
    TARGET_IP="${LOCAL_SUBNET}.${i}"
    [ "$TARGET_IP" = "$POS_WIFI_IP" ] && continue
    ( nc -z -w 1 "$TARGET_IP" 8443 2>/dev/null && echo "$TARGET_IP" > "${SCAN_TMPDIR}/${i}.ip" ) &
  done
  wait
  # Enrich each found host with device name (TLS cert SAN, then reverse DNS)
  for ip_file in "${SCAN_TMPDIR}"/*.ip; do
    [ -f "$ip_file" ] || continue
    TARGET_IP=$(cat "$ip_file")
    CERT_NAME=$(echo "" | timeout 2 openssl s_client -connect "${TARGET_IP}:8443" \
      -servername ignored 2>/dev/null \
      | openssl x509 -noout -ext subjectAltName 2>/dev/null \
      | grep -oE "DNS:[^,]+" | head -1 | cut -d: -f2)
    [ -z "$CERT_NAME" ] && CERT_NAME=$(host "$TARGET_IP" 2>/dev/null \
      | awk '/domain name pointer/ {print $NF}' | head -1 | tr -d '.')
    echo "${TARGET_IP}|${CERT_NAME:-unknown device}" >> "${SCAN_TMPDIR}/results.txt"
  done
  FOUND_ENTRIES=$(sort -t. -k4 -n "${SCAN_TMPDIR}/results.txt" 2>/dev/null)
  rm -rf "$SCAN_TMPDIR"
  ```
  Present found hosts as a table with device names and use `AskUserQuestion` to let
  the developer pick (one option per host + "None / enter manually"). Store the chosen
  IP as `SI_TERMINAL_HOST`, `SI_TERMINAL_PORT = 8443`.

Write the discovered `SI_TERMINAL_HOST`, `SI_TERMINAL_PORT`, and `SI_ADB_FORWARDING`
values to `project-plan.md` so all subsequent gates can read them.

**Android cert deployment check (PLATFORM=android, local mode) — BLOCKING:**
Before running the connectivity verification, confirm cert files are on the Android POS device.
This check MUST be completed and confirmed before reporting Gate SI-2 PASS — proceeding without it
means Gate SI-3 will fail because the Android app cannot present a client certificate.

> **How mTLS works on each side:**
> - **PAX terminal (server):** holds its own server cert (SAN `{serial}.cybs.seclib.io`, signed by
>   Visa Root CA). During the cert exchange, it registered `pos-certificate.pem` as an authorised
>   client cert for `posId`. At connect time it verifies the POS presents this cert.
> - **Android POS (client):** must hold three files: `visa-root-ca.pem` (trust store — validates the
>   terminal's server cert), `pos-certificate.pem` (client identity cert — proves POS to terminal),
>   `pos-private-key.pem` (used during TLS handshake to prove ownership of the cert).
>
> The cert exchange can be run from any machine (Mac, script, etc.) using the ADB tunnel. The
> resulting cert/key pair is cryptographically bound to the terminal's setup code, not to the machine
> that ran the exchange. The Android app must use the SAME cert/key files generated during the exchange.

If `SI_POS_SERIAL` is empty (WiFi mode — POS was not USB-connected during earlier steps, or VPN /
AP isolation was detected blocking network access), ask now:

> The cert exchange is complete and the cert files are on this machine. To push them to the Android
> POS device I need a USB connection to it.
>
> **Please connect the Android POS device to this machine via USB cable**, then run:
> `! adb devices -l`
>
> USB bypasses VPN routing and AP isolation entirely — it is always the right path here.
> What serial does your Android POS device show?

Store the value as `SI_POS_SERIAL` and write it to `project-plan.md`.

> **VPN note:** if VPN was already diagnosed as blocking PAX terminal connectivity, it will also
> block any network-based cert push to the Android device. Do not attempt `adb connect` (TCP/IP ADB)
> — that goes over the network and will be blocked by VPN. USB-cable ADB (`adb -s <serial>`) is the
> only reliable path when VPN is active.

Once `SI_POS_SERIAL` is known, push the cert files to the app-scoped external path:

```bash
PKG=<your.app.package.name>   # e.g. com.example.posapp
DEST="/sdcard/Android/data/${PKG}/files"

adb -s "$SI_POS_SERIAL" push /path/to/visa-root-ca.pem    "${DEST}/visa-root-ca.pem"
adb -s "$SI_POS_SERIAL" push /path/to/pos-certificate.pem "${DEST}/pos-certificate.pem"
adb -s "$SI_POS_SERIAL" push /path/to/pos-private-key.pem "${DEST}/pos-private-key.pem"

# Confirm all three are present and non-empty
adb -s "$SI_POS_SERIAL" shell ls -la \
  "${DEST}/visa-root-ca.pem" "${DEST}/pos-certificate.pem" "${DEST}/pos-private-key.pem"
```

> **Files created (on the Android POS device, not this machine):**
> - `visa-root-ca.pem`, `pos-certificate.pem`, `pos-private-key.pem` — pushed to
>   `${DEST}` on device `<SI_POS_SERIAL>`. These are the mTLS credentials the POS app
>   needs to connect to the terminal; they are cryptographically bound to this terminal's
>   setup code and cannot be reused for a different terminal.

Then confirm the APK is installed. If Gate SI-1 did not install it (because `SI_POS_SERIAL` was
empty at the time), install it now:

```bash
./gradlew assembleDebug
adb -s "$SI_POS_SERIAL" install -r app/build/outputs/apk/debug/app-debug.apk
```

Use `AskUserQuestion`:

> I've pushed the cert files and (re)installed the APK on the Android POS device.
>
> Please launch the app on the POS device. The `copyCertToFilesDir()` helper runs at startup and
> copies files from `context.getExternalFilesDir(null)` to `context.filesDir`. Do you see any
> crash or error on launch?
> - **App launched successfully** → continue
> - **App crashed / permission error** → paste the logcat error and I'll diagnose

**Do NOT proceed past this point — and do NOT report Gate SI-2 PASS — until the developer
confirms the app launched without a cert-loading error.** The `openssl s_client` test below runs
from the dev machine and will pass even if the Android device has no certs; the mTLS failure only
surfaces when the Android app connects.

**Post-mTLS verification (local mode):** After the terminal shows "Device connected", the
gate must run a two-layer connectivity check before reporting PASS:
1. **TLS layer** — `openssl s_client` mTLS handshake → `Verify return code: 0 (ok)`
   *(runs from dev machine — confirms cert is valid; does NOT verify Android app's cert loading)*
2. **Application layer** — WSS echo check sends `StatusRequest` over the live connection
   and expects a `TransactionStatusResponse` back from the AD app

The application-layer check is the gate's final acceptance condition for local mode. It
confirms the POS and terminal can exchange messages end-to-end — the root cause of "POS and
terminal fail to detect each other at the sale step" is almost always the AD app WebSocket
listener not being fully live when the sale request arrives. The echo check catches this
before Gate SI-3 begins.

If the echo check fails, see `troubleshooting.md#si-wss-echo` before proceeding.

---

### SI Gate SI-3: Sale Transaction

**Skip condition:** `gate_SI_3_sale = skip` in `project-plan.md`

**Android pre-gate check (PLATFORM=android, local mode) — runs BEFORE spawning the SI-3 agent:**

Before starting the implementation agent, verify the Android POS device is ready. This prevents
the agent looping on connection errors caused by a missing APK or missing cert files.

1. **Confirm `SI_POS_SERIAL` is set.** If empty (or if VPN / AP isolation was diagnosed earlier
   in the session), ask:
   > "To install the APK and push certs to the Android POS device I need a USB connection to it.
   > Please connect the Android POS device to this machine via USB cable, then run
   > `! adb devices -l` — what serial does it show?"
   > **Do not use network/TCP ADB (`adb connect`) — VPN will block it.**
   Store the value and write to `project-plan.md`.

2. **Confirm APK is installed.** Check if Gate SI-1 installed it:
   ```bash
   adb -s "$SI_POS_SERIAL" shell pm list packages 2>/dev/null | grep <app_package_name>
   ```
   If NOT found, install now:
   ```bash
   ./gradlew assembleDebug
   adb -s "$SI_POS_SERIAL" install -r app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Confirm cert files are on the device.** Check the app-scoped external path first, then fall
   back to `/sdcard/` root:
   ```bash
   PKG=<your.app.package.name>
   DEST="/sdcard/Android/data/${PKG}/files"
   adb -s "$SI_POS_SERIAL" shell ls -la \
     "${DEST}/visa-root-ca.pem" "${DEST}/pos-certificate.pem" "${DEST}/pos-private-key.pem" 2>&1
   ```
   If any file is missing, push from the cert store (`.si-certs/` or wherever Gate SI-2 saved them):
   ```bash
   adb -s "$SI_POS_SERIAL" push .si-certs/visa-root-ca.pem    "${DEST}/visa-root-ca.pem"
   adb -s "$SI_POS_SERIAL" push .si-certs/pos-certificate.pem "${DEST}/pos-certificate.pem"
   adb -s "$SI_POS_SERIAL" push .si-certs/pos-private-key.pem "${DEST}/pos-private-key.pem"
   ```

4. **Confirm app launches without crash** — the `copyCertToFilesDir()` helper copies cert files
   from `context.getExternalFilesDir(null)` (primary) or `/sdcard/` root (fallback) to
   `context.filesDir` at startup. A crash here means the files are missing from both locations.

Do NOT spawn the SI-3 agent until steps 1–4 are confirmed. A transaction attempt without the APK
installed or without the cert files on the device will always fail with a connection or mTLS error —
the pre-flight check inside SI-3 will not be able to diagnose this because it runs from the dev
machine, not the Android device.

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>          # local mode
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>          # local mode
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode
SI_POS_SERIAL=<SI_POS_SERIAL>               # Android POS only — ADB serial for build/deploy
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
```

**Activity:** `activities/act_SI_03_implement-sale-transaction.md`

**Build check:** Verify project compiles and transaction method exists.

**Runtime verification (requires terminal):**

After the build check passes, execute a live test sale to confirm end-to-end functionality
before proceeding to subsequent transaction gates.

**Skip condition for runtime verification:** `SI_TERMINAL_AVAILABLE = no` — defer verification
until the terminal is available. Do NOT proceed to Gate SI-4 until this verification passes
(unless Gate SI-4 is also deferred).

**Procedure:**

1. **Trigger a test sale** using the implemented transaction method:
   - Amount: `1.00` (or smallest testable amount)
   - Currency: `<TRANSACTION_CURRENCY>`
   - Cloud mode: POST to the test endpoint with the terminal serial
   - Local mode: send PaymentRequest over the WSS connection

2. **Prompt the developer** to complete the card interaction on the terminal:
   > A test sale of 1.00 <CURRENCY> has been initiated.
   > Please tap/insert a test card on the terminal to complete the transaction.

3. **Validate the response:**
   - Received a `PaymentResponse` (not `ErrorResponse`)
   - `processingDetails.status` = `APPROVED`
   - `transactionDetails.id` is present and non-empty
   - `transactionDetails.amountDetails.capturedAmount` matches the request

4. **Verify persistence:**
   - Confirm `transactionDetails.id` was stored (check the storage mechanism implemented in SI-3)
   - This stored ID will be used by Gate SI-4 (refund) and Gate SI-7 (lookup)

5. **Report results:**

```
GATE SI-3 RUNTIME VERIFICATION
Status: PASS | FAIL
Sale amount: 1.00 <CURRENCY>
Response type received: PaymentResponse | ErrorResponse | Timeout
Transaction status: APPROVED | DECLINED | ERROR
Transaction ID stored: <id> | NOT STORED
Persistence verified: YES | NO
```

**If verification fails:**
- Display the full error details (response body, status code, `developerDescription` if present)
- Investigate and apply any fix before asking the developer to retry
- Use `AskUserQuestion`:
  - **Retry** — I've applied a fix; please try another test sale on the terminal
  - **Debug** — I need more help investigating the failure
  - **Skip runtime test** — proceed without live verification (mark as DEFERRED)

**Retry / Debug loop — IMPORTANT:**

The verification loop must continue until the developer confirms the transaction succeeded
or explicitly chooses to skip. The workflow MUST NOT exit, report PASS, or update
`project-plan.md` to `done` based on a fix being applied — only on a confirmed successful
transaction response.

```
loop:
  apply fix (if any)
  ask developer to trigger another test sale on the terminal
  wait for developer to confirm result (AskUserQuestion — see below)
  if confirmed APPROVED → exit loop, report PASS
  if confirmed still failing → diagnose next issue, loop again
  if developer chooses Skip → mark DEFERRED, exit loop
```

After asking the developer to trigger the sale, use `AskUserQuestion`:

> I've applied the fix. Please trigger another test sale on the terminal now.
>
> What was the result?
> - **Approved** — transaction went through successfully
> - **Still failing** — I'm seeing another error (describe it)
> - **Skip** — skip the runtime test and continue

- **Approved** → validate the response (steps 3–4 above), update `project-plan.md` status to
  `done`, store `SI_TEST_SALE_TXN_ID`, report PASS
- **Still failing** → display what the developer described, diagnose, apply next fix, loop
- **Skip** → update `project-plan.md` status to `deferred`, note that live verification is
  pending, continue to next gate

**Gate status rule:** `project-plan.md` must NEVER be left with gate SI-3 in `in_progress`
when the agent stops. The only valid terminal states are `done`, `failed`, or `deferred`.

**If verification passes on the first attempt:** Use `AskUserQuestion`:

> The test sale of 1.00 \<CURRENCY\> has been triggered.
>
> Please tap/insert a test card on the terminal now.
>
> What was the result?
> - **Approved** — transaction went through
> - **Declined or error** — describe what happened

Wait for this confirmation before reporting PASS. Do NOT mark the gate `done` until the
developer confirms the transaction was approved.

Store the test transaction ID as `SI_TEST_SALE_TXN_ID` — Gate SI-4 can use this for a
linked refund test if desired.

---

### SI Gate SI-4: Refund Transaction

**Skip condition:** `gate_SI_4_refund = skip | declined` in `project-plan.md`

**Requires:** Gate SI-3 complete with runtime verification passed (needs a real `transactionDetails.id` from a successful sale)

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>          # local mode
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>          # local mode
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode
SI_POS_SERIAL=<SI_POS_SERIAL>               # Android POS only — ADB serial for build/deploy
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
REFUND_TYPES=<REFUND_TYPES>
```

**Activity:** `activities/act_SI_04_implement-refund.md`

**Build check:** Verify project compiles and refund method exists.

---

### SI Gate SI-5: Pre-Authorization & Capture

**Skip condition:** `gate_SI_5_preauth = skip | declined` in `project-plan.md`

**Requires:** Gate SI-3 status = `done` (live sale confirmed — needs a real `transactionDetails.id`; deferred SI-3 blocks this gate)

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>          # local mode
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>          # local mode
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode
SI_POS_SERIAL=<SI_POS_SERIAL>               # Android POS only — ADB serial for build/deploy
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
```

**Activity:** `activities/act_SI_05_implement-pre-auth-capture.md`

**Build check:** Verify project compiles, pre-auth has `capture:false`, transaction ID is persisted.

---

### SI Gate SI-6: Tipping

**Skip condition:** `gate_SI_6_tipping = skip | declined` in `project-plan.md`

**Requires:** Gate SI-3 status = `done` (live sale confirmed). If on-receipt mode: Gate SI-5 complete.

> **Deferred SI-3 does NOT unblock SI-6.** On-reader tipping is a sale with a tip flag — it uses
> the same mTLS WSS connection and the same Android POS app as a plain sale. If SI-3 is `deferred`
> because the POS device is not ready (certs missing, APK not installed), SI-6 will fail for the
> same reason. Do not spawn the SI-6 agent until SI-3 is `done`.

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>          # local mode
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>          # local mode
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode
SI_POS_SERIAL=<SI_POS_SERIAL>               # Android POS only — ADB serial for build/deploy
PLATFORM=<PLATFORM>
TRANSACTION_CURRENCY=<TRANSACTION_CURRENCY>
TIPPING_MODE=<TIPPING_MODE>
```

**Activity:** `activities/act_SI_06_implement-tipping.md`

**Build check:** Verify project compiles and tipping flags present in requests.

---

### SI Gate SI-7: Transaction Management

**Skip condition:** `gate_SI_7_txn_mgmt = skip | declined` in `project-plan.md`

**Requires:** Gate SI-3 status = `done` (live sale confirmed; deferred SI-3 blocks this gate)

**Variables to inject:**

```
SI_MODE=<SI_MODE>
SI_TERMINAL_SERIAL=<SI_TERMINAL_SERIAL>      # cloud mode
SI_TERMINAL_HOST=<SI_TERMINAL_HOST>          # local mode
SI_TERMINAL_PORT=<SI_TERMINAL_PORT>          # local mode
SI_ENVIRONMENT=<SI_ENVIRONMENT>              # cloud mode
SI_POS_SERIAL=<SI_POS_SERIAL>               # Android POS only — ADB serial for build/deploy
PLATFORM=<PLATFORM>
```

**Activity:** `activities/act_SI_07_implement-transaction-management.md`

**Build check:** Verify project compiles, lookup and cancel methods exist.

---

## Step 2 — Summary

After all SI gates complete, present the summary:

```
═══════════════════════════════════════════
  SEMI-INTEGRATED INTEGRATION — COMPLETE
═══════════════════════════════════════════

Integration type: Semi-Integrated
Mode: LOCAL | CLOUD
Platform: <PLATFORM>
Security: mTLS | TLS | Standard HTTPS (cloud)
Currency: <TRANSACTION_CURRENCY>

  Gate SI-1 Project Setup:         PASS | SKIP
  Gate SI-2 Terminal Activation:   PASS | SKIP | DEFERRED
  Gate SI-3 Sale Transaction:      PASS | SKIP | DECLINED
  Gate SI-4 Refund Transaction:    PASS | SKIP | DECLINED
  Gate SI-5 Pre-Auth & Capture:    PASS | SKIP | DECLINED
  Gate SI-6 Tipping:               PASS | SKIP | DECLINED
  Gate SI-7 Transaction Management: PASS | SKIP | DECLINED

What was set up:
* <summary of foundation: client, terminal, security>
* <summary of transactions: sale, refund, pre-auth, tipping as applicable>
* <summary of management: lookup, cancel, timeout recovery>

Next steps:
* Test a live transaction (use test card on terminal)
* Implement production credential management (secure storage)
* Add receipt printing/display using response `receipts` field
* Wire to backend reconciliation if needed
```

---

## Scope Boundaries

The Semi-Integrated path covers:
- HTTP/WSS client configuration (SI-1)
- Terminal activation and connectivity (SI-2)
- Transaction implementation: sale, refund, pre-auth, tipping (SI-3 through SI-6)
- Transaction management: lookup and cancel (SI-7)

It does NOT cover:
- Custom payment UI design (beyond basic wiring)
- Backend reconciliation or accounting integration
- CyberSource account setup or merchant onboarding
- Production credential management
- PCI-DSS compliance beyond basic guidance (no full PAN storage)
