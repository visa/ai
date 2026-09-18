---
name: affixio-action-governance
description: >
  Host-side AffixIO ACTION allow/deny for Visa Intelligent Commerce agent spend
  and privileged tool use. Trigger keywords: AffixIO, affixio, ACTION attestation,
  agent spend governance, mcpToolGate, agenticPay, before checkout, before pay,
  privileged MCP tool, host-side signed yes/no.
---

# AffixIO ACTION governance for VIC agents

Use AffixIO when an agent is about to spend or call a privileged tool. Prove allow or deny on the host first. Keep PII on the host. AffixIO is not person, age, or KYC verification.

## When to use

| Situation | Use AffixIO |
|-----------|-------------|
| Agent checkout / purchase instruction about to run | Yes, before pay |
| Privileged MCP tool that creates cost or moves money | Yes, before the tool runs |
| Catalog browse / search only | No |
| Identity or age checks | No (out of scope) |

## Install

```bash
npm i affixio
# optional local MCP wrapper
npm i @affixio/mcp@0.1.0
```

Onboarding: https://hub.affix-io.com/onboarding/
Product: https://www.affix-io.com/

## Minimal gate before spend

```js
import { AffixSDK, agenticPay, shoppingAgentPolicy } from "affixio";

const sdk = new AffixSDK({ apiKey: process.env.AFFIX_API_KEY });

const policy = shoppingAgentPolicy({
  currency: "USD",
  maxPerAction: 75,
  categories: ["retail"],
});

const result = await agenticPay({
  sdk,
  policy,
  agentId: "agent://vic-shopper/session",
  merchant: "merchant.example",
  amount: 40,
  currency: "USD",
  category: "retail",
  rail: "checkout",
});

if (!result.allowed) {
  throw new Error(result.reason || "spend denied");
}
```

## Gate a privileged MCP tool

```js
import { AffixSDK, mcpToolGate, spendingPolicy } from "affixio";

const sdk = new AffixSDK({ apiKey: process.env.AFFIX_API_KEY });
const policy = spendingPolicy()
  .currency("USD")
  .maxPerAction(75);

const receipt = await mcpToolGate({
  sdk,
  policy,
  tool: "checkout_cart",
  agentId: "agent://vic-shopper/session",
  amount: 40,
  currency: "USD",
});

if (!receipt.allowed) {
  throw new Error(receipt.reason || "tool denied");
}
```

## Placement in Visa AI / VIC

1. After the agent has a clear purchase intent and amount.
2. Before VIC purchase instruction, payment credential use, or merchant `checkout_cart`.
3. Enforce the AffixIO result in your app. Visa still moves the money. AffixIO only answers allow or deny with host-side proof.

## References

- [Host-side ACTION model](references/host-side-action.md)
- AffixIO: https://www.affix-io.com/
- Hub onboarding: https://hub.affix-io.com/onboarding/
- npm `affixio`: https://www.npmjs.com/package/affixio
- npm `@affixio/mcp@0.1.0`: https://www.npmjs.com/package/@affixio/mcp