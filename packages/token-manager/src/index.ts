/**
 * Visa Token Manager
 * Handles JWE token generation, caching, and automatic refresh
 */

import { CompactEncrypt, importPKCS8, SignJWT, importX509 } from 'jose';
import type { CompactJWEHeaderParameters, JWK } from 'jose';
import { X509Certificate } from 'node:crypto';
import { z } from 'zod';

const TOKEN_CONFIG = {
  EXPIRATION_SECONDS: 3600,
  REFRESH_BEFORE_EXPIRY_SECONDS: 60,
} as const;

const timeUtils = {
  secondsToMs: (seconds: number): number => seconds * 1000,
  nowInSeconds: (): number => Math.floor(Date.now() / 1000),
} as const;

/**
 * Zod schema for Visa credentials validation
 */
export const VisaCredentialsSchema = z.object({
  vicApiKey: z.string().min(1, 'VIC API key is required'),
  vicApiKeySharedSecret: z.string().min(1, 'VIC API key shared secret is required'),
  vtsApiKey: z.string().min(1, 'VTS API key is required'),
  vtsApiKeySharedSecret: z.string().min(1, 'VTS API key shared secret is required'),
  mleServerCert: z.string().min(1, 'MLE server certificate is required'),
  mlePrivateKey: z.string().min(1, 'MLE private key is required'),
  externalClientId: z.string().min(1, 'External client ID is required'),
  externalAppId: z.string().min(1, 'External app ID is required'),
  keyId: z.string().min(1, 'Key ID is required'),
  baseUrl: z.string().min(1, 'Base URL is required'),
  authorization: z.string().optional(),
  relationshipId: z.string().optional(),
});

export type VisaCredentials = z.infer<typeof VisaCredentialsSchema>;

/**
 * Zod schema for token generation result validation
 */
export const TokenGenerationResultSchema = z.object({
  token: z.string().min(1, 'Token cannot be empty'),
  expiresAt: z.date(),
});

export type TokenGenerationResult = z.infer<typeof TokenGenerationResultSchema>;

/**
 * JWKS response structure from Visa endpoint
 */
interface JwksResponse {
  keys?: JWK[];
}

/**
 * Loads Visa credentials from VISA_* environment variables
 *
 * @returns Validated Visa credentials object
 * @throws {Error} If required environment variables are missing or invalid
 */
