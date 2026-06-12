import { StateGraph, START, END } from "@langchain/langgraph";
import {
  GraphState,
  InputStateAnnotation,
  OutputStateAnnotation,
  isCreateChallengeError,
} from "./utils/state.js";
import { MemorySaver } from "@langchain/langgraph";
import { router } from "./nodes/router.js";
import {
  createMcpClient,
  closeMcpClient,
  createToolRegistry,
  McpClient,
} from "./utils/mcp/index.js";
import {
  createExecutionContext,
  type ExecutionContext,
} from "./utils/execution-context/index.js";
import { NODE_NAMES, MODE, ACTION } from "./utils/constant.js";

// Add-card flow imports
import { expectCardData } from "./nodes/add-card/interrupts/expectCardData.js";
import { tokenizeCard } from "./nodes/add-card/tokenizeCard.js";
import { expectVtsSecureToken } from "./nodes/add-card/interrupts/expectVtsSecureToken.js";
import { getDeviceAttestationOptions } from "./nodes/add-card/getDeviceAttestationOptions.js";
import { deviceBinding } from "./nodes/add-card/deviceBinding.js";
import { expectValidationMethod } from "./nodes/add-card/interrupts/expectValidationMethod.js";
import { createChallenge } from "./nodes/add-card/createChallenge.js";
import { expectOtp } from "./nodes/add-card/interrupts/expectOtp.js";
import { validateOtp } from "./nodes/add-card/validateOtp.js";
import { checkTokenStatus } from "./nodes/add-card/checkTokenStatus.js";
import { registerAttestationOptions } from "./nodes/add-card/registerAttestationOptions.js";
import { authenticateAttestationOptions } from "./nodes/add-card/authenticateAttestationOptions.js";
import { expectAuthenticateMessageResult } from "./nodes/add-card/interrupts/expectAuthenticateMessageResult.js";
import { enrollCard } from "./nodes/add-card/enrollCard.js";
import { clearAddCardMode } from "./nodes/add-card/clearAddCardMode.js";

// User-intent flow imports
import { clarifyIntent } from "./nodes/user-intent/clarifyIntent.js";
import { expectUserIntent } from "./nodes/user-intent/interrupts/expectUserIntent.js";
import { clearUserIntentMode } from "./nodes/user-intent/clearUserIntentMode.js";

// Delete-card flow imports
import { deleteToken } from "./nodes/delete-card/deleteToken.js";
import { signalUICardDeleted } from "./nodes/delete-card/signalUICardDeleted.js";
import { clearDeleteCardAction } from "./nodes/delete-card/clearDeleteCardAction.js";

/**
 * Router function for conditional edges.
 * Determines next node based on action (priority 1), mode (priority 2), and state completeness.
 *
 * @param state - Current graph state
 * @returns Next node name (first node of flow or END)
 */
function routeFromRouter(state: typeof GraphState.State): string {
  // PRIORITY 1: Route based on private_action
  if (state.private_action === ACTION.DELETE_CARD) {
    return NODE_NAMES.DELETE_TOKEN; // First node of delete-card flow
  }

  // PRIORITY 2: Route based on mode
  if (state.mode === MODE.ADD_CARD) {
    return NODE_NAMES.EXPECT_CARD_DATA;
  }
  if (state.mode === MODE.USER_INTENT) {
    return NODE_NAMES.CLARIFY_INTENT;
  }

  // All data present - end execution
  return END;
}

function routeCardCheck(state: typeof GraphState.State): string {
  if (state.private_cardData || state.private_encryptedCardData) {
    return NODE_NAMES.TOKENIZE_CARD;
  }
  return NODE_NAMES.EXPECT_CARD_DATA;
}

