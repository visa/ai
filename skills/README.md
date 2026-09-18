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

Best practices and integration guide for Visa Acceptance payment processing.

**Use when:**

- Accepting payments (card present, card not present, digital wallets)
- Configuring fraud and risk management (Payer Authentication, Decision Manager)
- Setting up recurring billing or stored credentials
- Integrating in-person payments (PAX, Tap to Pay, Card Present Connect)
- Working with digital commerce (Click to Pay, Unified Checkout)
- Managing platform services (boarding, webhooks, security keys)

### affixio-action-governance

Host-side AffixIO ACTION allow/deny for agent spend and privileged tool use in VIC flows.

**Use when:**

- An agent is about to check out or create a purchase instruction
- You need a signed yes/no before pay or a privileged MCP tool
- You want PII to stay on the host (not person/age/KYC)

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