import {
  GraphState,
  SERVER_TOKEN_CLEAR_SENTINEL,
} from "../../utils/state.js";
import { MODE } from "../../utils/constant.js";

/**
 * Clear action node - final node in delete card subgraph.
 * Clears the private_action to allow router to return to MODE-based routing.
 * Also clears ALL card-related state after the delete operation completes.
 *
 * This node runs after DELETE_TOKEN → SIGNAL_UI_CARD_DELETED.
 * The signal node forces a checkpoint, ensuring the UI receives
 * the cardDeletionSignal increment before this node clears other state.
 *
 * NOTE: Does NOT reset cardDeletionSignal - it stays incremented to avoid timing issues.
 *
 * Clearing the private_action signals to the router that it should re-evaluate
 * based on mode and state.
 *
 * Only clears mode if it was set to DELETE_CARD. This allows delete action
 * to work as an interrupt without breaking other flows (e.g., if user is in
 * USER_INTENT mode and deletes card, they return to USER_INTENT).
 *
 * @param state - Current graph state
 * @returns Partial state with private_action cleared, mode conditionally cleared, and all card data cleared
 */
export async function clearDeleteCardAction(
  state: typeof GraphState.State
): Promise<Partial<typeof GraphState.State>> {
  const updates: Partial<typeof GraphState.State> = {
    private_action: null,

    // Clear deletion state
    private_tokenDeleted: null,

    // NOTE: Do NOT reset cardDeletionSignal - it stays incremented

    // Clear ALL card-related state (except email)
    private_cardData: null,
    private_tokenId: null,
    // Clear the server-trusted token binding via the explicit cleanup sentinel
    // (the serverTokenIdChannel reducer is deny-by-default and only resets on
    // this sentinel). AISAST-10709.
    private_serverTokenId: SERVER_TOKEN_CLEAR_SENTINEL,
    // Non-sensitive UI flag: no provisioned card remains for this thread.
    cardActive: false,
    private_vtsAuthenticationSessionData: null,
    private_vtsRetryCount: 0,
    private_deviceAttestationOptions: null,
    private_deviceBindingResponse: null,
    private_selectedValidationMethod: null,
    private_createChallengeResponse: null,
    private_otpCode: null,
    private_isOtpValidated: null,
    private_validateOtpResponse: null,
    private_checkTokenStatusResponse: null,
    private_registerAttestationOptions: null,
    private_authenticateMessageResult: null,

    // Clear public fields related to card (but keep email)
    validationMethods: null,
    registerAttestationOptions: null,
  };

  if (state.mode === MODE.DELETE_CARD || state.mode === MODE.ADD_CARD) {
    updates.mode = null;
    console.log("Clearing DELETE_CARD or ADD_CARD mode");
  } else {
    console.log(`Preserving mode: ${state.mode}`);
  }

  return updates;
}