function routeTokenizeCard(state: typeof GraphState.State): string {
  if (state.private_tokenId) {
    return NODE_NAMES.EXPECT_VTS_SECURE_TOKEN;
  }
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeVtsSecureToken(state: typeof GraphState.State): string {
  if (state.private_vtsAuthenticationSessionData) {
    return NODE_NAMES.GET_DEVICE_ATTESTATION_OPTIONS;
  }
  const retryCount = state.private_vtsRetryCount || 0;
  if (retryCount >= 1) {
    return NODE_NAMES.CLEAR_ADD_CARD_MODE;
  }
  return NODE_NAMES.EXPECT_VTS_SECURE_TOKEN;
}

function routeDeviceAttestationOptions(state: typeof GraphState.State): string {
  const action =
    state.private_deviceAttestationOptions?.data?.authenticationContext?.action;
  if (action === "AUTHENTICATE") {
    return NODE_NAMES.AUTHENTICATE_ATTESTATION_OPTIONS;
  }
  if (action === "REGISTER") {
    return NODE_NAMES.DEVICE_BINDING;
  }
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeDeviceBinding(state: typeof GraphState.State): string {
  const status = state.private_deviceBindingResponse?.status;
  if (status === "APPROVED") {
    return NODE_NAMES.CHECK_TOKEN_STATUS;
  }
  if (status === "CHALLENGE") {
    return NODE_NAMES.EXPECT_VALIDATION_METHOD;
  }
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeValidationMethod(state: typeof GraphState.State): string {
  if (state.private_selectedValidationMethod?.identifier) {
    return NODE_NAMES.CREATE_CHALLENGE;
  }
  return NODE_NAMES.EXPECT_VALIDATION_METHOD;
}

function routeCreateChallenge(state: typeof GraphState.State): string {
  const response = state.private_createChallengeResponse;
  if (isCreateChallengeError(response)) {
    console.log(
      "Challenge failed, routing back to validation method selection"
    );
    return NODE_NAMES.EXPECT_VALIDATION_METHOD;
  }
  if (response) {
    console.log("Challenge created, routing to OTP input");
    return NODE_NAMES.EXPECT_OTP;
  }
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeExpectOtp(state: typeof GraphState.State): string {
  if (state.private_otpCode) {
    console.log("OTP received, routing to validation");
    return NODE_NAMES.VALIDATE_OTP;
  }
  return NODE_NAMES.EXPECT_OTP;
}

function routeValidateOtp(state: typeof GraphState.State): string {
  if (state.private_isOtpValidated === true) {
    console.log("OTP validation successful, routing to token status check");
    return NODE_NAMES.CHECK_TOKEN_STATUS;
  }
  if (
    state.private_isOtpValidated === false ||
    state.private_isOtpValidated === null
  ) {
    console.log(
      "OTP validation failed or not attempted, routing back to OTP input"
    );
    return NODE_NAMES.EXPECT_OTP;
  }
  console.warn("routeValidateOtp: unexpected state");
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeCheckTokenStatus(state: typeof GraphState.State): string {
  const response = state.private_checkTokenStatusResponse;
  if (response && "data" in response) {
    const tokenStatus = response.data?.tokenInfo?.tokenStatus;
    if (tokenStatus === "ACTIVE") {
      console.log("Token is ACTIVE, routing to register attestation options");
      return NODE_NAMES.REGISTER_ATTESTATION_OPTIONS;
    }
    console.log(`Token status is ${tokenStatus || "UNKNOWN"}, clearing mode`);
    return NODE_NAMES.CLEAR_ADD_CARD_MODE;
  }
  console.log("No valid token status response, clearing mode");
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeRegisterAttestationOptions(
  state: typeof GraphState.State
): string {
  const data = state.private_registerAttestationOptions;
  if (
    data?.data?.authenticationContext?.identifier &&
    data?.data?.authenticationContext?.payload
  ) {
    console.log(
      "Identifier and payload present, routing to expectAuthenticateMessageResult"
    );
    return NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT;
  }
  console.log("Identifier or payload missing, clearing mode");
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeAuthenticateAttestationOptions(
  state: typeof GraphState.State
): string {
  const data = state.private_deviceAttestationOptions;
  if (
    data?.data?.authenticationContext?.identifier &&
    data?.data?.authenticationContext?.payload
  ) {
    console.log(
      "Identifier and payload present, routing to expectAuthenticateMessageResult"
    );
    return NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT;
  }
  console.log("Identifier or payload missing, clearing mode");
  return NODE_NAMES.CLEAR_ADD_CARD_MODE;
}

function routeClarifyIntentOutput(state: typeof GraphState.State): string {
  if (state.product && state.budget) {
    return NODE_NAMES.CLEAR_USER_INTENT_MODE;
  }
  return NODE_NAMES.CLARIFY_INTENT;
}

const checkpointer = new MemorySaver();
console.log("=== GRAPH.TS: Created checkpointer ===");

// Build flattened workflow with all nodes
const workflow = new StateGraph({
  stateSchema: GraphState,
  input: InputStateAnnotation,
  output: OutputStateAnnotation,
})
  .addNode(NODE_NAMES.ROUTER, router)

  // Add-card flow nodes
  .addNode(NODE_NAMES.EXPECT_CARD_DATA, expectCardData)
  .addNode(NODE_NAMES.TOKENIZE_CARD, tokenizeCard)
  .addNode(NODE_NAMES.EXPECT_VTS_SECURE_TOKEN, expectVtsSecureToken)
  .addNode(
    NODE_NAMES.GET_DEVICE_ATTESTATION_OPTIONS,
    getDeviceAttestationOptions
  )
  .addNode(NODE_NAMES.DEVICE_BINDING, deviceBinding)
  .addNode(NODE_NAMES.EXPECT_VALIDATION_METHOD, expectValidationMethod)
  .addNode(NODE_NAMES.CREATE_CHALLENGE, createChallenge)
  .addNode(NODE_NAMES.EXPECT_OTP, expectOtp)
  .addNode(NODE_NAMES.VALIDATE_OTP, validateOtp)
  .addNode(NODE_NAMES.CHECK_TOKEN_STATUS, checkTokenStatus)
  .addNode(NODE_NAMES.REGISTER_ATTESTATION_OPTIONS, registerAttestationOptions)
  .addNode(
    NODE_NAMES.AUTHENTICATE_ATTESTATION_OPTIONS,
    authenticateAttestationOptions
  )
  .addNode(
    NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT,
    expectAuthenticateMessageResult
  )
  .addNode(NODE_NAMES.ENROLL_CARD, enrollCard)
  .addNode(NODE_NAMES.CLEAR_ADD_CARD_MODE, clearAddCardMode)

  // User-intent flow nodes
  .addNode(NODE_NAMES.CLARIFY_INTENT, clarifyIntent)
  .addNode(NODE_NAMES.EXPECT_USER_INTENT, expectUserIntent)
  .addNode(NODE_NAMES.CLEAR_USER_INTENT_MODE, clearUserIntentMode)

  // Delete-card flow nodes
  .addNode(NODE_NAMES.DELETE_TOKEN, deleteToken)
  .addNode(NODE_NAMES.SIGNAL_UI_CARD_DELETED, signalUICardDeleted)
  .addNode(NODE_NAMES.CLEAR_DELETE_CARD_ACTION, clearDeleteCardAction)

  // Start with router
  .addEdge(START, NODE_NAMES.ROUTER)

  // Router conditionally routes to first node of each flow or END
  .addConditionalEdges(NODE_NAMES.ROUTER, routeFromRouter, {
    [NODE_NAMES.EXPECT_CARD_DATA]: NODE_NAMES.EXPECT_CARD_DATA,
    [NODE_NAMES.CLARIFY_INTENT]: NODE_NAMES.CLARIFY_INTENT,
    [NODE_NAMES.DELETE_TOKEN]: NODE_NAMES.DELETE_TOKEN,
    [END]: END,
  })

  // Add-card flow edges
  .addConditionalEdges(NODE_NAMES.EXPECT_CARD_DATA, routeCardCheck, {
    [NODE_NAMES.EXPECT_CARD_DATA]: NODE_NAMES.EXPECT_CARD_DATA,
    [NODE_NAMES.TOKENIZE_CARD]: NODE_NAMES.TOKENIZE_CARD,
  })
  .addConditionalEdges(NODE_NAMES.TOKENIZE_CARD, routeTokenizeCard, {
    [NODE_NAMES.EXPECT_VTS_SECURE_TOKEN]: NODE_NAMES.EXPECT_VTS_SECURE_TOKEN,
    [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
  })
  .addConditionalEdges(
    NODE_NAMES.EXPECT_VTS_SECURE_TOKEN,
    routeVtsSecureToken,
    {
      [NODE_NAMES.EXPECT_VTS_SECURE_TOKEN]: NODE_NAMES.EXPECT_VTS_SECURE_TOKEN,
      [NODE_NAMES.GET_DEVICE_ATTESTATION_OPTIONS]:
        NODE_NAMES.GET_DEVICE_ATTESTATION_OPTIONS,
      [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
    }
  )
  .addConditionalEdges(
    NODE_NAMES.GET_DEVICE_ATTESTATION_OPTIONS,
    routeDeviceAttestationOptions,
    {
      [NODE_NAMES.AUTHENTICATE_ATTESTATION_OPTIONS]:
        NODE_NAMES.AUTHENTICATE_ATTESTATION_OPTIONS,
      [NODE_NAMES.DEVICE_BINDING]: NODE_NAMES.DEVICE_BINDING,
      [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
    }
  )
  .addConditionalEdges(NODE_NAMES.DEVICE_BINDING, routeDeviceBinding, {
    [NODE_NAMES.EXPECT_VALIDATION_METHOD]: NODE_NAMES.EXPECT_VALIDATION_METHOD,
    [NODE_NAMES.CHECK_TOKEN_STATUS]: NODE_NAMES.CHECK_TOKEN_STATUS,
    [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
  })
  .addConditionalEdges(
    NODE_NAMES.EXPECT_VALIDATION_METHOD,
    routeValidationMethod,
    {
      [NODE_NAMES.EXPECT_VALIDATION_METHOD]:
        NODE_NAMES.EXPECT_VALIDATION_METHOD,
      [NODE_NAMES.CREATE_CHALLENGE]: NODE_NAMES.CREATE_CHALLENGE,
    }
  )
  .addConditionalEdges(NODE_NAMES.CREATE_CHALLENGE, routeCreateChallenge, {
    [NODE_NAMES.EXPECT_VALIDATION_METHOD]: NODE_NAMES.EXPECT_VALIDATION_METHOD,
    [NODE_NAMES.EXPECT_OTP]: NODE_NAMES.EXPECT_OTP,
    [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
  })
  .addConditionalEdges(NODE_NAMES.EXPECT_OTP, routeExpectOtp, {
    [NODE_NAMES.EXPECT_OTP]: NODE_NAMES.EXPECT_OTP,
    [NODE_NAMES.VALIDATE_OTP]: NODE_NAMES.VALIDATE_OTP,
  })
  .addConditionalEdges(NODE_NAMES.VALIDATE_OTP, routeValidateOtp, {
    [NODE_NAMES.EXPECT_OTP]: NODE_NAMES.EXPECT_OTP,
    [NODE_NAMES.CHECK_TOKEN_STATUS]: NODE_NAMES.CHECK_TOKEN_STATUS,
    [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
  })
  .addConditionalEdges(NODE_NAMES.CHECK_TOKEN_STATUS, routeCheckTokenStatus, {
    [NODE_NAMES.REGISTER_ATTESTATION_OPTIONS]:
      NODE_NAMES.REGISTER_ATTESTATION_OPTIONS,
    [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
  })
  .addConditionalEdges(
    NODE_NAMES.REGISTER_ATTESTATION_OPTIONS,
    routeRegisterAttestationOptions,
    {
      [NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT]:
        NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT,
      [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
    }
  )
  .addConditionalEdges(
    NODE_NAMES.AUTHENTICATE_ATTESTATION_OPTIONS,
    routeAuthenticateAttestationOptions,
    {
      [NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT]:
        NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT,
      [NODE_NAMES.CLEAR_ADD_CARD_MODE]: NODE_NAMES.CLEAR_ADD_CARD_MODE,
    }
  )
  .addEdge(
    NODE_NAMES.EXPECT_AUTHENTICATE_MESSAGE_RESULT,
    NODE_NAMES.ENROLL_CARD
  )
  .addEdge(NODE_NAMES.ENROLL_CARD, NODE_NAMES.CLEAR_ADD_CARD_MODE)
  .addEdge(NODE_NAMES.CLEAR_ADD_CARD_MODE, NODE_NAMES.ROUTER)

  // User-intent flow edges
  .addEdge(NODE_NAMES.CLARIFY_INTENT, NODE_NAMES.EXPECT_USER_INTENT)
  .addConditionalEdges(
    NODE_NAMES.EXPECT_USER_INTENT,
    routeClarifyIntentOutput,
    {
      [NODE_NAMES.CLARIFY_INTENT]: NODE_NAMES.CLARIFY_INTENT,
      [NODE_NAMES.CLEAR_USER_INTENT_MODE]: NODE_NAMES.CLEAR_USER_INTENT_MODE,
    }
  )
  .addEdge(NODE_NAMES.CLEAR_USER_INTENT_MODE, NODE_NAMES.ROUTER)

  // Delete-card flow edges - includes signal node to force stream emission
  .addEdge(NODE_NAMES.DELETE_TOKEN, NODE_NAMES.SIGNAL_UI_CARD_DELETED)
  .addEdge(
    NODE_NAMES.SIGNAL_UI_CARD_DELETED,
    NODE_NAMES.CLEAR_DELETE_CARD_ACTION
  )
  .addEdge(NODE_NAMES.CLEAR_DELETE_CARD_ACTION, NODE_NAMES.ROUTER);

// Initialize MCP client and tool registry
let mcpClient: Awaited<ReturnType<typeof createMcpClient>> | null = null;
let toolRegistry: Awaited<ReturnType<typeof createToolRegistry>> | null = null;
let isMcpInitialized: boolean = false;

if (process.env.VISA_MCP_BASE_URL) {
  try {
    const baseUrl = process.env.VISA_MCP_BASE_URL;
    mcpClient = new McpClient({
      serverUrl: `${baseUrl}/mcp`,
      clientName: "langgraph-visa-agent",
      clientVersion: "1.0.0",
      maxRetries: 0, // Disabled: current error detection doesn't distinguish 401 vs 403
    });
    await mcpClient.connect();
    toolRegistry = await createToolRegistry(mcpClient);
    console.log("✓ MCP client and tool registry initialized");
    isMcpInitialized = true;
  } catch (error) {
    console.error("Failed to initialize MCP client:", error);
    isMcpInitialized = false;
  }
} else {
  console.log("ℹ️ VISA_MCP_BASE_URL not configured, MCP integration disabled");
  isMcpInitialized = false;
}

// Compile the flattened graph.
//
// Object-level authorization for the destructive delete-card flow is enforced
// in-node (deleteToken consumes the server-bound private_serverTokenId with a
// deny-by-default mismatch guard, AISAST-10709). A graph-level
// interruptBefore:[DELETE_TOKEN] confirmation gate is intentionally NOT added
// here: the web client drives the delete-card flow with a single stream.submit
// and has no wiring to resume a static graph-level interrupt (the
// InterruptHandler only handles in-node interrupt() values such as
// awaiting_otp). Adding the gate would pause before DELETE_TOKEN with no resume
// path and silently break delete-card. The server-binding match is the
// authorization control.
const compiledGraph = workflow.compile({
  checkpointer,
  interruptBefore: [],
  interruptAfter: [],
});

// Helper to enhance config with execution context
function enhanceConfig(config?: any) {
  // Read from environment variable - consistent across all calls
  const useDirectApi = process.env.USE_DIRECT_API === "true";

  // Create execution context - factory handles validation
  let executionContext: ExecutionContext | null = null;
  try {
    executionContext = createExecutionContext(
      useDirectApi,
      toolRegistry || undefined
    );
  } catch (error) {
    console.error("Failed to create execution context:", error);
  }

  return {
    ...config,
    configurable: {
      ...config?.configurable,
      executionContext,
    },
  };
}

// Export graph with Proxy to inject tool registry into all method calls
export const graph = new Proxy(compiledGraph, {
  get(target, prop, receiver) {
    // Add custom cleanup method
    if (prop === "cleanup") {
      return async () => {
        if (mcpClient) {
          await closeMcpClient(mcpClient);
        }
      };
    }

    const value = Reflect.get(target, prop, receiver);

    // If it's a function that takes config as parameter, wrap it to inject tool registry
    if (typeof value === "function") {
      return function (this: any, ...args: any[]) {
        // For methods like invoke, stream, etc. that take (input, config)
        if (args.length >= 2 && typeof args[1] === "object") {
          args[1] = enhanceConfig(args[1]);
        }
        // For methods that take just config as first param
        else if (
          args.length === 1 &&
          typeof args[0] === "object" &&
          args[0]?.configurable !== undefined
        ) {
          args[0] = enhanceConfig(args[0]);
        }

        // For invoke/stream/streamEvents methods, inject isMcpConnected into initial state if not already set
        if (
          (prop === "invoke" || prop === "stream" || prop === "streamEvents") &&
          args.length >= 1 &&
          typeof args[0] === "object"
        ) {
          // Only set isMcpConnected if it's not already in the state (i.e., new thread)
          if (args[0].isMcpConnected === undefined) {
            args[0] = {
              ...args[0],
              isMcpConnected: isMcpInitialized,
            };
          }
        }

        return value.apply(this === receiver ? target : this, args);
      };
    }

    return value;
  },
});
