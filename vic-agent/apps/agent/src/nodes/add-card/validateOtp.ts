import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage } from "@langchain/core/messages";
import {
  GraphState,
  isValidateOtpError,
  isCreateChallengeError,
} from "../../utils/state.js";
import type { ExecutionContext } from "../../utils/execution-context/index.js";

/**
 * Validate OTP node that verifies the one-time password entered by the user.
 *
 * This node:
 * 1. Validates required state data (tokenId, otpCode, clientReferenceId)
 * 2. Builds payload with current timestamp
 * 3. Calls validate-otp MCP tool
 * 4. Saves result to state
 * 5. On success: proceeds to graph end
 * 6. On error: clears otpCode and loops back to EXPECT_OTP for retry
 *
 * @param state - Current graph state with OTP code
 * @param config - RunnableConfig containing tool registry
 * @returns Partial state update with validation response and message
 */
export async function validateOtp(
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

  // Idempotency guard: Skip if already validated successfully
  if (state.private_isOtpValidated === true) {
    console.log("OTP already validated successfully, skipping");
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
    if (!state.private_otpCode || !state.clientReferenceId) {
      throw new Error(
        "Missing required state data: otpCode or clientReferenceId"
      );
    }

    // Optional: Check if challenge has expired
    const challengeResponse = state.private_createChallengeResponse;
    if (
      challengeResponse &&
      !isCreateChallengeError(challengeResponse) &&
      challengeResponse.codeExpiration &&
      Date.now() / 1000 > challengeResponse.codeExpiration
    ) {
      return {
        private_otpCode: null, // Clear expired code
        messages: [
          new AIMessage({
            content:
              "The verification code has expired. Please request a new code.",
            additional_kwargs: {
              ui_only: true,
            },
          }),
        ],
      };
    }

    const payload: Record<string, unknown> = {
      vProvisionedTokenID: tokenId,
      otpValue: state.private_otpCode,
      date: Math.floor(Date.now() / 1000).toString(), // EpochDateTime in UTC
      clientReferenceId: state.clientReferenceId,
    };

    // Add clientAppID from environment
    const clientAppID = process.env.TR_APPID;
    if (clientAppID) {
      payload.clientAppID = clientAppID;
    }

    console.log("Calling validate-otp with payload");

    const { result, messages: toolMessages } = await context.validateOtp(
      tokenId,
      payload
    );

    if (isValidateOtpError(result)) {
      console.error(
        "OTP validation failed with API error:",
        result.errorResponse
      );

      // Clear OTP code to force re-entry and mark validation as failed
      return {
        private_isOtpValidated: false,
        private_validateOtpResponse: result,
        private_otpCode: null,
        messages: [
          ...toolMessages,
          new AIMessage({
            content: `The verification code is incorrect (${result.errorResponse.reason}). Please try again.`,
            additional_kwargs: {
              ui_only: true,
            },
          }),
        ],
      };
    }

    console.log("OTP validation successful");

    return {
      private_isOtpValidated: true,
      private_validateOtpResponse: null, // Clear any previous error
      messages: [
        ...toolMessages, // Tool call messages appear first in UI
        new AIMessage({
          content:
            "Verification successful! Your device has been securely registered.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  } catch (error) {
    console.error("Error in validateOtp:", error);

    return {
      private_otpCode: null, // Clear OTP to allow user to re-enter
      private_isOtpValidated: false, // Mark validation as failed
      messages: [
        new AIMessage({
          content:
            "We encountered an issue while validating your code. Please try again later.",
          additional_kwargs: {
            ui_only: true,
          },
        }),
      ],
    };
  }
}
