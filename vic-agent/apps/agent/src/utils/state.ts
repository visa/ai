import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { MODE } from "./constant.js";

/**
 * Step-up request item structure for device binding validation.
 */
export type StepUpRequestItem = {
  method?:
    | "OTPEMAIL"
    | "OTPONLINEBANKING"
    | "OTPSMS"
    | "CUSTOMERSERVICE"
    | "APP-TO-APP"
    | "OUTBOUNDCALL";
  value?: string;
  identifier?: string;
};

/**
 * Shared messages channel - created once and reused in both state schemas.
 * This ensures LangGraph sees the same channel instance in both GraphState and OutputStateAnnotation.
 */
const messagesChannel = Annotation<BaseMessage[]>({
  reducer: (x, y) => x.concat(y),
});

/**
 * Shared isMcpConnected channel - created once and reused in both state schemas.
 * This ensures LangGraph sees the same channel instance in both GraphState and OutputStateAnnotation.
 */
const isMcpConnectedChannel = Annotation<boolean>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => false,
});

/**
 * Shared registerAttestationOptions channel - created once and reused in both state schemas.
 * This ensures LangGraph sees the same channel instance in both GraphState and OutputStateAnnotation.
 */
const registerAttestationOptionsChannel = Annotation<{
  data?: {
    ignore00field?: string;
    authenticationContext?: {
      endpoint?: string;
      identifier?: string;
      payload?: string;
      action?: string;
      platformType?: string;
      authenticationPreferencesEnabled?: {
        responseMode?: string;
        responseType?: string;
      };
    };
  };
  correlationId?: string;
} | null>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => null,
});

/**
 * Shared validationMethods channel - created once and reused in both state schemas.
 * This ensures LangGraph sees the same channel instance in both GraphState and OutputStateAnnotation.
 */
const validationMethodsChannel = Annotation<Array<{
  method: string;
  value: string;
}> | null>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => null,
});

/**
 * Internal-only token channel.
 *
 * Holds the provisioned token ID from Visa tokenization. This channel is used
 * ONLY by GraphState.private_tokenId and is NEVER bound to any field in
 * OutputStateAnnotation, so the raw provisioned token id never crosses the
 * stream boundary to the browser (AISAST-10711).
 *
 * The client no longer round-trips this value: it is written server-side by
 * tokenizeCard and cleared by the delete-card cleanup node. Keeping it on a
 * permissive reducer is safe because no client-supplied input is wired to it
 * anymore; the trusted, server-write-only binding lives on
 * serverTokenIdChannel below (AISAST-10709).
 */
const tokenIdChannel = Annotation<string | null>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => null,
});

/**
 * Sentinel used by the delete-card cleanup node to explicitly clear the
 * server-trusted token binding. The serverTokenIdChannel reducer is otherwise
 * deny-by-default (immutable once bound); this sentinel is the only value that
 * resets it to null.
 */
const SERVER_TOKEN_CLEAR_SENTINEL = "__CLEAR_SERVER_TOKEN__";

/**
 * Server-trusted, server-write-only token channel bound to this session/thread
 * (AISAST-10709).
 *
 * NEVER exposed to the client (not in OutputStateAnnotation) and never accepted
 * from client input. The reducer is deny-by-default: once a server token is
 * bound it is immutable for the life of the thread, so a client-supplied value
 * (even if one were wired in) can neither set nor overwrite it. The only way to
 * clear it is the explicit cleanup sentinel emitted by the delete-card cleanup
 * node. This is the ONLY token the delete/consume nodes act on (object-level
 * authorization, web-application-dsr 4.6(d)).
 */
const serverTokenIdChannel = Annotation<string | null>({
  reducer: (existing, incoming) => {
    if (incoming === undefined) return existing;
    // Explicit cleanup sentinel resets the binding (delete-card flow only).
    if (incoming === SERVER_TOKEN_CLEAR_SENTINEL) return null;
    // Deny-by-default: once bound, the server binding is immutable.
    if (existing) return existing;
    return incoming;
  },
  default: () => null,
});

/**
 * Non-sensitive cardActive channel (AISAST-10711).
 *
 * Carries only a boolean signalling the UI that an enrolled card token exists
 * server-side for this thread. Carries NO token identifier. Reused in both
 * GraphState and OutputStateAnnotation so the flag stays in sync, replacing the
 * previously-exposed raw `tokenId` output field.
 */