export function loadVisaCredentials(): VisaCredentials {
  const getEnvVar = (key: string, required: boolean = true): string => {
    const value = process.env[`VISA_${key}`];

    if (required && !value) {
      throw new Error(`Missing required environment variable: VISA_${key}`);
    }

    return value || '';
  };

  try {
    const credentials = {
      vicApiKey: getEnvVar('VIC_API_KEY'),
      vicApiKeySharedSecret: getEnvVar('VIC_API_KEY_SS'),
      vtsApiKey: getEnvVar('VTS_API_KEY'),
      vtsApiKeySharedSecret: getEnvVar('VTS_API_KEY_SS'),
      mleServerCert: getEnvVar('MLE_SERVER_CERT'),
      mlePrivateKey: getEnvVar('MLE_PRIVATE_KEY'),
      externalClientId: getEnvVar('EXTERNAL_CLIENT_ID'),
      externalAppId: getEnvVar('EXTERNAL_APP_ID'),
      keyId: getEnvVar('KEY_ID'),
      baseUrl: getEnvVar('MCP_BASE_URL'),
      authorization: getEnvVar('AUTHORIZATION', false) || undefined,
      relationshipId: getEnvVar('RELATIONSHIP_ID', false) || undefined,
    };

    return VisaCredentialsSchema.parse(credentials);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Invalid Visa credentials:\n${issues.join('\n')}`);
    }
    throw new Error(
      `Failed to load Visa credentials: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetches Visa public key from JWKS endpoint for token encryption
 *
 * @param credentials - Visa credentials containing base URL
 * @returns JWKS key information
 * @throws {Error} If JWKS endpoint is unreachable or key is invalid
 *
 * @internal
 */
/**
 * Verifies the x5c certificate chain of a JWKS key before its public key is
 * trusted to encrypt Visa credentials. Without this, a JWKS endpoint that was
 * MITM'd or returned an attacker certificate would cause credentials to be
 * encrypted to an attacker-controlled key.
 *
 * Checks performed:
 *  - leaf certificate is within its validity window;
 *  - each certificate in the chain is signed by the next (linkage);
 *  - trust anchor: if VISA_JWKS_CA_PEM is configured, the top of the chain must
 *    be signed by (or equal) that trusted root; if VISA_JWKS_CERT_FINGERPRINT
 *    (sha256) is configured, the leaf fingerprint must match (pinning).
 *
 * @throws {Error} if any check fails.
 */
function verifyCertificateChain(x5c: string[], kid: string | undefined): void {
  if (!Array.isArray(x5c) || x5c.length === 0) {
    throw new Error(`JWKS key ${kid || ''} has no x5c certificate chain to verify`);
  }
  const certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64.replace(/\s/g, ''), 'base64')));
  const leaf = certs[0];

  const caPem = process.env.VISA_JWKS_CA_PEM;
  const pinnedFingerprint = process.env.VISA_JWKS_CERT_FINGERPRINT;
  const normalize = (f: string) => f.replace(/[:\s]/g, '').toLowerCase();

  // Fail closed: refuse to trust a JWKS key unless a trust anchor is configured.
  // Without an anchor, chain "linkage" only proves the chain is internally
  // consistent — an attacker can present a fully self-consistent forged chain
  // (incl. a single self-signed cert), so linkage alone is not trust.
  if (!caPem && !pinnedFingerprint) {
    throw new Error(
      'JWKS trust anchor not configured: set VISA_JWKS_CA_PEM (trusted root) or ' +
      'VISA_JWKS_CERT_FINGERPRINT (leaf sha256 pin). Refusing to trust an unanchored chain.'
    );
  }

  // Every certificate in the chain must currently be within its validity window.
  const now = Date.now();
  for (const c of certs) {
    if (now < Date.parse(c.validFrom) || now > Date.parse(c.validTo)) {
      throw new Error(`JWKS certificate ${kid || ''} is outside its validity window`);
    }
  }

  // Verify chain linkage: each cert must be issued by and signed by the next,
  // and every issuer must itself be a CA (basicConstraints CA:TRUE).
  for (let i = 0; i < certs.length - 1; i++) {
    const issuer = certs[i + 1];
    if (!certs[i].checkIssued(issuer) || !certs[i].verify(issuer.publicKey)) {
      throw new Error(`JWKS certificate chain is broken at position ${i} (${kid || ''})`);
    }
    if (issuer.ca !== true) {
      throw new Error(`JWKS chain issuer at position ${i + 1} is not a CA (${kid || ''})`);
    }
  }

  // Leaf fingerprint pin (exact end-entity match).
  if (pinnedFingerprint && normalize(leaf.fingerprint256) !== normalize(pinnedFingerprint)) {
    throw new Error('JWKS leaf certificate fingerprint does not match the pinned value');
  }

  // Trusted-root anchor: the top of the chain must equal, or be signed by, the
  // configured CA. A single self-signed leaf (length-1 x5c) only passes here if
  // it is itself the pinned cert / configured CA — never on linkage alone.
  if (caPem) {
    const ca = new X509Certificate(caPem);
    const top = certs[certs.length - 1];
    const trusted = top.fingerprint256 === ca.fingerprint256 || top.verify(ca.publicKey);
    if (!trusted) {
      throw new Error('JWKS certificate chain does not terminate at the trusted Visa root CA');
    }
  }

  // NOTE: certificate revocation (OCSP/CRL) is not performed in-process here;
  // deployments must terminate the JWKS fetch over TLS to a pinned endpoint and
  // enforce revocation at the PKI/network layer. The fingerprint pin above is
  // the in-code defense against a revoked/rotated leaf being accepted.
}

