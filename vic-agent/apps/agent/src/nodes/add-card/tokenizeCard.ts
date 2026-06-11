import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import { GraphState } from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";
import {
  generateEmailHash,
  encryptWithSecret,
  decryptCardData,
} from "../../utils/crypto.js";

/**
 * Prepares encrypted payment instrument data from card data
 * @param cardData - The card data from state
 * @returns Encrypted payment instrument string
 */
async function prepareEncryptedPaymentInstrument(cardData: {
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  cardholderName?: string;
}): Promise<string> {
  if (
    !cardData.cardNumber ||
    !cardData.expiryDate ||
    !cardData.cvv ||
    !cardData.cardholderName
  ) {
    throw new Error("Missing required card data fields");
  }

  // Parse expiration date (assuming MM/YY or MM/YYYY format)
  const [expMonth, expYear] = cardData.expiryDate.split("/");

  if (!expMonth || !expYear) {
    throw new Error(
      "Invalid expiration date format. Expected MM/YY or MM/YYYY"
    );
  }

  const paymentInstrument = {
    accountNumber: cardData.cardNumber,
    name: cardData.cardholderName,
    expirationDate: {
      month: expMonth,
      year: expYear.length === 2 ? `20${expYear}` : expYear, // Handle YY vs YYYY
    },
    cvv2: cardData.cvv,
  };

  const encSecret = process.env.TR_ENCSECRET;
  const encApiKey = process.env.TR_ENCAPIKEY;

  if (!encSecret || !encApiKey) {
    throw new Error(
      "TR_ENCSECRET and TR_ENCAPIKEY environment variables are required"
    );
  }

  return await encryptWithSecret(encSecret, encApiKey, paymentInstrument);
}

/**
 * Tokenize card node that calls the MCP server tool to tokenize card data.
 *
 * This node:
 * 1. Builds the payload from state (card data, email, env vars)
 * 2. Calls the provision-token-given-pan-data MCP tool
 * 3. Extracts vProvisionedTokenID from response
 * 4. Saves tokenId to state and sends success message
 * 5. Handles errors gracefully with user-friendly messages
 *
 * @param state - Current graph state with card data and email
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with tokenId and message
 */
export async function tokenizeCard(
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

  // Idempotency guard: Skip if already tokenized
  if (state.private_tokenId) {
    // Do not log the provisioned token id (sensitive payment-token reference).
    console.log("Card already tokenized, skipping tokenization");
    return {}; // Return empty state to preserve existing tokenId
  }

  try {
    // Card data arrives encrypted from the client. Decrypt it in memory here;
    // never write the cleartext back into graph state (it would be checkpointed).
    let cardData = state.private_cardData;
    if (!cardData && state.private_encryptedCardData) {
      cardData = decryptCardData(state.private_encryptedCardData);
    }

    if (!cardData) {
      throw new Error("Card data is missing from state");
    }

    if (!state.email) {
      throw new Error("Email is missing from state");
    }

    const payload: Record<string, unknown> = {
      locale: "en_US",
      panSource: "MANUALLYENTERED",
      presentationType: ["ECOM"],
      consumerEntryMode: "KEYENTERED",
      protectionType: "CLOUD",
    };

    // Configuration fields from environment variables
    const clientAppID = process.env.TR_APPID;
    const clientWalletAccountID = process.env.TR_ID;

    if (!clientAppID || !clientWalletAccountID) {
      throw new Error("TR_APPID and TR_ID environment variables are required");
    }

    payload.clientAppID = clientAppID;
    payload.clientWalletAccountID = clientWalletAccountID;

    // Email handling
    payload.clientWalletAccountEmailAddress = state.email;
    payload.clientWalletAccountEmailAddressHash = generateEmailHash(
      state.email
    );

    // Prepare encrypted payment instrument
    payload.encPaymentInstrument =
      await prepareEncryptedPaymentInstrument(cardData);

    console.log("Calling provision-token-given-pan-data with payload");

    const { result, messages: toolMessages } =
      await context.provisionTokenGivenPanData(payload);

    const vProvisionedTokenID = result?.data?.vProvisionedTokenID;

    if (!vProvisionedTokenID) {
      // Do not log the raw VTS response — it can contain token/card data.
      console.error("vProvisionedTokenID not found in tokenization response");
      throw new Error("Token ID not found in response");
    }

    // Do not log the provisioned token id (sensitive payment-token reference).
    console.log("Card tokenization successful");

    return {
      private_tokenId: vProvisionedTokenID,
      // Purge sensitive card data from state after successful tokenization so
      // PAN/CVV (Sensitive Authentication Data) is not retained in the
      // checkpoint post-authorization (mirrors the error path below).
      private_cardData: null,
      private_encryptedCardData: null,
      messages: [
        ...toolMessages, // Tool call messages appear first in UI
        new AIMessage({
          content:
            "Card tokenization successful! Your payment method is now secure.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  } catch (error) {
    console.error("Error in tokenizeCard:", error);

    // Clear card data to prevent retry loop and signal UI to clear localStorage
    return {
      private_cardData: null, // Clear from agent state
      private_encryptedCardData: null, // Clear encrypted payload too
      cardDeletionSignal: (state.cardDeletionSignal || 0) + 1, // Signal UI to clear localStorage
      messages: [
        new AIMessage({
          content:
            "We encountered an issue while processing your card. The card data has been cleared. Please try again with a different card or contact your card issuer.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
