// The off-chain hand-off resolveAuction() depends on: after closeAuction,
// each bidder needs to get their own (bidValue, blinding) to the auctioneer
// so the auctioneer can build the resolution proof (see contract README
// "How resolution actually achieves privacy"). This module only handles
// encrypting that payload to the auctioneer's public key - transport (a
// paste box, email, a small relay service) is a separate, deliberately
// unopinionated choice left to whoever runs the auction.
//
// ECDH (P-256) + HKDF-SHA-256 + AES-256-GCM, using the standard Web Crypto
// API (available in both the browser and Node 22+) - no extra crypto
// dependency. Each reveal uses a fresh ephemeral keypair (standard ECIES
// pattern), so compromising one reveal's ciphertext never exposes another's.

const CURVE = 'P-256' as const;
const HKDF_INFO = new TextEncoder().encode('sealed-bid-auction:reveal:v1');

export type AuctioneerKeyPair = {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
};

export type EncryptedReveal = {
  ephemeralPublicKeyJwk: JsonWebKey;
  ivBase64: string;
  ciphertextBase64: string;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

// bidValue is Uint<128> on-chain - encode as a fixed 16-byte big-endian
// integer so the plaintext layout never depends on how large the value is.
const encodeBidValue = (bidValue: bigint): Uint8Array => {
  const bytes = new Uint8Array(16);
  let remaining = bidValue;
  for (let i = 15; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
};

const decodeBidValue = (bytes: Uint8Array): bigint => {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
};

/** Generates a fresh keypair for an auctioneer. The private key never leaves their device. */
export async function generateAuctioneerKeyPair(): Promise<AuctioneerKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, ['deriveBits']);
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey('jwk', keyPair.publicKey),
    crypto.subtle.exportKey('jwk', keyPair.privateKey),
  ]);
  return { publicKeyJwk, privateKeyJwk };
}

const deriveAesKey = async (
  ecdhPrivateKey: CryptoKey,
  ecdhPublicKey: CryptoKey,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> => {
  const sharedSecret = await crypto.subtle.deriveBits({ name: 'ECDH', public: ecdhPublicKey }, ecdhPrivateKey, 256);
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
};

/** Encrypts one bidder's reveal to the auctioneer's public key. Called by the bidder. */
export async function encryptReveal(
  auctioneerPublicKeyJwk: JsonWebKey,
  bidValue: bigint,
  blinding: Uint8Array,
): Promise<EncryptedReveal> {
  if (blinding.length !== 32) throw new Error('blinding must be 32 bytes');

  const auctioneerPublicKey = await crypto.subtle.importKey(
    'jwk',
    auctioneerPublicKeyJwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    [],
  );
  const ephemeralKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: CURVE }, true, [
    'deriveBits',
  ]);
  const aesKey = await deriveAesKey(ephemeralKeyPair.privateKey, auctioneerPublicKey, 'encrypt');

  const plaintext = new Uint8Array(48);
  plaintext.set(encodeBidValue(bidValue), 0);
  plaintext.set(blinding, 16);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext as BufferSource);

  return {
    ephemeralPublicKeyJwk: await crypto.subtle.exportKey('jwk', ephemeralKeyPair.publicKey),
    ivBase64: toBase64(iv),
    ciphertextBase64: toBase64(new Uint8Array(ciphertext)),
  };
}

/** Decrypts one bidder's reveal. Called by the auctioneer, locally, right before resolveAuction(). */
export async function decryptReveal(
  auctioneerPrivateKeyJwk: JsonWebKey,
  encrypted: EncryptedReveal,
): Promise<{ bidValue: bigint; blinding: Uint8Array }> {
  const auctioneerPrivateKey = await crypto.subtle.importKey(
    'jwk',
    auctioneerPrivateKeyJwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    ['deriveBits'],
  );
  const ephemeralPublicKey = await crypto.subtle.importKey(
    'jwk',
    encrypted.ephemeralPublicKeyJwk,
    { name: 'ECDH', namedCurve: CURVE },
    false,
    [],
  );
  const aesKey = await deriveAesKey(auctioneerPrivateKey, ephemeralPublicKey, 'decrypt');

  const iv = fromBase64(encrypted.ivBase64) as BufferSource;
  const ciphertext = fromBase64(encrypted.ciphertextBase64) as BufferSource;
  const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext));

  return {
    bidValue: decodeBidValue(plaintext.subarray(0, 16)),
    blinding: plaintext.subarray(16, 48),
  };
}
