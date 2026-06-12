import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";
import { encryptWithSecret } from "../../utils/crypto.js";

/**
 * Get Device Attestation Options node that calls the MCP server tool.
 *
 * This node:
 * 1. Builds the payload from state (tokenId, clientReferenceId, VTS auth data, email, env vars)
 * 2. Calls the get-device-attestation-options MCP tool
 * 3. Saves the result to state
 * 4. Handles errors gracefully with user-friendly messages
 *
 * @param state - Current graph state with required data
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with device attestation options and message
 */
export async function getDeviceAttestationOptions(
  state: typeof GraphState.State,
  config: RunnableConfig
): Promise<Partial<typeof GraphState.State>> {
  const context = config.configurable?.executionContext as ExecutionContext;

  if (!context) {
    console.error("ExecutionContext not found in config.configurable");
    return {
      messages: [
        new AIMessage({
          content:
            "We encountered a configuration issue. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }

  // Idempotency guard: Skip if already have device attestation options
  if (state.private_deviceAttestationOptions) {
    console.log("Device attestation options already retrieved, skipping");
    return {}; // Return empty state to preserve existing data
  }

  // Deny-by-default: consume the server-bound token only (AISAST-10709).
  const tokenId = state.private_serverTokenId;
  if (!tokenId || (state.private_tokenId && state.private_tokenId !== tokenId)) {
    return {
      messages: [
        new AIMessage({
          content: "We could not verify this card for your session.",
          additional_kwargs: { ui_only: true },
        }),
      ],
    };
  }

  try {
    if (
      !state.private_vtsAuthenticationSessionData ||
      !state.email ||
      !state.clientReferenceId
    ) {
      throw new Error(
        "Missing required state data: VTS authentication data, email, or clientReferenceId"
      );
    }

    // Configuration fields from environment variables
    const clientAppID = process.env.TR_APPID;
    const encSecret = process.env.TR_ENCSECRET;
    const encApiKey = process.env.TR_ENCAPIKEY;

    if (!clientAppID || !encSecret || !encApiKey) {
      throw new Error(
        "TR_APPID, TR_ENCSECRET, and TR_ENCAPIKEY environment variables are required"
      );
    }

    // Encrypt authentication data
    const encAuthenticationData = await encryptWithSecret(
      encSecret,
      encApiKey,
      {
        consumerInfo: {
          emailAddress: state.email,
        },
      }
    );

    // Build payload for get-device-attestation-options
    const payload: Record<string, unknown> = {
      vProvisionedTokenID: tokenId,
      dynamicData: {
        authenticationAmount: "0.00",
        currencyCode: "840",
        merchantIdentifier: {
          externalClientId: Buffer.from("visaagent").toString("base64url"),
          applicationUrl: Buffer.from("https://agent.visa.com").toString(
            "base64url"
          ),
          merchantName: Buffer.from("VisaAgent").toString("base64url"),
        },
      },
      clientAppID,
      clientReferenceID: state.clientReferenceId,
      type: "AUTHENTICATE",
      reasonCode: "PAYMENT",
      sessionContext: state.private_vtsAuthenticationSessionData.sessionContext,
      browserData: state.private_vtsAuthenticationSessionData.browserData,
      encAuthenticationData,
      authenticationPreferencesRequested: {
        selectedPopupForAuthenticate: false,
      },
    };

    console.log("Calling get-device-attestation-options with payload");

    const { result, messages: toolMessages } =
      await context.getDeviceAttestationOptions(tokenId, payload);

    console.log("Device attestation options retrieved successfully");

    // Return success with tool call messages
    return {
      private_deviceAttestationOptions: result,
      messages: [
        ...toolMessages, // Tool call messages appear first in UI
        new AIMessage({
          content: "Device attestation options retrieved successfully.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  } catch (error) {
    console.error("Error in getDeviceAttestationOptions:", error);

    return {
      messages: [
        new AIMessage({
          content:
            "We encountered an issue while retrieving device attestation options. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
