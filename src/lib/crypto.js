/**
 * Cryptographic utilities for End-to-End Encryption (E2EE)
 * Using Web Crypto API
 */

const RSA_ALGO = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALGO = {
  name: "AES-GCM",
  length: 256,
};

/**
 * Utility to convert ArrayBuffer to Base64
 */
export const bufferToBase64 = (buffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
};

/**
 * Utility to convert Base64 to ArrayBuffer
 */
export const base64ToBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Generate a new RSA-OAEP key pair for a user
 */
export const generateIdentity = async () => {
  const keyPair = await window.crypto.subtle.generateKey(
    RSA_ALGO,
    true, // extractable
    ["encrypt", "decrypt"]
  );

  // Export keys for storage/transmission
  const publicKeyBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: bufferToBase64(publicKeyBuffer),
    privateKey: bufferToBase64(privateKeyBuffer),
    rawKeyPair: keyPair,
  };
};

/**
 * Derive an AES-GCM key from a password and salt using PBKDF2
 */
export const deriveKeyFromPassword = async (password, saltBase64) => {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = base64ToBuffer(saltBase64);

  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    AES_ALGO,
    false, // not extractable
    ["encrypt", "decrypt"]
  );
};

/**
 * Wrap a private key with a password-derived key
 */
export const wrapPrivateKey = async (privateKeyBase64, password, saltBase64) => {
  const aesKey = await deriveKeyFromPassword(password, saltBase64);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const privateKeyBuffer = base64ToBuffer(privateKeyBase64);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    privateKeyBuffer
  );

  return {
    wrappedKey: bufferToBase64(encryptedBuffer),
    iv: bufferToBase64(iv),
  };
};

/**
 * Unwrap a private key using a password
 */
export const unwrapPrivateKey = async (wrappedKeyBase64, ivBase64, password, saltBase64) => {
  const aesKey = await deriveKeyFromPassword(password, saltBase64);
  const iv = base64ToBuffer(ivBase64);
  const wrappedKey = base64ToBuffer(wrappedKeyBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    wrappedKey
  );

  return bufferToBase64(decryptedBuffer);
};

/**
 * Encrypt a message for a recipient
 */
export const encryptPayload = async (plaintext, recipientPublicKeyBase64) => {
  // 1. Generate random AES session key
  const aesKey = await window.crypto.subtle.generateKey(
    AES_ALGO,
    true, // extractable (need to wrap it)
    ["encrypt", "decrypt"]
  );

  // 2. Encrypt message with AES
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(plaintext)
  );

  // 3. Wrap AES key with recipient's RSA public key
  const recipientPublicKey = await window.crypto.subtle.importKey(
    "spki",
    base64ToBuffer(recipientPublicKeyBase64),
    RSA_ALGO,
    false,
    ["encrypt"]
  );

  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAesKey
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv),
    encryptedKey: bufferToBase64(encryptedKeyBuffer),
  };
};

/**
 * Decrypt a message using recipient's private key
 */
export const decryptPayload = async (payload, privateKeyBase64) => {
  const { ciphertext, iv, encryptedKey } = payload;

  // 1. Import recipient's private key
  const privateKey = await window.crypto.subtle.importKey(
    "pkcs8",
    base64ToBuffer(privateKeyBase64),
    RSA_ALGO,
    false,
    ["decrypt"]
  );

  // 2. Decrypt AES session key
  const aesKeyBuffer = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToBuffer(encryptedKey)
  );

  const aesKey = await window.crypto.subtle.importKey(
    "raw",
    aesKeyBuffer,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  // 3. Decrypt message
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(iv) },
    aesKey,
    base64ToBuffer(ciphertext)
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
};
