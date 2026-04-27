# Visa Developer Platform AI Skills

A set of skills and instructions for AI agents integrating with Visa APIs.

## Available Skills

### visa-best-practices

Best practices and integration guide for the Visa Developer Platform (VDP) and Visa Intelligent Commerce (VIC).

**Use when:**

- Building or debugging integrations with Visa APIs
- Setting up authentication (X-Pay Token, Two-Way SSL / Mutual TLS)
- Working with Message Level Encryption (MLE/JWE)
- Managing credentials and environment configuration (Sandbox, Certification, Production)
- Integrating VIC agent commerce workflows (card enrollment, purchase instructions, payment credentials)
- Referencing VDP, VIC, X-Pay Token, or Visa MLE

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
