/**
 * Type definitions for VIC API Client
 */

/**
 * Response wrapper that includes data, headers, and correlation ID
 */
export interface VicResponse<T = unknown> {
  /** Response data */
  data: T;
  /** Correlation ID from x-correlation-id header */
  correlationId?: string;
}

/**
 * Parameters for X-Pay token generation
 */
export interface XPayTokenParams {
  /** The shared secret used for HMAC generation */
  sharedSecret: string;
  /** The request URL to extract resource path and query parameters */
  requestUrl: string;
  /** Optional request body (string or object) */
  body?: string | object;
  /** Optional Unix epoch timestamp in seconds override (defaults to current time) */
  timestamp?: number;
}

/**
 * MLE configuration for encryption/decryption
 */
export interface MleConfig {
  /** The MLE server certificate value for encryption */
  serverCertValue: string;
  /** The MLE key ID */
  keyId: string;
  /** The MLE private key value for decryption */
  privateKeyValue: string;
}

/**
 * Enhanced error with VIC API response details
 */
export interface VicApiError extends Error {
  /** HTTP status code */
  status?: number;
  /** HTTP status text */
  statusText?: string;
  /** Correlation ID from response headers */
  correlationId?: string;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response data */
  responseData?: unknown;
}
