import type { VicApiError } from './types.js';

/**
 * Extracts correlation ID from response headers (case-insensitive)
 */
export function getCorrelationId(headers: Record<string, string>): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'x-correlation-id') {
      return value;
    }
  }
  return undefined;
}

/**
 * Extracts error details from Visa API response data
 */
export function extractErrorDetails(responseData: unknown): string {
  if (!responseData || typeof responseData !== 'object' || !('responseStatus' in responseData)) {
    return '';
  }

  const status = (responseData as Record<string, unknown>).responseStatus;
  if (!status || typeof status !== 'object') {
    return '';
  }

  const statusObj = status as Record<string, unknown>;
  const parts: string[] = [];

  // Helper to safely convert unknown to string
  const toStr = (val: unknown): string => {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    return JSON.stringify(val);
  };

  if (statusObj.code !== undefined) {
    parts.push(`Code: ${toStr(statusObj.code)}`);
  }
  if (statusObj.message !== undefined) {
    parts.push(`Message: ${toStr(statusObj.message)}`);
  }
  if (statusObj.info !== undefined) {
    parts.push(`Info: ${toStr(statusObj.info)}`);
  }
  if (statusObj.severity !== undefined) {
    parts.push(`Severity: ${toStr(statusObj.severity)}`);
  }

  return parts.length > 0 ? ` - ${parts.join(', ')}` : '';
}

/**
 * Creates an enhanced error with response details
 * @param apiName - Name for error message (e.g., "VIC API" or "VTS API")
 */
export function createEnhancedError(
  response: Response,
  responseData: unknown,
  headers: Record<string, string>,
  correlationId: string | undefined,
  apiName: string
): VicApiError {
  const errorDetails = extractErrorDetails(responseData);
  const error = new Error(
    `${apiName} Error: ${response.status} ${response.statusText}${errorDetails}`
  ) as VicApiError;

  // Attach full details for debugging
  error.status = response.status;
  error.statusText = response.statusText;
  error.correlationId = correlationId;
  error.headers = headers;
  error.responseData = responseData;

  return error;
}
