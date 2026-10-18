import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createXPayToken } from '../src/x-pay-token.js';

test('createXPayToken generates token in xv2:{timestamp}:{hash} format', () => {
  const token = createXPayToken({
    sharedSecret: 'test_secret_123',
    requestUrl: 'https://sandbox.api.visa.com/vdp/helloworld?apikey=test_key',
    body: '',
    timestamp: 1600000000,
  });

  assert.match(token, /^xv2:1600000000:[a-f0-9]{64}$/);
});

test('createXPayToken sorts query parameters lexicographically per Visa VDP spec', () => {
  const sharedSecret = 'secret_key_abc';
  const timestamp = 1700000000;

  // Unsorted URL: sort is before apikey, limit is before sort
  const unsortedUrl = 'https://sandbox.api.visa.com/vdp/helloworld?sort=asc&apikey=my_key&limit=10';
  // Canonical pre-sorted URL: apikey, limit, sort
  const canonicalUrl = 'https://sandbox.api.visa.com/vdp/helloworld?apikey=my_key&limit=10&sort=asc';

  const tokenUnsorted = createXPayToken({
    sharedSecret,
    requestUrl: unsortedUrl,
    timestamp,
  });

  const tokenCanonical = createXPayToken({
    sharedSecret,
    requestUrl: canonicalUrl,
    timestamp,
  });

  // Both must produce the exact same token because query parameters are canonically sorted
  assert.strictEqual(tokenUnsorted, tokenCanonical);

  // Verify HMAC computation directly:
  // Resource path: helloworld
  // Sorted query string: apikey=my_key&limit=10&sort=asc
  // Body: empty string
  const preHash = `${timestamp}helloworldapikey=my_key&limit=10&sort=asc`;
  const expectedHash = crypto
    .createHmac('sha256', Buffer.from(sharedSecret, 'utf8'))
    .update(preHash)
    .digest('hex');

  assert.strictEqual(tokenUnsorted, `xv2:${timestamp}:${expectedHash}`);
});

test('createXPayToken handles POST request with JSON body', () => {
  const sharedSecret = 'test_secret';
  const timestamp = 1650000000;
  const body = { accountId: '12345', amount: 100.5 };
  const bodyString = JSON.stringify(body);

  const tokenFromObject = createXPayToken({
    sharedSecret,
    requestUrl: 'https://sandbox.api.visa.com/vacp/v1/cards?apikey=test_key',
    body,
    timestamp,
  });

  const tokenFromString = createXPayToken({
    sharedSecret,
    requestUrl: 'https://sandbox.api.visa.com/vacp/v1/cards?apikey=test_key',
    body: bodyString,
    timestamp,
  });

  assert.strictEqual(tokenFromObject, tokenFromString);

  // Resource path for /vacp/v1/cards is v1/cards
  const preHash = `${timestamp}v1/cardsapikey=test_key${bodyString}`;
  const expectedHash = crypto
    .createHmac('sha256', Buffer.from(sharedSecret, 'utf8'))
    .update(preHash)
    .digest('hex');

  assert.strictEqual(tokenFromObject, `xv2:${timestamp}:${expectedHash}`);
});

test('createXPayToken handles URLs without /vdp/ or /vacp/ prefix', () => {
  const sharedSecret = 'vts_secret';
  const timestamp = 1680000000;

  const token = createXPayToken({
    sharedSecret,
    requestUrl: 'https://sandbox.api.visa.com/vts/provisionedTokens?apiKey=vts_key',
    timestamp,
  });

  // Resource path strips leading slash -> vts/provisionedTokens
  const preHash = `${timestamp}vts/provisionedTokensapiKey=vts_key`;
  const expectedHash = crypto
    .createHmac('sha256', Buffer.from(sharedSecret, 'utf8'))
    .update(preHash)
    .digest('hex');

  assert.strictEqual(token, `xv2:${timestamp}:${expectedHash}`);
});

test('createXPayToken handles URLs with no query string', () => {
  const sharedSecret = 'secret_no_query';
  const timestamp = 1690000000;

  const token = createXPayToken({
    sharedSecret,
    requestUrl: 'https://sandbox.api.visa.com/vdp/helloworld',
    timestamp,
  });

  const preHash = `${timestamp}helloworld`;
  const expectedHash = crypto
    .createHmac('sha256', Buffer.from(sharedSecret, 'utf8'))
    .update(preHash)
    .digest('hex');

  assert.strictEqual(token, `xv2:${timestamp}:${expectedHash}`);
});
