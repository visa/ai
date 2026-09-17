# Visa API AI Skills

A set of skills and instructions for AI agents integrating with Visa APIs.

## Available Skills

### visa-best-practices

Best practices and integration guide for the Visa Developer Platform (VDP) and Visa Intelligent Commerce (VIC).

**Use when:**

- Building or debugging integrations with VDP APIs
- Setting up authentication (X-Pay Token, Two-Way SSL / Mutual TLS)
- Working with Message Level Encryption (MLE/JWE)
- Managing credentials and environment configuration (Sandbox, Certification, Production)
- Integrating VIC agent commerce workflows (card enrollment, purchase instructions, payment credentials)
- Referencing VDP, VIC, X-Pay Token, or Visa MLE

### visa-acceptance-best-practices

Best practices and integration guide for Visa Acceptance payment processing. Two fully automated, end-to-end PAX terminal integration pathways are supported:

- **PAX All-in-One (AIO)** — The POS app runs directly on the PAX terminal as an Android APK. The SDK is embedded in your Android project. Best when you own the terminal hardware and want a single-device solution. 10 build-gated activities.
- **PAX Semi-Integrated (SI)** — Your POS system (any platform — Java, Node.js, Python, .NET, Go) communicates with the PAX terminal over the network via WebSocket (local mode) or HTTPS (cloud mode). Best when the POS runs on separate hardware. 7 build-gated activities.

The skill reads from [developer.visaacceptance.com/llms.txt](https://developer.visaacceptance.com/llms.txt) as the primary documentation source at integration time. Local reference files only contain corrections and supplements not available in the official documentation.

**Use when:**

- Accepting payments (card present, card not present, digital wallets)
- Configuring fraud and risk management (Payer Authentication, Decision Manager)
- Setting up recurring billing or stored credentials
- Integrating in-person payments (PAX, Tap to Pay, Card Present Connect)
- Working with digital commerce (Click to Pay, Unified Checkout)
- Managing platform services (boarding, webhooks, security keys)

## Installation

You can install the skills repository using NPX:

```bash
npx skills add visa/ai
```

Or clone the repository manually:

```bash
git clone https://github.com/visa/ai.git
```

**Project-level** (available in a single project):

```bash
cp -r ai/skills/<skill-name> <your-project>/.claude/skills/
```

**Global** (available across all projects):

```bash
cp -r ai/skills/<skill-name> ~/.claude/skills/
```
