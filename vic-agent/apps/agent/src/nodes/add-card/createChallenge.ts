import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState, isCreateChallengeError } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";

/**
 * Create Challenge node that submits the IDV step-up method.
 *
 * This node:
 * 1. Validates required state data (tokenId, selectedValidationMethod, clientReferenceId)
 * 2. Builds payload with current timestamp
 * 3. Calls submit-idv-step-up-method MCP tool
 * 4. Saves result to state
 * 5. Ends the flow (no further routing)
 *
 * @param state - Current graph state with validation method selection
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with challenge response and message
 */
export async function createChallenge(
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

  // Idempotency guard: Skip if already have successful challenge response
  if (
    state.private_createChallengeResponse &&
    !isCreateChallengeError(state.private_createChallengeResponse)
  ) {
    console.log("Challenge already created successfully, skipping");
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
      !state.private_selectedValidationMethod?.identifier ||
      !state.clientReferenceId
    ) {
      throw new Error(
        "Missing required state data: selectedValidationMethod.identifier or clientReferenceId"
      );
    }

    // Build payload for submit-idv-step-up-method
    const payload: Record<string, unknown> = {
      vProvisionedTokenID: tokenId,
      stepUpRequestID: state.private_selectedValidationMethod.identifier,
      date: Math.floor(Date.now() / 1000).toString(), // EpochDateTime in UTC
      clientReferenceId: state.clientReferenceId,
    };

    // Add clientAppID from environment
    const clientAppID = process.env.TR_APPID;
    if (clientAppID) {
      payload.clientAppID = clientAppID;
    }

    console.log("Calling submit-idv-step-up-method with payload");

    const { result, messages: toolMessages } =
      await context.submitIdvStepUpMethod(tokenId, payload);

    if (isCreateChallengeError(result)) {
      console.error(
        "Challenge creation failed with API error:",
        result.errorResponse
      );

      // Clear selected validation method to force re-selection
      return {
        private_createChallengeResponse: result,
        private_selectedValidationMethod: null,
        messages: [
          ...toolMessages,
          new AIMessage({
            content: `The selected validation method is not available (${result.errorResponse.reason}). Please choose another method.`,
            additional_kwargs: {
              ui_only: true,
            },
          }),
        ],
      };
    }

    console.log("Challenge created successfully");

    return {
      private_createChallengeResponse: result,
      messages: [
        ...toolMessages, // Tool call messages appear first in UI
        new AIMessage({
          content:
            "Validation challenge has been sent. Please check your selected method for verification.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  } catch (error) {
    console.error("Error in createChallenge:", error);

    return {
      messages: [
        new AIMessage({
          content:
            "We encountered an issue while creating the validation challenge. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
