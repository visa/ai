import { useState, useEffect, useRef } from "react";
import { CardDisplay, EmptyState } from "./card-display";
import { AddCardModal } from "./add-card-modal";
import { DeleteCardDialog } from "./delete-card-dialog";
import { type CardFormData } from "@/lib/validations/card";
import { detectCardBrand, getLastFourDigits } from "@/lib/utils/card-utils";
import { toast } from "sonner";
import { clearStoredCard } from "@/lib/card-storage";
import { encryptCardData } from "@/lib/card-encryption";
import { useStreamContext } from "@/providers/Stream";

interface CardData {
  lastFourDigits: string;
  cardholderName: string;
  cardBrand: string;
  expiryDate: string;
  status: "active" | "in_progress";
}

const CARD_STORAGE_KEY = "visa-card-data";

export function CardSection() {
  const stream = useStreamContext();
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Load card data from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CARD_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setCardData(parsed);
      }
    } catch (error) {
      console.error("Failed to load card data:", error);
    }
  }, []);

  // Save card data to localStorage whenever it changes
  useEffect(() => {
    try {
      if (cardData) {
        localStorage.setItem(CARD_STORAGE_KEY, JSON.stringify(cardData));
      } else {
        localStorage.removeItem(CARD_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save card data:", error);
    }
  }, [cardData]);

  // Watch for cardDeletionSignal changes to trigger card clearing
  // Using a ref to track the last processed signal value
  const lastDeletionSignalRef = useRef<number>(0);

  useEffect(() => {
    const currentSignal = stream.values?.cardDeletionSignal ?? 0;

    // If signal incremented and we have card data, clear it
    if (currentSignal > lastDeletionSignalRef.current && cardData) {
      console.log("[CardSection] Deletion signal received, clearing UI");

      // Clear the stored credential (token ID); display data is cleared below.
      clearStoredCard();

      // Clear React state for UI update
      setCardData(null);

      // Show success toast
      toast.success("Card removed successfully");

      // Update ref to prevent re-processing same signal
      lastDeletionSignalRef.current = currentSignal;

      console.log("=== UI: CARD DATA CLEARED ===");
    } else if (currentSignal > lastDeletionSignalRef.current) {
      // Signal incremented but no card data - update ref anyway
      console.log("=== UI: SIGNAL UPDATED (NO CARD) ===");
      lastDeletionSignalRef.current = currentSignal;
    }
  }, [stream.values?.cardDeletionSignal, cardData]);

  const handleCardSubmit = async (formData: CardFormData) => {
    // Encrypt the raw card data client-side and submit the ciphertext to the
    // agent for tokenization. Cleartext PAN/CVV is never persisted.
    let encryptedCardData: string;
    try {
      encryptedCardData = await encryptCardData(formData);
    } catch (error) {
      console.error("Failed to encrypt card data:", error);
      toast.error("Could not securely process the card. Please try again.");
      return;
    }

    // Transform form data to non-sensitive display data
    const newCardData: CardData = {
      lastFourDigits: getLastFourDigits(formData.cardNumber),
      cardholderName: formData.cardholderName,
      cardBrand: detectCardBrand(formData.cardNumber),
      expiryDate: formData.expiryDate,
      status: "in_progress", // Default to in_progress, will be activated later
    };

    // Set cardData state (triggers localStorage save of display data via useEffect)
    setCardData(newCardData);

    // Submit the encrypted card payload to the agent to drive tokenization.
    stream.submit(
      {
        private_encryptedCardData: encryptedCardData,
        email: formData.email,
      } as any,
      {
        streamMode: ["values"],
        config: {
          configurable: {
            model: stream.currentModel,
          },
        },
      },
    );

    // Show success toast
    toast.success("Card added successfully");

    // Close modal
    setModalOpen(false);
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    // Send action to agent to trigger delete-card subgraph. The token ID is NOT
    // sent from the client (AISAST-10711): the agent deletes the token bound to
    // this thread's checkpointed server state (private_serverTokenId), enforced
    // deny-by-default in deleteToken (AISAST-10709).
    stream.submit(
      {
        action: "delete-card", // Public action field
      },
      {
        streamMode: ["values"],
        config: {
          configurable: {
            model: stream.currentModel,
          },
        },
      },
    );

    // Note: Don't clear localStorage here - wait for agent signal
    // Agent will set shouldClearCardStorage: true after successful deletion
    // thread/index.tsx will handle the actual localStorage clearing
  };

  return (
    <>
      {cardData ? (
        <CardDisplay cardData={cardData} onDelete={handleDeleteClick} />
      ) : (
        <EmptyState onAddClick={() => setModalOpen(true)} />
      )}

      <AddCardModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCardSubmit}
      />

      {cardData && (
        <DeleteCardDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
          lastFourDigits={cardData.lastFourDigits}
        />
      )}
    </>
  );
}
