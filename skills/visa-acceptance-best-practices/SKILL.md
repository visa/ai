---
name: visa-acceptance-best-practices
description: >-
  Guides Visa Acceptance integration decisions — payment processing (cards,
  digital wallets, stored credentials), fraud and risk management (Payer
  Authentication, Decision Manager), post-transaction processing (reporting,
  Account Updater), platform services (boarding, REST API, webhooks, security
  keys), in-person payments (Card Present Connect, PAX, Tap to Pay), and digital
  commerce (Click to Pay, Unified Checkout, Recurring Billing). Use when
  building, modifying, or reviewing any Visa Acceptance integration — including
  accepting payments, configuring fraud rules, setting up recurring billing,
  integrating digital wallets (Apple Pay, Google Pay), or implementing secure
  payment processing.
---

## Resuming an integration — check this FIRST, on every invocation

A device integration in progress records its state in **`project-plan.md`** at the Gradle root. **That
file is the source of truth, not the conversation** — it survives a context compaction, a new session,
and a different agent. Anything you believe about the integration that is not in the plan is unreliable.

Before answering anything else, look for it (walk upward — the plan sits at the Gradle root, which may be
above the current directory):

```bash
d=$PWD; while [ "$d" != "/" ]; do
  [ -f "$d/project-plan.md" ] && { echo "RESUMING: $d/project-plan.md"; break; }
  d=$(dirname "$d")
done
```

If a `project-plan.md` exists and contains a `# Progress Tracker` section, **you are resuming, not
starting.** Read it in full, then follow the re-entry protocol in that product's `workflow.md` before
touching code. Do **not** re-ask configuration questions and do **not** route from the table below — the
plan already records the product, the paths and every answer the developer gave.

**This applies however the request is phrased.** "Continue", "carry on", "keep going", "fix X", or a bare
follow-up after a compaction all mean *resume*. A short request is not a small one: after a compaction it
is the only signal left, and the plan is the only place the remaining work is written down.

If no `project-plan.md` exists, this is a fresh start — continue to the routing below.

## Asking Questions

