import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState, isCheckTokenStatusError } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";

/**
 * Check Token Status node that retrieves the current status of the provisioned token.
 *
 * This node:
 * 1. Validates required state data (tokenId, clientReferenceId)
 * 2. Builds payload for get-token-status
 * 3. Calls get-token-status MCP tool
 * 4. Saves result to state
 * 5. On success (200): proceeds to graph end with success message
 * 6. On error (non-200): throws technical error message and ends flow
 *
 * @param state - Current graph state after OTP validation
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with token status response and message
 */
export async function checkTokenStatus(
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

  // Idempotency guard: Skip if already have token status response
  if (state.private_checkTokenStatusResponse) {
    console.log("Token status already checked, skipping");
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
    // Do not log the token id (sensitive payment-token reference).
    console.log("Calling get-token-status");

    const { result, messages: toolMessages } =
      await context.getTokenStatus(tokenId);

    if (isCheckTokenStatusError(result)) {
      console.error(
        "Token status check failed with API error:",
        result.errorResponse
      );

      return {
        private_checkTokenStatusResponse: result,
        messages: [
          ...toolMessages,
          new AIMessage({
            content: `We encountered a technical issue while checking your token status (${result.errorResponse.reason}). Please contact support if this issue persists.`,
            additional_kwargs: {
              ui_only: true,
            },
          }),
        ],
      };
    }

    console.log("Token status check successful");

    // Extract token status for success message
    const tokenStatus = result?.data?.tokenInfo?.tokenStatus || "UNKNOWN";

    // Check if token is not ACTIVE and show warning
    if (tokenStatus !== "ACTIVE") {
      return {
        private_checkTokenStatusResponse: result,
        messages: [
          ...toolMessages, // Tool call messages appear first in UI
          new AIMessage({
            content: `Token Status Warning! Token Status: ${tokenStatus}. Token may need additional processing to become ACTIVE.`,
            additional_kwargs: {
              ui_only: true,
            },
          }),
        ],
      };
    }

    return {
      private_checkTokenStatusResponse: result,
      messages: [
        ...toolMessages, // Tool call messages appear first in UI
        new AIMessage({
          content: `Token status verified successfully! Your token is ${tokenStatus.toLowerCase()}. Your card is now ready to use for secure payments.`,
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  } catch (error) {
    console.error("Error in checkTokenStatus:", error);

    return {
      messages: [
        new AIMessage({
          content:
            "We encountered an issue while checking your token status. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
