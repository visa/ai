# Visa AI

AI tools, examples, and integrations for the Visa Developer Platform. This repository brings together reusable packages, client examples, an AI agent demo, Claude Code skills, a Gemini CLI extension, and documentation resources for building AI-powered experiences with Visa APIs.

## What's Inside

| Directory / File | Description |
|---|---|
| [`packages/`](#packages) | Reusable npm packages for Visa API integration |
| [`apps/`](#client-usage-examples) | Client usage examples (MCP, VIC API, VDP API) |
| [`vic-agent/`](#agent-demo) | AI agent demonstrating VTS card tokenization and Visa Passkey usage (LangGraph + Next.js) |
| [`skills/`](#skills-claude-code) | AI assistant skills for Claude Code |
| [`gemini-extension.json`](#gemini-cli-extension) | Gemini CLI extension for Visa Documentation MCP Server (VIC + VDP) |

## Packages

Reusable Node.js/TypeScript packages for Visa API integration:

- **[@visa/token-manager](./packages/token-manager)** - JWE token generation and management for MCP authentication
- **[@visa/mcp-client](./packages/mcp-client)** - MCP client for connecting to Visa MCP server with automatic authentication
- **[@visa/api-client](./packages/api-client)** - API clients for VIC and VDP with X-Pay authentication and MLE encryption

## Client Usage Examples

Working examples in the [`apps/`](./apps) directory:

- **[vic-mcp-examples/](./apps/vic-mcp-examples)** - MCP server connection, tool invocation, and workflow orchestration
- **[vic-api-examples/](./apps/vic-api-examples)** - Direct REST API integration with X-Pay authentication and MLE encryption
- **[vdp-api-examples/](./apps/vdp-api-examples)** - VDP connectivity testing with X-Pay authentication

## Agent Demo

The [`vic-agent/`](./vic-agent) directory contains a LangGraphJS-powered AI agent with a Next.js UI that demonstrates VTS card tokenization and Visa Passkey usage:

- Card tokenization via VTS
- Device binding with FIDO authentication
- Step-up verification and Visa Payment Passkey creation
- Assurance data collection and VIC enrollment

See [vic-agent/README.md](./vic-agent/README.md) for setup instructions.

## Skills (Claude Code)

The [`skills/`](./skills) directory contains skills for Claude Code that provide best practices and integration guidance for the Visa Developer Platform.

Install a skill into your project:

```bash
git clone https://github.com/visa/ai.git
cp -r ai/skills/<skill-name> <your-project>/.claude/skills/
```

See [skills/README.md](./skills/README.md) for available skills and installation options.

## Gemini CLI Extension

The [`gemini-extension.json`](./gemini-extension.json) file provides a Gemini CLI extension that connects to the Visa Documentation MCP Server, giving Gemini access to VIC and VDP integration guides and tool definitions.

```bash
gemini extensions install https://github.com/visa/ai
```

For details, visit the [Documentation MCP Server Wiki page](https://github.com/visa/ai/wiki/Documentation-MCP-Server).

## Documentation MCP Server

A dedicated MCP server that provides AI agents with integration guides, examples, and tool definitions for Visa APIs.

**Endpoint:** `https://sandbox.mcp.visa.com/mcp/doc`

- **get-docs** tool for retrieving structured documentation
- Authentication patterns, payload schemas, and best practices
- MCP and direct API integration guides

**Learn more:** [Documentation MCP Server Wiki](https://github.com/visa/mcp/wiki/Documentation-MCP-Server)

## Visa Intelligent Commerce

Visa Intelligent Commerce (VIC) enables AI agents to securely browse, shop, and purchase on behalf of consumers using tokenized digital credentials and integrated APIs.

For a full overview of the platform, how it works, and integration resources, see the [Visa Intelligent Commerce wiki page](https://github.com/visa/ai/wiki/Visa-Intelligent-Commerce).

## Visa APIs and Integration

- [Visa Intelligent Commerce Capabilities](https://developer.visa.com/capabilities/visa-intelligent-commerce) - Overview of VIC features and capabilities
- [Visa Developer Center](https://developer.visa.com) - Main portal for Visa API documentation, credentials, and testing environments
- [Visa MCP Hub](https://mcp.visa.com) - Central hub for Model Context Protocol server information and integration
- [Visa Developer Quick Start Guide](https://developer.visa.com/pages/working-with-visa-apis/visa-developer-quick-start-guide) - Getting started with Visa APIs
- [X-Pay Token Authentication](https://developer.visa.com/pages/working-with-visa-apis/x-pay-token) - Guide for implementing X-Pay token-based authentication
- [Encryption Guide](https://developer.visa.com/pages/encryption_guide) - Message Level Encryption (MLE) documentation and best practices

## Building the Project

This repository uses npm workspaces with Turbo for efficient build orchestration.

### Initial Setup

```bash
# Install all dependencies (one command for everything)
npm install
```

This installs dependencies for all packages and apps at once, using npm workspaces to hoist shared dependencies to the root.

### Build Commands

```bash
# Build all packages and apps
npm run build

# Build only packages (token-manager, mcp-client, api-client)
npm run build:packages

# Build only apps (vic-mcp-examples, vic-api-examples, vdp-api-examples)
npm run build:apps

# Build packages and agent
npm run build:agent

# Clean all build artifacts
npm run clean
```

## License

See LICENSE file for details