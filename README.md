# WhisperBox — E2EE Messaging App

A secure messaging application with end-to-end encryption. Messages are encrypted on the client before being sent — the server only stores ciphertext and never sees plaintext.

Built with React + Vite, using the Web Crypto API.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Client)                  │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Auth     │  │ Key Manager  │  │ Crypto Engine     │  │
│  │ (JWT)    │  │ (IndexedDB)  │  │ (Web Crypto API)  │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│       │               │                   │             │
│       └───────────────┼───────────────────┘             │
│                       │                                 │
│              Only encrypted data leaves                 │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────┴─────────────────────────────────┐
│                   Backend (WhisperBox API)               │
│                                                         │
│  • Stores ciphertext blobs                              │
│  • Manages user accounts                                │
│  • Routes encrypted messages between users              │
│  • Never derives, inspects, or decrypts any payload     │
└─────────────────────────────────────────────────────────┘
```

## Encryption Flow

### Registration
1. Client generates an **RSA-OAEP 2048-bit** keypair
2. The private key is wrapped (encrypted) using **AES-GCM 256-bit**, derived from the user's password via **PBKDF2** (100k iterations, SHA-256)
3. The public key and the wrapped private key blob are sent to the server
4. The raw private key never leaves the browser

### Login
1. Server returns the wrapped private key and PBKDF2 salt
2. Client re-derives the wrapping key from the password and unwraps the private key into memory
3. The unwrapped key is stored in **IndexedDB** for the session (not in localStorage)

### Sending a Message
1. A random **AES-GCM 256-bit** session key is generated for each message
2. The plaintext is encrypted with this AES key
3. The AES key is encrypted twice with RSA-OAEP:
   - Once with the **recipient's public key** → `encryptedKey`
   - Once with the **sender's public key** → `encryptedKeyForSelf`
4. The server receives `{ ciphertext, iv, encryptedKey, encryptedKeyForSelf }` — all opaque base64 blobs

### Receiving a Message
1. Client decrypts `encryptedKey` using their RSA private key → recovers the AES session key
2. Client decrypts `ciphertext` using the AES key and `iv`
3. If decryption fails (wrong key, corrupted data), a locked indicator is shown instead

## Key Management

| Key | Where it lives | How it's protected |
|-----|----------------|-------------------|
| RSA Public Key | Server (plaintext) | Public by design |
| RSA Private Key | IndexedDB (runtime) | Wrapped with AES-GCM derived from password via PBKDF2 |
| Wrapped Private Key | Server (encrypted blob) | Cannot be unwrapped without the user's password |
| AES Session Keys | Memory only (per-message) | Random, used once, then discarded |

The private key is **never** stored in plaintext in localStorage or sent to the server in cleartext.

## Security Trade-offs

- **No forward secrecy**: If a private key is compromised, all past messages encrypted with it can be decrypted. Implementing a Double Ratchet (like Signal) would fix this but adds significant complexity.
- **Password-based key wrapping**: The security of the wrapped private key depends on the strength of the user's password. A weak password means the wrapped key is vulnerable to brute-force if the server is compromised.
- **Token in localStorage**: JWT access and refresh tokens are stored in localStorage for session persistence. This is standard practice but makes them accessible to XSS attacks. HttpOnly cookies would be more secure but require backend changes.
- **Trust the server for key distribution**: When fetching a recipient's public key, we trust the server to return the correct key. A man-in-the-middle server could substitute its own key. Key fingerprint verification (like Signal's safety numbers) would mitigate this.

## Known Limitations

- Messages are polled every 4 seconds (not true real-time push)
- No message editing or deletion
- No group chats — only 1-to-1 conversations
- No file/image attachments
- No read receipts
- No offline message queue on the client side
- Key rotation is not implemented

## Tech Stack

- **React 19** + **Vite 8**
- **Web Crypto API** (AES-GCM, RSA-OAEP, PBKDF2)
- **idb-keyval** for IndexedDB storage
- **Framer Motion** for animations
- **Lucide React** for icons

## Running Locally

```bash
npm install
npm run dev
```

## Deployment

```bash
npm run build
```

The `dist/` folder can be deployed to Vercel, Netlify, or any static hosting. No environment variables needed — the API URL is configured in `src/lib/api.js`.
