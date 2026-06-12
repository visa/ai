import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";
import { encryptWithSecret } from "../../utils/crypto.js";

/**
 * Register Attestation Options node that retrieves device attestation options for REGISTER type.
 *
 * This node:
 * 1. Validates required state data (tokenId, VTS authentication data, email, clientReferenceId)
 * 2. Encrypts authentication data with user email
 * 3. Builds payload for get-device-attestation-options with REGISTER type
 * 4. Calls get-device-attestation-options MCP tool
 * 5. Saves result to state
 * 6. On success: proceeds to graph end with success message
 * 7. On error: throws technical error message
 *
 * @param state - Current graph state after token status check
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with device attestation options and message
 */
export async function registerAttestationOptions(
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

  // Idempotency guard: Skip if already have register attestation options
  if (state.private_registerAttestationOptions) {
    console.log("Register attestation options already retrieved, skipping");
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

    // Get encryption credentials from environment
    const clientAppID = process.env.TR_APPID;
    const encSecret = process.env.TR_ENCSECRET;
    const encApiKey = process.env.TR_ENCAPIKEY;

    if (!encSecret || !encApiKey || !clientAppID) {
      throw new Error(
        "Missing required environment variables: TR_ENCSECRET, TR_ENCAPIKEY, or TR_APPID"
      );
    }

    console.log(
      "Encrypting authentication data for register attestation options"
    );

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

    // Build payload for get-device-attestation-options with REGISTER type
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
      type: "REGISTER",
      reasonCode: "DEVICE_BINDING",
      sessionContext: state.private_vtsAuthenticationSessionData.sessionContext,
      browserData: state.private_vtsAuthenticationSessionData.browserData,
      encAuthenticationData,
      authenticationPreferencesRequested: {
        selectedPopupForAuthenticate: false,
      },
    };

    console.log(
      "Calling get-device-attestation-options with REGISTER type payload"
    );

    const { result, messages: toolMessages } =
      await context.getDeviceAttestationOptions(tokenId, payload);

    // Validate that identifier and payload are present
    const hasIdentifier = result?.data?.authenticationContext?.identifier;
    const hasPayload = result?.data?.authenticationContext?.payload;

    const messages = [...toolMessages]; // Tool call messages appear first in UI

    if (!hasIdentifier || !hasPayload) {
      messages.push(
        new AIMessage({
          content:
            "Attestation Options Register Partial Success! Cannot send AUTHENTICATE message without identifier and payload",
          additional_kwargs: {
            ui_only: true,
          },
        })
      );
    } else {
      messages.push(
        new AIMessage({
          content:
            "Device registration attestation options retrieved successfully.",
          additional_kwargs: {
            ui_only: true,
          },
        })
      );
    }

    // Return success with device attestation options
    return {
      private_registerAttestationOptions: result,
      registerAttestationOptions: result,
      messages,
    };
  } catch (error) {
    console.error("Error in registerAttestationOptions:", error);

    return {
      messages: [
        new AIMessage({
          content:
            "We encountered an issue while retrieving device registration attestation options. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
