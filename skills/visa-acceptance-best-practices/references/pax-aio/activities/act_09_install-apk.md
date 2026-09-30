# Activity 3: Install APK on PAX Terminal

Install an APK from the developer's laptop onto a connected PAX Android terminal over USB using inline adb commands adapted to the host operating system.

## PAX A920 USB Installation Notes

<!-- REC-03 -->
The PAX A920 is a large-APK device (builds are typically 56–60 MB). Standard `adb install` has
known reliability issues on this hardware. Follow these rules without exception:

1. **Use two-step install** — push the APK to `/data/local/tmp/` first, then install via `pm install`.
   Direct `adb install` is unreliable for large APKs on the A920.
2. **120-second timeout** — if `pm install` does not complete within 120 s, kill it and retry.
3. **Never call `adb root`** — on the PAX A920, `adb root` permanently disconnects the device
   over USB until a physical re-plug. Any step that would issue `adb root` must be skipped or
   replaced. If `adb root` is accidentally called, instruct the user to physically unplug and
   replug the device before continuing.
4. **Background install detection** — if the USB connection drops mid-install, run
   `adb shell pm list packages | grep <pkg>` to detect whether the install completed in the
   background before concluding that it failed.
5. **180-second post-install reconnect poll** — after installation, wait up to 180 s for the
   device to come back online. The A920 re-enumerates its USB connection after install; 60 s is
   insufficient.

## Supported scope

- APK installation over USB
- User-provided APK file path
- User-selected host operating system
- Platform-adapted adb commands for Windows, macOS, and Linux
- Fallback OS detection when the user is not sure
- Android device detection
- USB debugging readiness checks
- Post-install app launch and crash verification
- Install failure reporting
- Remediation guidance for common installation issues

## Required inputs

Always collect the following before installation, **in this exact order**:

1. **adb availability**
2. **APK file path**
3. **Host operating system**
   - Windows
   - macOS
   - Linux
   - Not sure

Do not skip these inputs. Do not ask for multiple inputs at the same time.

## Interaction flow

Follow this exact sequence every time:

### Step 1 — Check for adb

Use the `AskUserQuestion` tool to ask the user whether `adb` is installed on their machine. Present these options:

- Yes
- No
- Not sure

- If the user selects **Yes**, proceed to Step 2.
- If the user selects **No**, share the installation steps below and ask them to re-run the skill after installing:

```text
adb is required for this skill. Install it using one of the following methods:

  macOS:     brew install android-platform-tools
  Linux:     sudo apt install android-tools-adb
  Windows:   winget install Google.PlatformTools
             or: choco install adb

Alternatively, install Android Studio (which includes adb) or download
platform-tools from https://developer.android.com/tools/releases/platform-tools

After installing, re-run this activity.
```

Do not proceed further if the user does not have adb installed.

- If the user selects **Not sure**, proceed to Step 2. The adb resolution step (4b) will attempt to locate adb on the PATH and in common installation directories.

### Step 2 — Ask for the APK file path

Ask the user for the APK file path using a plain text message. Do not use the `AskUserQuestion` tool for this input — file paths are free-text.

```text
Please provide the full path to the APK file you want to install.
```

Wait for the user's response before proceeding.

- If the user does not provide a path, ask again.
- If the provided path does not exist on disk, stop and report that the APK file could not be found.

### Step 3 — Ask for the operating system

After receiving a valid APK path, use the `AskUserQuestion` tool to ask the user for their operating system:

- Windows
- macOS
- Linux
- Not sure

- If the user selects **Not sure**, use available environment information (e.g., `uname -s` on macOS/Linux or `$env:OS` on Windows) to determine the OS.
- If the OS still cannot be determined, stop and ask the user for clarification.

### Step 3b — Install APK

After collecting all inputs, print a summary before executing:

```text
Starting APK installation...
  APK Path : <apk-path>
  Target OS: <os>
```

Then execute sub-steps 4a through 4h from [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Installing Your Application on Debug PAX Devices section).
Each sub-step provides both a **macOS / Linux** (bash) block and a **Windows (PowerShell)** block.
Execute **only the block matching the OS** from Step 3.

## OS detection fallback

If the user selects **Not sure**, determine the operating system using available environment information. On macOS/Linux, run `uname -s`; on Windows, check `$env:OS`. After determining the OS, execute the matching platform command blocks from Step 4 and continue normally.

## Post-install verification

<!-- REC-03 -->
After a successful installation, the inline steps attempt to:

1. **Wait for device reconnect (up to 180 s)** — the PAX A920 re-enumerates its USB connection
   after install (Step 4f). Poll `adb devices` every 5 s for up to 180 s before concluding the device is lost.
2. **Resolve the package name** from the APK using `aapt2` (checked on `PATH` first, then in `ANDROID_HOME/build-tools`, then `aapt` as a fallback) (Step 4g).
3. **Launch the app** on the device using `adb shell monkey` (Step 4h).
4. **Wait 2-3 seconds**, then check if the app process is still running using `adb shell pidof` (Step 4h).

If `aapt2` is not available, the verification step is skipped gracefully with a warning and a tip to set `ANDROID_HOME`.

## Success response

On success, respond clearly with:

- The APK was installed successfully
- Which device was targeted, if known
- Whether the app launched and is running, or if verification was skipped
- Optional next step, such as testing the app or checking logs

## Failure handling

When installation fails, preserve the raw adb failure output when possible and explain likely causes.

See `references/pax-aio/troubleshooting.md#install-apk` for all APK installation failure scenarios (adb errors, device states, PAX A920 quirks, install conflicts).

## Response style

Responses should be:

- Concise
- Action-oriented
- Explicit about what failed
- Explicit about what the developer should do next

Do not provide speculative fixes when the adb error already indicates the likely cause.

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 9 of the PAX SDK integration: APK installation on PAX terminal.

Working directory: <project root>

## Context

All implementation gates (1–8) are complete. The APK you are about to build and install
contains the complete PAX SDK integration.

## Inputs

Read: `references/pax-aio/activities/act_09_install-apk.md`
Read: [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Installing Your Application on Debug PAX Devices section)

## Your task

Build the final APK and install it on the connected PAX terminal.
Follow the activity file for the overall flow (Steps 1–3: inputs collection).
For Step 4 (install sub-steps 4a–4h), follow the commands in [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) (Installing Your Application on Debug PAX Devices section).

## Required report

```
GATE 9 REPORT
Status: PASS | FAIL | SKIPPED (no terminal)
APK path: <path>
APK size: <MB>
Device serial: <serial>
App launched: YES | NO
PID after launch: <pid or "not found">
```
```
