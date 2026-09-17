# Visa Acceptance Devices — PAX All-in-One SDK integration

This guide drives the complete CyberSource PAX All-in-One SDK integration on Android. It is the device-integration playbook referenced from the root [`SKILL.md`](../../SKILL.md) under "Project-Specific Guides".

The workflow and all supporting resources (activities, troubleshooting, constants) are bundled in this `references/` directory alongside this file.

> **This guide is for dedicated PAX terminal hardware** — a PAX All-in-One or A920, or a PAX card
> reader attached to an Android device. Its accessory library is
> `io.payworks:mpos.android.accessories.pax`, and that is the **only** accessory artifact a PAX
> project declares.
>
> **Stop here if the payment is taken on the merchant's own phone or tablet with no reader
> attached.** That is Tap to Pay on Android (Tap to Phone / SoftPOS), a different product with a
> different accessory library and its own playbook — route it from the root
> [`SKILL.md`](../../SKILL.md) rather than following this guide. The two share only the Default UI
> library, so a PAX integration on phone-only hardware is not a near miss; it declares an accessory
> that is not present and fails at the first tap. Note that "tap to pay" is also the everyday
> description of contactless acceptance *on a terminal* — so hearing the phrase is not evidence
> either way. The hardware is: if there is no reader, this is the wrong guide.

> **Important — this guide is designed to run from a consumer Android project.**
> All integration work happens in the Android project directory from which the skill is
> invoked. The skill's own files are read-only references.

---

## Step 1 — Establish the Android project root

Your **working directory for all implementation work** is the Android project — the
directory from which this skill was invoked:

```bash
ANDROID_PROJECT_ROOT=$(pwd)
```

---

## Step 2 — Load and execute the workflow

Read the full contents of [`workflow.md`](workflow.md) (the file alongside this guide),
then execute every step it defines.

### Path resolution

All paths in the workflow prefixed with `references/` are relative to this skill's
directory. Project artefacts are relative to `ANDROID_PROJECT_ROOT`.

| Path in workflow | Resolves to |
|----------------------|-------------|
| `references/pax-aio/activities/act_*.md` | Skill directory |
| `references/pax-aio/constants/pax-sdk-requirements.md` | Skill directory |
| `references/pax-aio/troubleshooting.md` | Skill directory |
| `project-plan.md` | `$ANDROID_PROJECT_ROOT/project-plan.md` |
| `app/build.gradle[.kts]` | `$ANDROID_PROJECT_ROOT/` |
| `settings.gradle[.kts]` | `$ANDROID_PROJECT_ROOT/` |
| `app/src/main/` | `$ANDROID_PROJECT_ROOT/app/src/main/` |
| `local.properties` | `$ANDROID_PROJECT_ROOT/local.properties` |
| `gradle/wrapper/gradle-wrapper.properties` | `$ANDROID_PROJECT_ROOT/` |

---

## Acceptance criteria

This guide is complete when the workflow's Step 4 Summary is printed and the final
`./gradlew clean assembleDebug` passes.