const cardActiveChannel = Annotation<boolean>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => false,
});

/**
 * Sentinel re-export for the delete-card cleanup node.
 */
export { SERVER_TOKEN_CLEAR_SENTINEL };

/**
 * Shared action channel - created once and reused in both state schemas.
 * Public action field for one-time operations triggered from UI (e.g., "delete-card").
 * This ensures LangGraph sees the same channel instance in both GraphState and OutputStateAnnotation.
 */
const actionChannel = Annotation<string | null>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => null,
});

/**
 * Shared cardDeletionSignal channel - created once and reused in both state schemas.
 * Counter that increments when a card is deleted, signaling UI to clear localStorage.
 * UI watches for value changes (0 -> 1 -> 2, etc.) to trigger clearing.
 * This ensures LangGraph sees the same channel instance in both GraphState and OutputStateAnnotation.
 */
const cardDeletionSignalChannel = Annotation<number>({
  reducer: (x, y) => (y !== undefined ? y : x),
  default: () => 0,
});

/**
 * Success response from submit-idv-step-up-method API
 */
export type CreateChallengeSuccessResponse = {
  maxOTPRequestsAllowed?: number;
  maxOTPVerificationAllowed?: number;
  codeExpiration?: number;
};

/**
 * Error response from submit-idv-step-up-method API
 */
export type CreateChallengeErrorResponse = {
  errorResponse: {
    status: number;
    reason: string;
    message: string;
    ref: string | null;
  };
};

/**
 * Combined response type for create challenge
 */
export type CreateChallengeResponse =
  | CreateChallengeSuccessResponse
  | CreateChallengeErrorResponse;

/**
 * Type guard to check if response is an error
 */
export function isCreateChallengeError(
  response: CreateChallengeResponse | null
): response is CreateChallengeErrorResponse {
  return response !== null && "errorResponse" in response;
}

/**
 * Success response from validate-otp API
 * API returns 200 status with empty response body on success
 */
export type ValidateOtpSuccessResponse = Record<string, never>;

/**
 * Error response from validate-otp API
 */
export type ValidateOtpErrorResponse = {
  errorResponse: {
    status: number;
    reason: string;
    message: string;
    ref: string | null;
  };
};

/**
 * Combined response type for validate OTP
 */
export type ValidateOtpResponse =
  | ValidateOtpSuccessResponse
  | ValidateOtpErrorResponse;

/**
 * Type guard to check if response is an error
 */
export function isValidateOtpError(
  response: ValidateOtpResponse | null
): response is ValidateOtpErrorResponse {
  return response !== null && "errorResponse" in response;
}

/**
 * Success response from get-token-status API
 */
export type CheckTokenStatusSuccessResponse = {
  data?: {
    ignore00field?: string;
    tokenInfo?: {
      tokenStatus?: "INACTIVE" | "ACTIVE" | "SUSPENDED" | "DELETED";
      expirationDate?: {
        year?: string;
        month?: string;
      };
      ignore01field?: string;
    };
  };
  correlationId?: string;
};

/**
 * Error response from get-token-status API
 */
export type CheckTokenStatusErrorResponse = {
  errorResponse: {
    status: number;
    reason: string;
    message: string;
    ref: string | null;
  };
};

/**
 * Combined response type for check token status
 */
export type CheckTokenStatusResponse =
  | CheckTokenStatusSuccessResponse
  | CheckTokenStatusErrorResponse;

/**
 * Type guard to check if response is an error
 */
export function isCheckTokenStatusError(
  response: CheckTokenStatusResponse | null
): response is CheckTokenStatusErrorResponse {
  return response !== null && "errorResponse" in response;
}

/**
 * Internal graph state with both public and private fields.
 * Private fields (prefixed with private_) are never exposed to external clients.
 */
