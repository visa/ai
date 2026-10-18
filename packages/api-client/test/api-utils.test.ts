import test from 'node:test';
import assert from 'node:assert/strict';
import { getCorrelationId, extractErrorDetails, createEnhancedError } from '../src/api-utils.js';

test('getCorrelationId extracts correlation ID case-insensitively', () => {
  assert.strictEqual(
    getCorrelationId({ 'x-correlation-id': 'corr-lower-123' }),
    'corr-lower-123'
  );
  assert.strictEqual(
    getCorrelationId({ 'X-CORRELATION-ID': 'corr-upper-456' }),
    'corr-upper-456'
  );
  assert.strictEqual(
    getCorrelationId({ 'X-Correlation-Id': 'corr-mixed-789' }),
    'corr-mixed-789'
  );
  assert.strictEqual(
    getCorrelationId({ 'content-type': 'application/json' }),
    undefined
  );
});

test('extractErrorDetails formats status object fields', () => {
  const statusPayload = {
    responseStatus: {
      code: '400.123',
      message: 'Invalid account number',
      info: 'Check digit validation failed',
      severity: 'ERROR',
    },
  };

  const details = extractErrorDetails(statusPayload);
  assert.strictEqual(
    details,
    ' - Code: 400.123, Message: Invalid account number, Info: Check digit validation failed, Severity: ERROR'
  );
});

test('extractErrorDetails handles partial or non-object status payload', () => {
  assert.strictEqual(extractErrorDetails(null), '');
  assert.strictEqual(extractErrorDetails({}), '');
  assert.strictEqual(extractErrorDetails({ responseStatus: 'string status' }), '');
  assert.strictEqual(
    extractErrorDetails({ responseStatus: { message: 'Only message provided' } }),
    ' - Message: Only message provided'
  );
});

test('createEnhancedError populates error properties', () => {
  const mockResponse = {
    status: 404,
    statusText: 'Not Found',
  } as unknown as Response;

  const responseData = {
    responseStatus: {
      code: '404.1',
      message: 'Resource not found',
    },
  };

  const headers = { 'X-Correlation-Id': 'test-corr-id' };
  const correlationId = 'test-corr-id';

  const err = createEnhancedError(mockResponse, responseData, headers, correlationId, 'VIC API');

  assert.strictEqual(err.message, 'VIC API Error: 404 Not Found - Code: 404.1, Message: Resource not found');
  assert.strictEqual(err.status, 404);
  assert.strictEqual(err.statusText, 'Not Found');
  assert.strictEqual(err.correlationId, 'test-corr-id');
  assert.deepStrictEqual(err.headers, headers);
  assert.deepStrictEqual(err.responseData, responseData);
});