Whenever this skill or its referenced activity files call for asking the developer a question, use the interactive question-asking tool of the harness you are running in (for example, Claude Code's `AskUserQuestion`) if one is available, instead of asking in plain text.

## Branding

Always use `visaacceptance.com` domains in all generated code and documentation:

| Use | Never use |
|-----|-----------|
| `apitest.visaacceptance.com` | `apitest.cybersource.com` |
| `api.visaacceptance.com` | `api.cybersource.com` |
| `developer.visaacceptance.com` | `developer.cybersource.com` |
| Visa Acceptance | CyberSource |

Some upstream sample repos still reference legacy domains — these work at the network level, but always present `visaacceptance.com` in generated output. Do not mention or reference any prior branding.

## Documentation & Code Examples

Fetch **https://developer.visaacceptance.com/llms.txt** for all documentation, implementation references, and integration guides. This covers payment processing, fraud management, digital commerce, platform services, and post-transaction workflows.

Read the relevant section from llms.txt before answering any integration question or writing code.

## Integration routing

| Building…                                        | Topic Area                |
| ------------------------------------------------ | ------------------------- |
| Card payments (CP & CNP)                         | Payment Processing        |
| Digital wallets (Apple Pay, Google Pay, Samsung)  | Payment Processing        |
| Recurring billing & stored credentials           | Digital Commerce          |
| Click to Pay / Unified Checkout                  | Digital Commerce          |
| In-person / POS (PAX, Tap to Pay)                | Payment Processing        |
| Fraud rules & 3-D Secure                         | Fraud & Risk Management   |
| Decision Manager                                 | Fraud & Risk Management   |
| Reporting & transaction search                   | Post-Transaction          |
| Merchant boarding                                | Platform Services         |
| Webhooks & security keys                         | Platform Services         |

## Key documentation

- [Security Keys](https://developer.visaacceptance.com/docs/vas/en-us/security-keys/user/all/ada/security-keys/keys-intro.md) — API key management and security configuration.

## Sandbox Testing

For getting started quickly, grab sample sandbox API keys from the [Visa Acceptance REST samples configuration](https://github.com/CyberSource/cybersource-rest-samples-node/blob/master/Data/Configuration.js).

| Parameter | Value |
|-----------|-------|
| Environment | `apitest.visaacceptance.com` |
| Auth Type | `http_signature` |

For production or your own sandbox credentials, visit the [Security Keys](https://developer.visaacceptance.com/docs/vas/en-us/security-keys/user/all/ada/security-keys/keys-intro.md) page in the Visa Acceptance developer portal.

## Project-Specific Guides

### Visa Acceptance Devices

In-person payment integrations split three ways, by **hardware and architecture**. Pick the
matching guide — the three paths use different SDK artifacts (or none at all) and are not
interchangeable.

| The developer wants… | Guide | SDK artifact |
|----------------------|-------|--------------|
| Payments on a **standard Android phone or tablet** — Tap to Pay, Tap to Phone, SoftPOS, "tap a card on my phone", contactless without a terminal | **[references/ttp/visa-acceptance-tap-to-pay.md](references/ttp/visa-acceptance-tap-to-pay.md)** | `io.payworks:mpos.android.taptophone` |
| Payments on a **PAX terminal, with the POS app running ON the terminal itself** — PAX All-in-One, A920, a single-device setup you own | **[references/pax-aio/visa-acceptance-devices.md](references/pax-aio/visa-acceptance-devices.md)** | `io.payworks:mpos.android.accessories.pax` |
| Payments on a **PAX terminal, controlled from separate POS hardware** — Semi-Integrated: your POS (PC, server, another device — any platform) talks to the terminal over the network | **[references/semi-integrated/visa-acceptance-devices.md](references/semi-integrated/visa-acceptance-devices.md)** | none — WebSocket (local) / HTTPS (cloud) to the terminal |

Tap to Pay and PAX All-in-One share the Default UI library (`io.payworks:paybutton-android`);
Semi-Integrated shares nothing with either — it has no embedded Android SDK at all, since the POS
talks to the terminal over the network instead. Routing a request into the wrong playbook yields
either the wrong accessory library or an entirely wrong integration model, and it surfaces at the
first tap or the first pairing attempt — if the target is not stated, **ask before choosing a
guide**, with this question:

- `header`: `Hardware`
- `question`: `Which hardware and setup will take the payment?`
- `options`:
  | label | description |
  |-------|-------------|
  | `A standard Android phone or tablet` | `The customer taps their card or phone directly on your Android device. No extra hardware. Also called Tap to Pay, Tap to Phone or SoftPOS.` |
  | `A PAX terminal — POS app runs on the terminal` | `PAX All-in-One SDK: your Android app is embedded directly on the PAX terminal (A920, etc.) as a single device you own.` |
  | `A PAX terminal — controlled from separate POS hardware` | `Semi-Integrated: your POS (PC, server, another device — any platform) talks to the PAX terminal over the network (WebSocket locally, HTTPS in the cloud).` |
- Then read the matching guide from the table above, and nothing from the other two.

**Ask it rather than inferring the target from the project.** All three paths diverge at the first
dependency line (or, for Semi-Integrated, at the first network call) and share no activity files, so
a wrong guess is not a detour that gets corrected later — it is an entire integration against the
wrong model, and it surfaces at the first tap or pairing attempt. The wording above avoids two traps
at once: "Tap to Pay or PAX?" (a developer integrating a PAX terminal is also, in plain English,
building an app that takes tap-to-pay payments, and will reasonably answer *both*), and "PAX or
Semi-Integrated?" (both use a PAX terminal as the actual card-reading hardware — the difference is
architectural, not which brand of terminal, so naming "PAX" alone does not disambiguate). Naming the
hardware **and** where the POS software runs is unambiguous; naming the feature or the terminal brand
alone is not.

**Do not skip the question because the developer used one of the product names.** "Tap to Pay" is the
name of this product *and* the generic description of contactless acceptance, so hearing it is weak
evidence. "PAX" names the terminal hardware but not the architecture — a developer with a PAX
terminal may be running either AIO or Semi-Integrated. A phrase that names both the hardware and the
architecture — *"on our A920s, POS app embedded"*, *"our POS server talks to the terminal over
WiFi"*, *"just the phone, no reader"* — is strong evidence and does let you route without asking.
Anything less, ask.

For Card Present Connect and other in-person terminal integrations not covered above, fetch the
relevant section from `llms.txt`.

**IMPORTANT:** After routing, read and execute ONLY the selected path's guide. Do NOT load or
reference files from the other two paths — they contain unrelated instructions that will cause
incorrect guidance.