export const GraphState = Annotation.Root({
  /**
   * Messages in the conversation.
   * The reducer concatenates new messages to the existing list.
   */
  messages: messagesChannel,

  /**
   * Product name the user wants to buy.
   * Extracted by the intent clarification node.
   */
  product: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x), // Use new value if provided, otherwise keep existing
    default: () => null,
  }),

  /**
   * Budget amount in dollars.
   * Extracted by the intent clarification node.
   */
  budget: Annotation<number | null>({
    reducer: (x, y) => (y !== undefined ? y : x), // Use new value if provided, otherwise keep existing
    default: () => null,
  }),

  /**
   * Private field: Credit card data for payment processing.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_cardData: Annotation<{
    cardNumber?: string;
    expiryDate?: string;
    cvv?: string;
    cardholderName?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: client-side-encrypted card payload (RSA-OAEP base64).
   * The web client encrypts the raw card data before submission so cleartext
   * PAN/CVV never crosses the stream. It is decrypted in memory inside
   * tokenizeCard and then purged. Like private_cardData, this is NEVER exposed
   * to external clients via the output schema.
   */
  private_encryptedCardData: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * User email address.
   * Collected alongside card information for payment processing.
   */
  email: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: provisioned token ID from Visa tokenization.
   * Internal-only — bound to tokenIdChannel, which is NOT part of
   * OutputStateAnnotation, so the raw token id never reaches the client
   * (AISAST-10711). Written server-side by tokenizeCard; cleared by the
   * delete-card cleanup node.
   */
  private_tokenId: tokenIdChannel,

  /**
   * Private field: server-trusted provisioned token bound to this
   * session/thread (AISAST-10709). Written once by tokenizeCard; never read
   * from client input and never exposed via OutputStateAnnotation. This is the
   * ONLY token the delete/consume nodes act on (deny-by-default object-level
   * authorization, web-application-dsr 4.6(d)).
   */
  private_serverTokenId: serverTokenIdChannel,

  /**
   * Non-sensitive flag: true when a provisioned card token exists server-side
   * for this thread. The raw provisioned token ID is NEVER exposed to clients;
   * it remains in the internal GraphState.private_tokenId only. The UI uses
   * this boolean to render "card active" state (AISAST-10711).
   */
  cardActive: cardActiveChannel,

  /**
   * Private field: VTS authentication session data.
   * Contains authentication details from Visa Token Service.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_vtsAuthenticationSessionData: Annotation<{
    result?: string;
    browserData?: {
      browserJavaEnabled?: boolean;
      browserJavascriptEnabled?: boolean;
      browserLanguage?: string;
      browserColorDepth?: string;
      browserScreenHeight?: string;
      browserScreenWidth?: string;
      browserTimeZone?: string;
      userAgent?: string;
      browserHeader?: string;
      ipAddress?: string;
    };
    authenticationPreferencesSupported?: {
      requiresPopupForAuthenticate?: boolean;
      requiresPopupForRegister?: boolean;
    };
    sessionContext?: {
      secureToken?: string;
    };
    dfpSessionID?: string;
    requestID?: string;
    type?: string;
    version?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: VTS authentication retry counter.
   * Tracks the number of VTS authentication attempts.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_vtsRetryCount: Annotation<number>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => 0,
  }),

  /**
   * Client reference ID for VTS operations.
   * Generated in UI and sent with VTS authentication data, persisted across session.
   */
  clientReferenceId: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: VTS Client Device ID.
   * Generated in UI and sent with initial message for device identification.
   * Stored for potential future use in VTS operations.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_vtsClientDeviceId: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Device attestation options for tokenize flow.
   * Contains the response from get-device-attestation-options API call.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_deviceAttestationOptions: Annotation<{
    data?: {
      ignore00field?: string;
      authenticationContext?: {
        action?: string;
        identifier?: string;
        payload?: string;
        endpoint?: string;
        platformType?: string;
        authenticationPreferencesEnabled?: {
          responseMode?: string;
          responseType?: string;
        };
      };
    };
    correlationId?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Device binding response.
   * Contains the response from device-binding-request API call.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_deviceBindingResponse: Annotation<{
    stepUpRequest?: Array<StepUpRequestItem>;
    status?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Validation methods available for step-up authentication.
   * Contains method and value only (no identifier) for UI display.
   * Exposed to UI to show available authentication options.
   */
  validationMethods: validationMethodsChannel,

  /**
   * Private field: Selected validation method.
   * Contains the complete selected method including identifier.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_selectedValidationMethod: Annotation<{
    method?: string;
    value?: string;
    identifier?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Create challenge response.
   * Contains the response from submit-idv-step-up-method API call.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_createChallengeResponse: Annotation<CreateChallengeResponse | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: One-time password entered by user.
   * Contains the OTP code entered after challenge creation.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_otpCode: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: OTP validation status.
   * True if OTP was validated successfully, false if validation failed, null if not yet validated.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_isOtpValidated: Annotation<boolean | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Validate OTP response.
   * Contains the response from validate-otp API call.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_validateOtpResponse: Annotation<ValidateOtpResponse | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Check token status response.
   * Contains the response from get-token-status API call.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_checkTokenStatusResponse: Annotation<CheckTokenStatusResponse | null>(
    {
      reducer: (x, y) => (y !== undefined ? y : x),
      default: () => null,
    }
  ),

  /**
   * Private field: Register attestation options response.
   * Contains the response from get-device-attestation-options API call for REGISTER type.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_registerAttestationOptions: Annotation<{
    data?: {
      ignore00field?: string;
      authenticationContext?: {
        endpoint?: string;
        identifier?: string;
        payload?: string;
        action?: string;
        platformType?: string;
        authenticationPreferencesEnabled?: {
          responseMode?: string;
          responseType?: string;
        };
      };
    };
    correlationId?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Authenticate message result data.
   * Contains the complete AUTH_COMPLETE message structure from VTS.
   * Used for idempotency guard and storing authentication completion data.
   */
  private_authenticateMessageResult: Annotation<{
    assuranceData?: {
      fidoBlob?: string;
      identifier?: string;
      rpID?: string;
    };
    browserData?: {
      browserColorDepth?: string;
      browserHeader?: string;
      browserJavaEnabled?: boolean;
      browserJavascriptEnabled?: boolean;
      browserLanguage?: string;
      browserScreenHeight?: string;
      browserScreenWidth?: string;
      browserTimeZone?: string;
      ipAddress?: string;
      userAgent?: string;
    };
    contentType?: string;
    requestID?: string;
    result?: string;
    sessionContext?: string;
    type?: string;
    version?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Enroll card response.
   * Contains the response from enroll-card API call.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_enrollCardResponse: Annotation<{
    data?: {
      clientReferenceId?: string;
      status?: string;
      pendingEvents?: string[];
    };
    correlationId?: string;
  } | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * MCP connection status.
   * Set during graph initialization - true if MCP server is connected, false otherwise.
   */
  isMcpConnected: isMcpConnectedChannel,

  /**
   * Register attestation options data.
   * Exposed to UI to pass to the authenticate message popup.
   */
  registerAttestationOptions: registerAttestationOptionsChannel,

  /**
   * Current execution mode - tracks which subgraph is active.
   * Used for routing and interrupt resumption.
   * This field is NEVER exposed to external clients via the output schema.
   */
  mode: Annotation<(typeof MODE)[keyof typeof MODE] | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Public action field - for one-time operations triggered from UI.
   * UI can set this directly to trigger actions (e.g., "delete-card").
   * Router will move this to private_action for internal routing.
   * Uses shared channel to automatically sync with UI via OutputStateAnnotation.
   */
  action: actionChannel,

  /**
   * Private action field - internal routing only.
   * Router uses this to route to action-specific subgraphs.
   * Has higher priority than mode.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_action: Annotation<string | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Token deletion completion flag.
   * Set to true after successful token deletion, used for idempotency.
   * Cleared by CLEAR_DELETE_CARD_ACTION after cleanup completes.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_tokenDeleted: Annotation<boolean | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Private field: Card addition completion flag.
   * Set to false when card addition flow starts, true when completed.
   * Used to determine if an incomplete card addition flow should continue.
   * This field is NEVER exposed to external clients via the output schema.
   */
  private_cardAdditionCompleted: Annotation<boolean | null>({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => null,
  }),

  /**
   * Card deletion signal counter.
   * Increments each time a card is deleted. UI watches for changes to trigger localStorage clearing.
   * Uses shared channel to automatically sync with UI via OutputStateAnnotation.
   */
  cardDeletionSignal: cardDeletionSignalChannel,
});

/**
 * Output schema defining which fields are exposed to external clients (web).
 * Only includes messages and specific public fields - all private fields are filtered out for security.
 */
export const OutputStateAnnotation = Annotation.Root({
  messages: messagesChannel,

  /**
   * MCP connection status.
   * Exposed to frontend to display connection status indicator.
   */
  isMcpConnected: isMcpConnectedChannel,

  /**
   * Validation methods available for step-up authentication.
   * Exposed to UI to show available authentication options.
   */
  validationMethods: validationMethodsChannel,

  /**
   * Register attestation options data.
   * Exposed to UI to pass to the authenticate message popup.
   */
  registerAttestationOptions: registerAttestationOptionsChannel,

  /**
   * Non-sensitive flag: true when a provisioned card token exists server-side
   * for this thread. The raw provisioned token ID is NEVER exposed to clients;
   * it remains in the internal GraphState.private_tokenId only. The UI uses
   * this boolean to render "card active" state (AISAST-10711).
   *
   * tokenIdChannel is intentionally NOT bound to any output field — that is
   * what keeps the raw token server-side.
   */
  cardActive: cardActiveChannel,

  /**
   * Public action field - UI can set this to trigger one-time operations.
   * Router will process this and route to appropriate action handler.
   * Uses shared channel to sync with GraphState.
   */
  action: actionChannel,

  /**
   * Card deletion signal counter.
   * UI listens for this value to change and clears localStorage when it increments.
   * Uses shared channel to sync with GraphState.
   */
  cardDeletionSignal: cardDeletionSignalChannel,
});

/**
 * Input schema defining which channels are addressable from a client payload
 * (the initial stream.submit and interrupt-resume writes) (AISAST-10709 round 2).
 *
 * Why this exists: a StateGraph with no input schema accepts ANY GraphState
 * channel from the client payload. That meant a client could seed
 * private_serverTokenId on the FIRST write — the deny-by-default
 * serverTokenIdChannel reducer only blocks OVERWRITE of an already-bound value,
 * not the initial bind — which merely RELOCATED the IDOR instead of closing it.
 *
 * By declaring an explicit input schema, LangGraph filters every client payload
 * down to ONLY the channels listed here. private_serverTokenId, private_tokenId,
 * and every other server-only private_* channel are DELIBERATELY OMITTED, so
 * they are NOT client-addressable. The server-side write in tokenizeCard then
 * becomes the only path that can set private_serverTokenId.
 *
 * Channels are reused from the EXISTING GraphState channel instances (shared
 * module-level constants where they exist, GraphState.spec.* otherwise) so
 * LangGraph sees the same instances in both schemas. This list contains exactly
 * the keys the web client writes via stream.submit (initial message +
 * add-card/VTS/OTP interrupt-resume values): adding others would over-expose the
 * graph; omitting any of these would break the corresponding client-driven flow.
 */
export const InputStateAnnotation = Annotation.Root({
  // Conversation input (initial human message / regenerate).
  messages: messagesChannel,

  // User-intent flow: product/budget can be supplied by the client.
  product: GraphState.spec.product,
  budget: GraphState.spec.budget,

  // Collected alongside the encrypted card payload at enrollment.
  email: GraphState.spec.email,

  // Public one-time action trigger (e.g. "delete-card"). The destructive
  // delete-card flow intentionally carries NO token id from the client; the
  // server-bound private_serverTokenId is the authorization control.
  action: actionChannel,

  // Client-supplied, client-side-encrypted card payload submitted at
  // enrollment. Decrypted in-memory inside tokenizeCard and then purged. This
  // is the ONLY private_* card channel that is legitimately client-writable.
  private_encryptedCardData: GraphState.spec.private_encryptedCardData,

  // VTS identifiers generated in the UI and sent on the first message.
  clientReferenceId: GraphState.spec.clientReferenceId,
  private_vtsClientDeviceId: GraphState.spec.private_vtsClientDeviceId,

  // VTS / device-binding interrupt-resume values supplied by the client.
  private_vtsAuthenticationSessionData:
    GraphState.spec.private_vtsAuthenticationSessionData,
  private_vtsRetryCount: GraphState.spec.private_vtsRetryCount,
  private_selectedValidationMethod:
    GraphState.spec.private_selectedValidationMethod,
  private_otpCode: GraphState.spec.private_otpCode,

  // NOTE: private_serverTokenId and private_tokenId are DELIBERATELY OMITTED so
  // they cannot be seeded or overwritten from any client payload (AISAST-10709).
});
