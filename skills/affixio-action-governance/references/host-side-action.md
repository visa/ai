# Host-side ACTION model

AffixIO signs a yes/no ACTION decision on the host.

## Rules of thumb

- PII stays on the host. Do not send card PAN, CVV, government ID, or age attributes to AffixIO for this flow.
- Scope is agentic commerce: spend limits, merchant policy, tool permission.
- Fail closed: if the gate errors or returns deny, do not call pay or the privileged tool.
- Keep the receipt / proof id for support and audit. Do not treat it as a payment authorization.

## Suggested VIC checkpoints

1. Before `initiate-purchase-instruction` / agentic checkout.
2. Before merchant MCP `checkout_cart`.
3. Before any paid MCP tool that creates cost.

## Optional local MCP

`@affixio/mcp@0.1.0` exposes AffixIO as a local stdio MCP so agents can request an ACTION attestation without shipping PII off-host.