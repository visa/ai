import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VisaLogoSVG } from "@/components/icons/visa";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { getApiKey } from "@/lib/api-key";
import { isAllowedApiUrl } from "@/lib/url-allowlist";
import { useThreads } from "./Thread";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAvailableModels, getDefaultModel } from "@/lib/models";

export type StateType = {
  messages: Message[];
  ui?: UIMessage[];
  isMcpConnected?: boolean;
  // Non-sensitive flag exposed by the agent: true when a provisioned card token
  // exists server-side for this thread. The raw provisioned token ID is NEVER
  // sent to the client (AISAST-10711); the UI renders "card active" from this.
  cardActive?: boolean;
  validationMethods?: Array<{
    method: string;
    value: string;
  }> | null;
  registerAttestationOptions?: {
    data?: {
      authenticationContext?: {
        endpoint?: string;
        identifier?: string;
        payload?: string;
        action?: string;
        platformType?: string;
      };
    };
    correlationId?: string;
  } | null;
  action?: string | null;
  cardDeletionSignal?: number;
};

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      action?: string | null;
      cardDeletionSignal?: number;
      // The raw provisioned token ID is no longer round-tripped through the
      // client (AISAST-10711); the delete-card flow reads the token from the
      // thread-scoped checkpointed server state instead.
      private_encryptedCardData?: string | null;
      email?: string | null;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream> & {
  currentModel: string;
  setCurrentModel: (model: string) => void;
};
const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
): Promise<boolean> {
  // Never send the API key to an untrusted host.
  if (!isAllowedApiUrl(apiUrl)) {
    console.error("Refusing to contact untrusted API URL:", apiUrl);
    return false;
  }
  try {
    const res = await fetch(`${apiUrl}/info`, {
      ...(apiKey && {
        headers: {
          "X-Api-Key": apiKey,
        },
      }),
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  selectedModel,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  selectedModel: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const [currentModel, setCurrentModel] = useState(selectedModel);
  const { getThreads, setThreads } = useThreads();
  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    threadId: threadId ?? null,
    onCustomEvent: (event, options) => {
      options.mutate((prev) => {
        const ui = uiMessageReducer(prev.ui ?? [], event);
        return { ...prev, ui };
      });
    },
    onThreadId: (id) => {
      setThreadId(id);
      // Refetch threads list when thread ID changes.
      // Wait for some seconds before fetching so we're able to get the new thread that was created.
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
  });

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl]);

  // Extend streamValue with model info
  const extendedStreamValue = {
    ...streamValue,
    currentModel,
    setCurrentModel,
  };

  return (
    <StreamContext.Provider value={extendedStreamValue}>
      {children}
    </StreamContext.Provider>
  );
};

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const DEFAULT_ASSISTANT_ID = "vic-agent";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envApiKey: string | undefined =
    process.env.NEXT_PUBLIC_LANGSMITH_API_KEY;

  // Use URL params with env var fallbacks
  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });

  // For API key, use localStorage with env var fallback
  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || envApiKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  // For model selection, use localStorage with fallback to default
  const [selectedModel, _setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      const storedModel = window.localStorage.getItem("lg:chat:selectedModel");
      return storedModel || getDefaultModel();
    }
    return getDefaultModel();
  });

  const setSelectedModel = (model: string) => {
    window.localStorage.setItem("lg:chat:selectedModel", model);
    _setSelectedModel(model);
  };

  // Determine final values to use, prioritizing URL params then env vars
  const finalApiUrl = apiUrl || envApiUrl;
  const finalAssistantId = assistantId || envAssistantId;

  // Refuse to mount a session (which would send the API key) for an untrusted
  // API URL — e.g. an attacker-supplied `?apiUrl=` query parameter.
  if (finalApiUrl && !isAllowedApiUrl(finalApiUrl)) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full p-4">
        <div className="flex flex-col gap-3 border bg-background shadow-lg rounded-lg max-w-xl p-8">
          <h1 className="text-xl font-bold text-[var(--visa-blue-primary)]">
            Untrusted deployment URL
          </h1>
          <p className="text-base text-muted-foreground">
            The requested agent URL <code>{finalApiUrl}</code> is not in the
            list of trusted hosts, so the application will not connect to it or
            send credentials. If this is your own deployment, add its origin to{" "}
            <code>NEXT_PUBLIC_ALLOWED_API_URLS</code>.
          </p>
        </div>
      </div>
    );
  }

  // If we're missing any required values, show the form
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full p-4">
        <div className="animate-in fade-in-0 zoom-in-95 flex flex-col border bg-background shadow-lg rounded-lg max-w-3xl">
          <div className="flex flex-col gap-4 p-8 border-b bg-gradient-to-br from-white to-blue-50">
            <div className="flex items-center gap-4">
              <VisaLogoSVG width={120} />
              <h1 className="text-3xl font-bold tracking-tight text-[var(--visa-blue-primary)]">
                Intelligent Commerce Agent
              </h1>
            </div>
            <p className="text-base text-muted-foreground">
              Welcome to Visa's Intelligent Commerce Agent! Before you get
              started, please configure your deployment settings below.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const apiUrl = formData.get("apiUrl") as string;
              const assistantId = formData.get("assistantId") as string;
              const apiKey = formData.get("apiKey") as string;

              setApiUrl(apiUrl);
              setApiKey(apiKey);
              setAssistantId(assistantId);
              // Model is set via Select component onChange, not form submission

              form.reset();
            }}
            className="flex flex-col gap-6 p-6 bg-muted/50"
          >
            <div className="flex flex-col gap-3">
              <Label
                htmlFor="apiUrl"
                className="text-base font-semibold text-[var(--visa-blue-primary)]"
              >
                Agent Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-base text-muted-foreground">
                Enter the URL of your agent deployment. This can be a local
                development server or a production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label
                htmlFor="assistantId"
                className="text-base font-semibold text-[var(--visa-blue-primary)]"
              >
                Agent ID<span className="text-rose-500">*</span>
              </Label>
              <p className="text-base text-muted-foreground">
                The unique identifier for your intelligent commerce agent (graph
                name or assistant ID).
              </p>
              <Input
                id="assistantId"
                name="assistantId"
                className="bg-background"
                defaultValue={assistantId || DEFAULT_ASSISTANT_ID}
                required
              />
            </div>

            <div className="flex flex-col gap-3">
              <Label
                htmlFor="model"
                className="text-base font-semibold text-[var(--visa-blue-primary)]"
              >
                AI Model<span className="text-rose-500">*</span>
              </Label>
              <p className="text-base text-muted-foreground">
                Select the AI language model to power your agent's responses.
              </p>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableModels().map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end mt-2">
              <Button type="submit" size="lg">
                Continue
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <StreamSession
      apiKey={apiKey}
      apiUrl={apiUrl}
      assistantId={assistantId}
      selectedModel={selectedModel}
    >
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
