---
name: visa-best-practices
description: >
  Best practices and integration guide for the Visa Developer Platform (VDP), Visa Intelligent Commerce (VIC),
  and the Machine Payments Protocol (MPP). Use when building or debugging integrations with Visa APIs, including:
  authentication setup (X-Pay Token, Two-Way SSL / Mutual TLS), Message Level Encryption (MLE/JWE),
  credential management, environment configuration (Sandbox, Certification, Production),
  VIC agent commerce workflows (card enrollment, purchase instructions, payment credentials),
  MCP-based Visa API integration, or MPP card charge flows (HTTP 402 payment challenges, encrypted network tokens).
  Also use when the user references Visa Developer, VDP, VIC, X-Pay Token, Visa MLE, MPP, Machine Payments Protocol,
  HTTP 402 payments, or payment authentication.
---

# Visa Developer Platform Integration Guide

## Code Examples & Starter Kit

Fetch **https://sandbox.mcp.visa.com/mcp/doc/llms.txt** for all code examples, implementation references, and direct links to source code. This covers MCP client integration, direct API client, VDP connectivity, authentication implementations, VIC tools/workflows, and payload builders.

## Official Documentation

| Resource | URL |
|----------|-----|
| Developer Center | https://developer.visa.com |
| Quick Start Guide | https://developer.visa.com/pages/working-with-visa-apis/visa-developer-quick-start-guide |
| X-Pay Token Guide | https://developer.visa.com/pages/working-with-visa-apis/x-pay-token |
| Two-Way SSL Guide | https://developer.visa.com/pages/working-with-visa-apis/two-way-ssl |
| MLE / Encryption Guide | https://developer.visa.com/pages/encryption_guide |
| VIC Capabilities | https://developer.visa.com/capabilities/visa-intelligent-commerce |

## Authentication

VDP supports two authentication methods. See the official guides and llms.txt for implementation code.

- **X-Pay Token**: HMAC-SHA256 based. Preferred for most integrations. See [X-Pay Token Guide](https://developer.visa.com/pages/working-with-visa-apis/x-pay-token).
- **Two-Way SSL (Mutual TLS)**: Certificate-based mutual authentication. See [Two-Way SSL Guide](https://developer.visa.com/pages/working-with-visa-apis/two-way-ssl).

**Key gotcha — Resource path differs for VIC APIs:**

| Product Type | Resource Path for X-Pay Token |
|--------------|-------------------------------|
| Standard APIs | Full path after domain (e.g., `/vdp/helloworld`) |
| VIC APIs | Path **excluding** context prefix (e.g., `/vic/v1/...` becomes `/v1/...`) |

## Message Level Encryption (MLE)

MLE provides end-to-end payload encryption using JWE. See the [Encryption Guide](https://developer.visa.com/pages/encryption_guide) and llms.txt for implementation code.

- Check each API's enforcement level (Mandatory / Optional / Not Applicable) in the API docs or VDP Dashboard.
- MLE requires two certificate pairs: Visa's server key (for encrypting requests) and your client key (for encrypting responses).

**Key gotchas:**

- Include `keyId` as an HTTP header in all MLE-enabled API calls
- Up to 3 active Key-IDs per project (for rotation)
- Key-ID changes when certificates are renewed — update your config accordingly
- CSR must include the Key-ID as the UID field

## Environments

| Environment | B2B URL | B2C URL |
|-------------|---------|---------|
| Sandbox | `https://sandbox.api.visa.com/` | `https://sandbox.webapi.visa.com/` |
| Certification | `https://cert.api.visa.com/` | - |
| Production | `https://api.visa.com/` | - |

## Credential Management Best Practices

- Monitor certificate expiration dates in VDP Dashboard — renew before expiry
- New certificates require new Key-IDs for MLE
- Maintain 2-3 active credential sets for seamless rotation
- Always test credential rotation in Sandbox/Certification before Production
- Revoke old credentials only after successful migration

## Project-Specific Guides

### Visa Intelligent Commerce (VIC)

For VIC integration (card enrollment, purchase instructions, payment credentials, agent commerce workflows), see:

**[references/visa-intelligent-commerce.md](references/visa-intelligent-commerce.md)**

### Machine Payments Protocol (MPP)

For MPP card charge integration (HTTP 402 payment challenges, encrypted network token credentials, Client Enabler interface, receipts), see:

**[references/machine-payments-protocol.md](references/machine-payments-protocol.md)**