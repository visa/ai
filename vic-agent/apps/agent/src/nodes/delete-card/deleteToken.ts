import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";

/**
 * Delete token node that calls delete-token MCP tool.
 *
 * On success: Increments cardDeletionSignal counter to trigger UI localStorage clearing.
 * Flow continues to SIGNAL_UI_CARD_DELETED (checkpoint) then CLEAR_DELETE_CARD_ACTION.
 * On error: Keeps all data intact, shows error, action will be cleared by next node
 *
 * @param state - Current graph state
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with cardDeletionSignal incremented or error message
 */
export async function deleteToken(
  state: typeof GraphState.State,
  config: RunnableConfig
): Promise<Partial<typeof GraphState.State>> {
  // Idempotency guard: skip if deletion already performed in this flow
  if (state.private_tokenDeleted === true) {
    console.log(
      "DELETE_TOKEN: Token already deleted (private_tokenDeleted is true), skipping"
    );
    return {};
  }
  const context = config.configurable?.executionContext as ExecutionContext;

  if (!context) {
    console.error("ExecutionContext not found in config.configurable");
    return {
      messages: [
        new AIMessage(
          "We encountered a configuration issue. Please try again later."
        ),
      ],
    };
  }

  // Deny-by-default object-level authorization (AISAST-10709): only the token
  // the SERVER bound to this session/thread (private_serverTokenId, set by
  // tokenizeCard) may be deleted. The internal private_tokenId is treated as an
  // untrusted claim — it is no longer sourced from client input, but we still
  // refuse if it disagrees with the server binding.
  const boundTokenId = state.private_serverTokenId;
  if (!boundTokenId) {
    console.error("No server-bound token for this session; refusing delete");
    return {
      messages: [
        new AIMessage("No card found to delete. Please add a card first."),
      ],
    };
  }
  // A mismatch means the caller is trying to delete a token they did not
  // provision in this session -> refuse (do NOT delete the supplied id).
  if (state.private_tokenId && state.private_tokenId !== boundTokenId) {
    console.error("Token claim does not match session binding; refusing delete");
    return {
      messages: [
        new AIMessage(
          "We could not verify this card for your session, so no changes were made."
        ),
      ],
    };
  }

  try {
    // Secondary existence/health check before deletion via get-token-status.
    // The AUTHORIZATION decision is made above by the server-binding match;
    // this only confirms the bound token is still resolvable.
    try {
      await context.getTokenStatus(boundTokenId);
    } catch (statusError) {
      console.error("Refusing delete: token status could not be verified");
      return {
        messages: [
          new AIMessage(
            "We could not verify this card before removing it, so no changes were made."
          ),
        ],
      };
    }

    const payload = {
      vProvisionedTokenID: boundTokenId,
      updateReason: {
        reasonCode: "CUSTOMER_CONFIRMED",
      },
    };

    // Do not log the token id.
    console.log("Calling delete-token");

    const { messages: toolMessages } = await context.deleteToken(
      boundTokenId,
      payload
    );

    // Do not log the raw delete result (may contain token data).
    console.log("Delete token successful");

    // SUCCESS: Signal UI to clear localStorage and show success message
    // Increment cardDeletionSignal counter to trigger UI clearing
    // Flow continues to SIGNAL_UI_CARD_DELETED (checkpoint) then CLEAR_DELETE_CARD_ACTION
    return {
      // Mark deletion as completed (idempotency flag)
      private_tokenDeleted: true,

      // Non-sensitive UI flag: no provisioned card remains for this thread.
      cardActive: false,

      // Increment deletion counter to signal UI (streams reliably)
      cardDeletionSignal: (state.cardDeletionSignal || 0) + 1,

      // Send success message
      messages: [
        ...toolMessages,
        new AIMessage(
          "Your card has been successfully removed. All associated data has been cleared."
        ),
      ],
      // Note: private_tokenId and other state will be cleared in CLEAR_DELETE_CARD_ACTION
    };
  } catch (error) {
    console.error("Error in deleteToken:", error);

    // ERROR: Keep all data, just show error message
    // Action will be cleared by next node to exit subgraph
    return {
      messages: [
        new AIMessage(
          "We encountered an issue while removing your card. Please try again later. Your card data has been preserved."
        ),
      ],
    };
  }
}