async function getVisaJwksKey(credentials: VisaCredentials): Promise<JWK> {
  const jwksUrl = `${credentials.baseUrl}/.well-known/jwks`;

  // Enforce HTTPS for the JWKS fetch: fetching keys over plaintext HTTP would
  // let a network attacker substitute the key set (MITM), defeating the chain
  // validation below.
  if (new URL(jwksUrl).protocol !== 'https:') {
    throw new Error('JWKS endpoint must be served over HTTPS');
  }

  const res = await fetch(jwksUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status} ${res.statusText}`);
  }

  const jwks = (await res.json()) as JwksResponse;

  if (!jwks.keys || jwks.keys.length === 0) {
    throw new Error('No keys found in JWKS');
  }

  // Select the key by the expected kid when configured, instead of blindly
  // trusting keys[0] (which an attacker-influenced JWKS could reorder).
  const expectedKid = process.env.VISA_JWKS_KID;
  const key = expectedKid
    ? jwks.keys.find((k) => k.kid === expectedKid)
    : jwks.keys[0];

  if (!key) {
    throw new Error(`No JWKS key matching expected kid "${expectedKid}"`);
  }

  // Validate RSA key requirements
  if (!key?.n || !key?.e) {
    throw new Error(`JWKS key ${key?.kid || 'unknown'} missing RSA modulus (n) or exponent (e)`);
  }

  if (!key?.x5c || key.x5c.length === 0) {
    throw new Error(`JWKS key ${key?.kid || 'unknown'} missing x5c certificate chain`);
  }

  // Verify the certificate chain before the public key is trusted.
  verifyCertificateChain(key.x5c, key.kid);

  return key;
}

/**
 * Generates a Visa JWE token for MCP authentication
 * Creates a JWT with credentials, signs it, and encrypts into JWE format
 *
 * @param credentials - Visa credentials containing API keys and certificates
 * @returns Token generation result with token and expiration
 * @throws {Error} If token generation fails
 */
export async function createVisaJweToken(
  credentials: VisaCredentials
): Promise<TokenGenerationResult> {
  // 1. Fetch Visa public key from JWKS
  const jwksKey = await getVisaJwksKey(credentials);
  const encryptionCertRaw = jwksKey.x5c![0]; // Safe: validated in getVisaJwksKey

  // 2. Convert x5c certificate to PEM format
  const cleanBase64 = encryptionCertRaw.replace(/[\r\n\s]/g, '');
  const wrappedCert = cleanBase64.match(/.{1,64}/g)?.join('\n') || cleanBase64;
  const certificatePem = `-----BEGIN CERTIFICATE-----\n${wrappedCert}\n-----END CERTIFICATE-----`;

  // 3. Import public key from X.509 certificate
  const publicKey = await importX509(certificatePem, 'RSA-OAEP-256');

  // 4. Build JWS payload
  const now = timeUtils.nowInSeconds();
  const expiresAtSeconds = now + TOKEN_CONFIG.EXPIRATION_SECONDS;

  const payload = {
    vdp_vic_apikey: credentials.vicApiKey,
    vdp_vic_apikey_ss: credentials.vicApiKeySharedSecret,
    vdp_vts_apikey: credentials.vtsApiKey,
    vdp_vts_apikey_ss: credentials.vtsApiKeySharedSecret,
    mle_server_cert_value: credentials.mleServerCert,
    mle_private_key_value: credentials.mlePrivateKey,
    mle_key_id: credentials.keyId,
    external_client_id: credentials.externalClientId,
    external_app_id: credentials.externalAppId,
    ...(credentials.authorization && { authorization: credentials.authorization }),
    ...(credentials.relationshipId && { relationship_id: credentials.relationshipId }),
    iat: now,
    exp: expiresAtSeconds,
    iss: credentials.baseUrl,
    aud: credentials.baseUrl,
    jti: `unique-jwt-id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  };

  // 5. Load user's signing private key and sign the JWS
  const userSigningKey = process.env.USER_SIGNING_PRIVATE_KEY;
  if (!userSigningKey) {
    throw new Error('Missing required environment variable: USER_SIGNING_PRIVATE_KEY');
  }

  const privateKey = await importPKCS8(userSigningKey, 'RS256');
  const jws = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  // 6. Prepare JWE header
  const protectedHeader: CompactJWEHeaderParameters = {
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM',
    x5c: [encryptionCertRaw],
    kid: credentials.keyId,
    typ: 'JWT',
  };

  // 7. Encrypt JWS → JWE
  const plaintext = new TextEncoder().encode(jws);
  const jwe = await new CompactEncrypt(plaintext)
    .setProtectedHeader(protectedHeader)
    .encrypt(publicKey);

  // 8. Create and validate result
  const result: TokenGenerationResult = {
    token: jwe,
    expiresAt: new Date(timeUtils.secondsToMs(expiresAtSeconds)),
  };

  return TokenGenerationResultSchema.parse(result);
}

/**
 * Token Manager for Visa MCP authentication
 * Handles automatic token generation, caching, and refresh
 */
export class TokenManager {
  private cachedToken: TokenGenerationResult | null = null;

  /**
   * Gets a valid authentication token
   * Returns cached token if still valid, otherwise generates a new one
   *
   * @returns Valid JWE token string
   * @throws {Error} If token generation fails
   */
  async getToken(): Promise<string> {
    if (this.cachedToken && !this.isExpiringSoon(this.cachedToken)) {
      return this.cachedToken.token;
    }

    const credentials = loadVisaCredentials();
    const result = await createVisaJweToken(credentials);
    this.cachedToken = result;
    return result.token;
  }

  /**
   * Checks if current token needs refresh
   *
   * @returns True if no token exists or token will expire soon
   */
  public needsRefresh(): boolean {
    return !this.cachedToken || this.isExpiringSoon(this.cachedToken);
  }

  /**
   * Clears the cached token
   * Useful for cleanup when closing connections
   */
  public clearCache(): void {
    this.cachedToken = null;
  }

  /**
   * Checks if a token will expire soon (within the refresh margin)
   *
   * @param tokenResult - Token generation result to check
   * @returns True if token will expire within REFRESH_BEFORE_EXPIRY_SECONDS
   */
  private isExpiringSoon(tokenResult: TokenGenerationResult): boolean {
    const expiresAtMs = tokenResult.expiresAt.getTime();
    const refreshThresholdMs =
      expiresAtMs - timeUtils.secondsToMs(TOKEN_CONFIG.REFRESH_BEFORE_EXPIRY_SECONDS);
    const nowMs = Date.now();

    return nowMs >= refreshThresholdMs;
  }
}
