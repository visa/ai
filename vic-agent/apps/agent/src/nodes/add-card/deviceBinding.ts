import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState, StepUpRequestItem } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";
import { encryptWithSecret, generateEmailHash } from "../../utils/crypto.js";

/**
 * Device Binding node that calls the MCP server tool.
 *
 * This node:
 * 1. Builds the payload from state (tokenId, clientReferenceId, browserData, sessionContext, email, env vars)
 * 2. Calls the device-binding-request MCP tool
 * 3. Saves the result to state
 * 4. Handles errors gracefully with user-friendly messages
 *
 * @param state - Current graph state with required data
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with device binding response and message
 */
export async function deviceBinding(
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

  // Idempotency guard: Skip if already have device binding response
  if (state.private_deviceBindingResponse) {
    console.log("Device binding already completed, skipping");
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
    // Validate required state data
    if (
      !state.private_vtsAuthenticationSessionData ||
      !state.clientReferenceId
    ) {
      throw new Error(
        "Missing required state data: VTS authentication data or clientReferenceId"
      );
    }

    // Build base payload for device-binding-request
    const payload: Record<string, unknown> = {
      vProvisionedTokenID: tokenId,
      clientReferenceId: state.clientReferenceId,
      platformType: "WEB",
      reasonCode: "DEVICE_BINDING",
      intent: "FIDO",
      browserData: state.private_vtsAuthenticationSessionData.browserData,
      sessionContext: state.private_vtsAuthenticationSessionData.sessionContext,
    };

    // Add optional fields if available
    const clientAppID = process.env.TR_APPID;
    if (clientAppID) {
      payload.clientAppID = clientAppID;
    }

    // Add email hash if email exists
    if (state.email) {
      try {
        payload.clientWalletAccountEmailAddressHash = generateEmailHash(
          state.email
        );
      } catch (error) {
        console.warn("Failed to generate email hash:", error);
        // Continue without email hash
      }

      // Add encrypted billing info if email exists
      const encSecret = process.env.TR_ENCSECRET;
      const encApiKey = process.env.TR_ENCAPIKEY;
      if (encSecret && encApiKey) {
        try {
          payload.encBillingInfo = await encryptWithSecret(
            encSecret,
            encApiKey,
            {
              email: state.email,
            }
          );
        } catch (error) {
          console.warn("Failed to encrypt billing info:", error);
          // Continue without encrypted billing info
        }
      }
    }

    console.log("Calling device-binding-request with payload");

    const { result, messages: toolMessages } =
      await context.deviceBindingRequest(tokenId, payload);

    console.log("Device binding completed successfully");

    // Prepare validation methods if stepUpRequest exists
    // Type matches validationMethodsChannel from state.ts
    const validationMethods: typeof GraphState.State.validationMethods =
      result?.stepUpRequest
        ? result.stepUpRequest.map((item: StepUpRequestItem) => ({
            method: item.method || "",
            value: item.value || "",
          }))
        : null;

    return {
      private_deviceBindingResponse: result,
      validationMethods,
      messages: [
        ...toolMessages, // Tool call messages appear first in UI
        new AIMessage({
          content: "Device binding completed successfully.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  } catch (error) {
    console.error("Error in deviceBinding:", error);

    return {
      messages: [
        new AIMessage({
          content:
            "We encountered an issue during device binding. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
