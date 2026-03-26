# Visa Intelligent Commerce (VIC) Integration Guide

## Overview

VIC enables AI agents to facilitate secure commerce on behalf of consumers. It combines five integrated services:

| Service | Purpose |
|---------|---------|
| **Tokenization** | Replace PANs with secure tokens for payment processing |
| **Authentication** | Verify cardholder identity via step-up challenges and Passkeys |
| **Payment Instructions** | Define how, when, and where payments should be made |
| **Signals** | Confirm transaction events and update merchant status |
| **Personalization** | Access cardholder preferences via Visa Data Tokens |

## API Groups

| API Group | Capabilities | Documentation |
|-----------|--------------|---------------|
| **VTS (Visa Token Service)** | Tokenization, Card Enrollment, Authentication | https://developer.visa.com/capabilities/vts |
| **VIC APIs** | Purchase Instructions, Payment Credentials, Signals | https://developer.visa.com/capabilities/visa-intelligent-commerce |
| **Visa Data Tokens** | Cardholder Personalization Data | https://developer.visa.com/capabilities/visa-data-tokens |

## Integration Approaches

Choose based on your architecture. Fetch **https://sandbox.mcp.visa.com/mcp/doc/llms.txt** for code examples and implementation details for each approach.

- **MCP-Based**: StreamableHTTP transport for AI agent systems using Model Context Protocol.
- **Direct API**: REST calls with X-Pay auth and MLE encryption for traditional backend services.
- **VDP**: Hello World API for initial connectivity verification before starting VIC integration.

## Core Workflows

All workflow implementations with code examples are available via llms.txt. Key workflows:

- **Agent Onboarding** — Register agent with Visa, configure credentials, verify connectivity
- **Card Enrollment** — Enroll payment card with step-up verification and optional Passkey setup
- **Purchase Instructions** — Create, update, or cancel standing payment instructions with cardholder authentication
- **Payment Credentials** — Retrieve tokenized payment data after validating against instruction parameters
- **Transaction Signals** — Report transaction outcomes (completed, failed, delivery confirmed) to Visa