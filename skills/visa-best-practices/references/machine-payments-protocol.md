# Machine Payments Protocol (MPP) — Card Charge Integration Guide

## Overview

MPP is the open standard for machine-to-machine payments via HTTP 402. It defines an extensible challenge–credential–receipt flow that works with any payment network. The **card** payment method with **charge** intent enables AI agents to make one-time card payments using encrypted network tokens — the agent never handles raw card data.

## Documentation & Resources

| Resource | URL |
|----------|-----|
| MPP Card Payment Method | https://mpp.dev/payment-methods/card |
| MPP Card Charge Intent | https://mpp.dev/payment-methods/card/charge |
| Specification | https://paymentauth.org/draft-card-charge-00.txt |

## How It Works

1. Client requests a resource
2. Server responds **402 Payment Required** with a challenge (amount, currency, accepted networks, encryption key)
3. Client forwards challenge context to its Client Enabler (e.g., Visa VIC)
4. CE provisions a network token, encrypts it with the server's key, returns the credential
5. Client retries the request with `Authorization: Payment` header containing the encrypted credential
6. Server forwards credential to its Server Enabler (PSP/processor)
7. Server Enabler decrypts and processes the payment
8. Server returns **200** with `Payment-Receipt` header and the resource

## Compatibility

### MPP Card vs. Processor-Specific MPP Payment Methods

MPP supports multiple payment methods (card, stablecoin, etc.). Some processors have launched their own processor-specific MPP payment methods that require special account access, signup forms, or program enrollment. **Do not confuse these with the `card` payment method.**

The MPP `card` method is processor-agnostic and works today with any processor that supports network tokens — no special signup, program enrollment, or proprietary integration required. Production MPP card transactions have been completed on major processors without any special access or settings. If your processor's documentation has a signup form or "request access" step for MPP, that is for their own proprietary MPP payment method, not for `card`.

**Key distinction:**
- **Processor-specific MPP methods** (e.g., a processor's own stablecoin/wallet method) — may require special access or enrollment with that processor
- **MPP `card` method** — works today on any processor that handles network tokens. No special settings, no signup, no new API access needed.

### Server Enabler (merchant/server side)

Works with any payment processor that supports network tokens today. You implement the Server Enabler yourself: decrypt the JWE, then call your payment processor's existing APIs to submit the network token + cryptogram authorization. The MPP SDKs handle the protocol mechanics (challenge issuance, credential parsing, receipt generation), but the actual payment processing call is your code talking to your processor.

### Client Enabler (agent/client side)

Requires a payment processor or vault provider that supports the MPP Client Enabler interface — provisioning network tokens and encrypting them per the spec. This is where processor adoption is needed.

## Key Concepts

| Term | Description |
|------|-------------|
| **Client Enabler (CE)** | Provisions network tokens, encrypts them with the server's key, returns credentials. Requires processor support for this interface. |
| **Server Enabler** | PSP/processor that decrypts and processes the encrypted token credential. Works with existing network token processing APIs. |
| **Token Service Provider (TSP)** | Issues network tokens and cryptograms (e.g., Visa Token Service) |
| **Network Token** | Card-network-issued token; never exposed to client or server directly |
| **Cryptogram** | One-time value generated with a network token to authenticate a transaction |

## Key Gotchas

- **Amount format**: Amounts are strings in smallest currency unit (e.g., `"4999"` = $49.99), not decimals
- **Currency**: ISO 4217 lowercase (e.g., `"usd"`, not `"USD"`)
- **Encryption key**: Must be RSA with `alg: "RSA-OAEP-256"` and `use: "enc"` — CEs reject anything else
- **No compression**: JWE must not include `zip` field (prevents information leakage attacks)
- **Replay protection**: Each credential is single-use per challenge ID; servers must reject replayed credentials
- **Challenge expiry**: Store challenge state with TTL >= expiry + 5 minutes; challenge IDs need 128+ bits of entropy

## Integration with Visa as Client Enabler

Your existing payment processor can act as a Client Enabler for MPP card charge flows with a VIC integration:

1. Agent enrolls a card via the processor's VIC integration (tokenization + authentication)
2. When agent receives a 402 challenge, it forwards the challenge context to the processor
3. Processor provisions a Visa network token and cryptogram via VTS
4. Processor encrypts the token payload with the server's encryption key
5. Agent receives the credential and submits it to the server

This leverages VIC's VTS tokenization and authentication infrastructure through your processor, now applied to the standardized MPP payment flow.
