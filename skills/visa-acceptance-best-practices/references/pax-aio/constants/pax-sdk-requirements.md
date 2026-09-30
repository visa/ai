# PAX All-in-One SDK — Version Requirements

> **Single source of truth** for all version constraints enforced by the integration skill.
> All workflow logic, activity files, and troubleshooting documents reference this file
> instead of hardcoding version numbers.
>
> When a requirement changes, update ONLY this file — all other documents inherit.

---

## Minimum Requirements

These are the **absolute minimums** for the PAX SDK to compile and function. If the
project's current version is **at or above** the minimum, it is left unchanged.

| Constant | Value | Reason |
|----------|-------|--------|
| `MIN_AGP_VERSION` | `8.6.0` | PAX SDK transitively depends on Compose 1.9.0, which requires AGP 8.6.0+ |
| `MIN_KOTLIN_VERSION` | `2.1.0` | Required by SDK for Kotlin metadata compatibility |
| `REQUIRED_JAVA_VERSION` | `17` | PAX SDK compiled with Java 17 class files (major version 61) |
| `MIN_SDK_VERSION` | `25` | PAX A920 hardware runs Android 7.1 (API 25); lower minSdk causes manifest merger failure |
| `MIN_GRADLE_VERSION` | `8.9` | Required only when AGP >= 8.7.0 |

## Conditional Requirements

These apply only when certain project characteristics are detected.

| Constant | Value | Condition | Reason |
|----------|-------|-----------|--------|
| `RECOMMENDED_AGP_VERSION` | `8.7.0` | Project uses `compileSdk >= 36` | AGP 8.6.0 has a compileSdk validation bug with API 36+; 8.7.0 fixes it |
| `RECOMMENDED_GRADLE_VERSION` | `8.9` | AGP is upgraded to 8.7.0+ | AGP 8.7.0 requires Gradle 8.9+ |

## Version Comparison Rules

### Never downgrade

If the project already exceeds a minimum, **do not lower it**:

| Component | Project has | Minimum | Action |
|-----------|------------|---------|--------|
| AGP | 8.8.0 | 8.6.0 | Keep 8.8.0 |
| Java | 21 | 17 | Keep 21 |
| minSdk | 28 | 25 | Keep 28 |
| Kotlin | 2.2.0 | 2.1.0 | Keep 2.2.0 |
| Gradle | 8.12 | 8.9 | Keep 8.12 |

### Upgrade only when required

If the project is **below** a minimum, flag it as a required upgrade:

| Component | Project has | Minimum | Action |
|-----------|------------|---------|--------|
| AGP | 7.4.0 | 8.6.0 | Upgrade to 8.6.0 (or 8.7.0 if compileSdk >= 36) |
| Java | 11 | 17 | Upgrade to 17 |
| minSdk | 21 | 25 | Upgrade to 25 |
| Kotlin | 1.9.0 | 2.1.0 | Upgrade to 2.1.0 |
| Gradle | 8.4 | 8.9 | Upgrade to 8.9 (only if AGP will be >= 8.7.0) |

### compileSdk-triggered AGP recommendation

```
if compileSdk >= 36 AND agp_version < 8.7.0:
    recommend AGP upgrade to RECOMMENDED_AGP_VERSION (8.7.0)
    if AGP upgraded to 8.7.0 AND gradle_version < 8.9:
        also require Gradle upgrade to RECOMMENDED_GRADLE_VERSION (8.9)
```

If `gradle.properties` does not exist at the project root, create it with this entry before running the first build.

## Required Upgrade Consent Protocol

**CRITICAL RULE:** No version change — of any kind — may be applied without the
developer's explicit approval. This applies to ALL components: AGP, Kotlin, Gradle
wrapper, Java, minSdk, compileSdk, or any other version in the build configuration.
Even if the skill knows the correct fix, it MUST ask first.

When the planning agent detects that upgrades are needed, the workflow must:

1. Present a **per-component** table of required upgrades with:
   - Current version detected in the project
   - Required minimum for the PAX SDK
   - Proposed target version
   - Reason for the upgrade
2. Ask the developer for **explicit approval of each upgrade**. The developer may:
   - Approve all upgrades
   - Approve some and decline others (with the understanding that declining a hard
     requirement will block integration)
   - Decline all and cancel integration
3. If a hard requirement is declined, stop with a clear message:
   > PAX SDK integration cannot proceed without the following upgrades:
   > - [list of declined hard-requirement upgrades with reasons]
   >
   > These are hard requirements of the SDK — there is no workaround.
4. **Never silently apply version changes** — not during connectivity pre-checks,
   not during gate execution, not as a build-error fix. Always surface the proposed
   change and get developer consent first.

See `workflow.md` Step 1b for the full approval flow.

---

## How to Reference These Constants

In workflow, activity, and troubleshooting documents, refer to this file:

```
See `references/pax-aio/constants/pax-sdk-requirements.md` for current minimum versions.
```

Do NOT hardcode version numbers in implementation logic. Instead, instruct agents to:
1. Read the constants defined above in this file
2. Compare project versions against the constants
3. Apply the version comparison rules above
