/**
 * Card storage utilities.
 *
 * Security approach:
 * - Raw card data (PAN, CVV, expiry) is NEVER persisted. It is encrypted
 *   client-side (see card-encryption.ts) and submitted directly to the agent
 *   for tokenization; the cleartext is held only transiently in memory.
 * - The provisioned token ID is NO LONGER stored client-side (AISAST-10711).
 *   It stays in the thread-scoped checkpointed server state and never reaches
 *   the browser. Only non-sensitive display data (last four, brand, expiry,
 *   cardholder name) is kept in localStorage.
 * - CVV / Sensitive Authentication Data is never stored under any key.
 *
 * The token-ID helpers below remain only to evict any token persisted by an
 * older build; new flows do not write the token key.
 */

/**
 * Clear any stale card credential (legacy token ID key) from localStorage.
 * Called when the user explicitly removes the card / on the deletion signal.
 * Display data (last four, etc.) is managed separately by the card UI
 * components.
 */
export function clearStoredCard(): void {
  try {
    clearTokenId();
    console.log("[Card Storage] Token ID cleared");
  } catch (error) {
    console.error("Failed to clear stored card:", error);
  }
}

// Token ID storage
const TOKEN_ID_KEY = "visa-token-id";

/**
 * Store token ID in localStorage.
 * Token ID is provisioned by Visa tokenization service and persists across sessions.
 *
 * @param tokenId - Provisioned token ID from agent
 */
export function storeTokenId(tokenId: string): void {
  try {
    localStorage.setItem(TOKEN_ID_KEY, tokenId);
    console.log("[Card Storage] Token ID stored");
  } catch (error) {
    console.error("[Card Storage] Failed to store token ID:", error);
  }
}

/**
 * Retrieve token ID from localStorage.
 *
 * @returns Token ID or null if not found
 */
export function getTokenId(): string | null {
  try {
    return localStorage.getItem(TOKEN_ID_KEY);
  } catch (error) {
    console.error("[Card Storage] Failed to get token ID:", error);
    return null;
  }
}

/**
 * Clear token ID from localStorage.
 * Should be called when user explicitly removes the card or token becomes invalid.
 */
export function clearTokenId(): void {
  try {
    localStorage.removeItem(TOKEN_ID_KEY);
    console.log("[Card Storage] Token ID cleared");
  } catch (error) {
    console.error("[Card Storage] Failed to clear token ID:", error);
  }
}

/**
 * Check if token ID exists in localStorage.
 *
 * @returns true if token ID exists, false otherwise
 */
export function hasTokenId(): boolean {
  try {
    return localStorage.getItem(TOKEN_ID_KEY) !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Update card status in localStorage.
 * Used to transition card from "in_progress" to "active" after device binding.
 *
 * @param status - New status to set ("active" | "in_progress")
 */
export function updateCardStatus(status: "active" | "in_progress"): void {
  try {
    const cardDataStr = localStorage.getItem("visa-card-data");
    if (cardDataStr) {
      const cardData = JSON.parse(cardDataStr);
      cardData.status = status;
      localStorage.setItem("visa-card-data", JSON.stringify(cardData));
      console.log(`[Card Storage] Card status updated to: ${status}`);
    } else {
      console.warn("[Card Storage] No card data found to update status");
    }
  } catch (error) {
    console.error("[Card Storage] Failed to update card status:", error);
  }
}
