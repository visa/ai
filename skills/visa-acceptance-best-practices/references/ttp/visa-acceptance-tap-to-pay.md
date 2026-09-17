# Visa Acceptance Devices — Tap to Pay on Android

This guide drives the complete **Tap to Pay on Android** (Tap to Phone / SoftPOS) SDK integration.
It is the device-integration playbook referenced from the root [`SKILL.md`](../../SKILL.md) under
"Project-Specific Guides".

The workflow and all supporting resources (activities, troubleshooting, constants, scripts) are
bundled in this `references/ttp/` directory alongside this file.

> **Tap to Pay runs on commercial off-the-shelf Android phones** — the merchant's own phone or tablet,
> with no card reader and no dedicated terminal hardware. Its accessory library is
> `io.payworks:mpos.android.taptophone`, and that is the **only** accessory artifact a Tap to Pay
> project declares. An integration for dedicated terminal hardware with an attached card reader is a
> different product, with a different accessory library and its own playbook — route that from the root
> [`SKILL.md`](../../SKILL.md) rather than following this guide.

> **Important — this guide is designed to run from a consumer Android project.**
> All integration work happens in the Android project directory from which the skill is
> invoked. The skill's own files are read-only references.

---

## Step 1 — Establish the two roots

There are **two** directories in play, and they are frequently not the same one.

```bash
# This skill's own directory — read-only reference material. Every path written
# `references/…` in the workflow and activity files is relative to this.
SKILL_DIR=<the directory containing SKILL.md>

# The Gradle root — the nearest ancestor holding settings.gradle[.kts]. Owns gradlew,
# gradle/wrapper/, local.properties and project-plan.md.
GRADLE_ROOT=""
d=$(pwd)
while [ "$d" != "/" ]; do
  if [ -f "$d/settings.gradle.kts" ] || [ -f "$d/settings.gradle" ]; then
    GRADLE_ROOT=$d; break
  fi
  d=$(dirname "$d")
done
echo "GRADLE_ROOT=$GRADLE_ROOT"
```

> **`$(pwd)` is not the Gradle root.** An Android app inside a larger multi-project build is
> normally opened at its own module directory, so `gradlew`, `settings.gradle[.kts]` and
> `local.properties` are all one or more levels *up*. Assuming otherwise makes every gate's build
> check fail on a project that is perfectly well configured — and the failure looks like the gate's
> own edit, not like a path error.

If no `settings.gradle[.kts]` is found in any ancestor, ask the developer where the Gradle build
lives. Do not fall back to `$(pwd)`.

The planning gate resolves the remaining path variables — `ANDROID_MODULE_DIR`,
`GRADLE_MODULE_PATH`, `SOURCE_ROOT` — and records all of them in `project-plan.md`.

---

## Step 2 — Load and execute the workflow

Read the full contents of [`workflow.md`](workflow.md) (the file alongside this guide),
then execute every step it defines.

### Path resolution

| Path in workflow | Resolves to |
|------------------|-------------|
| `references/ttp/activities/act_TTP_*.md` | `$SKILL_DIR/` |
| `references/ttp/constants/ttp-sdk-requirements.md` | `$SKILL_DIR/` |
| `references/ttp/troubleshooting.md` | `$SKILL_DIR/` |
| `project-plan.md` | `$GRADLE_ROOT/project-plan.md` |
| `gradlew`, `gradle/wrapper/gradle-wrapper.properties` | `$GRADLE_ROOT/` |
| `settings.gradle[.kts]`, `local.properties`, `gradle/libs.versions.toml` | `$GRADLE_ROOT/` |
| root `build.gradle[.kts]` | `$GRADLE_ROOT/` |
| `$ANDROID_MODULE_DIR/build.gradle[.kts]`, `proguard-rules.pro` | planning gate — **never assume `app/`** |
| `$SOURCE_ROOT/**` | planning gate — may be `src/main/kotlin`, not `src/main/java` |

The build command is always `"$GRADLE_ROOT/gradlew" "$GRADLE_MODULE_PATH:assembleDebug"`, with its
exit status captured — never a bare `./gradlew assembleDebug`, which fails outright in a submodule
directory and, at a multi-project root, builds every Android module in the repo. Never pipe it into
`tail` either: that replaces Gradle's exit status with the filter's.

> **The path variables are resolved once, by the planning gate, and recorded in `project-plan.md`.**
> Do not hardcode `app/src/main/java/` anywhere. A grep against a non-existent path reports zero
> matches and exit status 1, which is indistinguishable from "checked and clean" — that is how a
> verification step passes on a project it never read. See
> `references/ttp/constants/ttp-sdk-requirements.md` § *Project Path Variables* for the preamble
> every gate runs and the table of which variable owns which file.

---

## Step 3 — Device reality check

Tap to Pay is **more** device-dependent than a terminal integration, because the phone itself must
pass attestation before it can be enrolled. Before promising a working tap, run the device
pre-flight check: perform the checks described in
`references/ttp/constants/ttp-sdk-requirements.md` § *Device pre-flight — write-and-run script* —
either as direct `adb` calls or a scratch script you write yourself this run — and act on the
three-state result exactly as that section describes. This skill ships no executable file for it and
no script to copy; the check exists only as a specification, so "I don't see a script to run" is
never a reason to skip it.

The two requirements that catch every first-time integrator are in direct conflict with each other
and with `adb`: enrollment needs **developer options disabled**, and installing a debug build over
USB needs them **enabled**. There is exactly one workable ordering — see
`references/ttp/constants/ttp-sdk-requirements.md` § *CRITICAL — the adb / developer-options deadlock*.

---

## Acceptance criteria

This guide is complete when the workflow's Step 4 Summary is printed and the final
`$GRADLE_MODULE_PATH:assembleDebug` (after `clean`) passes. On-device enrollment and a real approved tap are
**Gate 10** and require compatible physical hardware — they are reported separately and are never
inferred from a passing build.
