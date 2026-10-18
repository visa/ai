import crypto from 'node:crypto';
import type { XPayTokenParams } from './types.js';

/**
 * Creates an X-Pay token for Visa API authentication
 * Generates an HMAC-based token using the format: xv2:{timestamp}:{hash}
 *
 * @param params - Parameters for token generation
 * @returns Promise resolving to the X-Pay token string
 */
export function createXPayToken({
  sharedSecret,
  requestUrl,
  body = '',
  timestamp,
}: XPayTokenParams): string {
  // Extract resource path from URL
  const parsedUrl = new URL(requestUrl);
  const resourcePath = parsedUrl.pathname.replace(/^\/(vacp|vdp)\//, '').replace(/^\//, ''); // Remove "/vacp/" or "/vdp/" prefix, or just leading slash

  // Visa specification requirement: query parameters must be sorted in lexicographical (alphabetical) order
  parsedUrl.searchParams.sort();
  const queryParams = parsedUrl.searchParams.toString();
  const requestBody = normalizeBody(body);
  // Generate timestamp (Unix epoch in seconds)
  const tokenTimestamp = timestamp ?? Math.floor(Date.now() / 1000);

  // Create pre-hash string
  const preHashString = buildPreHashString(tokenTimestamp, resourcePath, queryParams, requestBody);

  // Create HMAC-SHA256 hash
  const hashString = crypto
    .createHmac('sha256', Buffer.from(sharedSecret, 'utf8'))
    .update(preHashString)
    .digest('hex');

  // Return X-Pay token in format: xv2:{timestamp}:{hash}
  return `xv2:${tokenTimestamp}:${hashString}`;
}

/**
 * Normalizes the request body to a string
 */
function normalizeBody(body: string | object | undefined): string {
  if (!body) return '';
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

/**
 * Builds the pre-hash string from components
 */
function buildPreHashString(
  timestamp: number,
  resourcePath: string,
  queryParams: string,
  requestBody: string
): string {
  return `${timestamp}${resourcePath}${queryParams}${requestBody}`;
}
