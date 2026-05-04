# 📦 Guide complet — Construire une app de messagerie chiffrée (E2EE)

## 🎯 Objectif
Créer une application web où :
- Les messages sont chiffrés côté client
- Le serveur ne voit jamais le contenu réel
- Seul le destinataire peut lire le message

---

# 🧱 1. Stack recommandée

## Frontend
- React (ou Next.js)
- Web Crypto API (obligatoire)

## Backend
- Node.js + Express
- Base de données (MongoDB ou PostgreSQL)

---

# 🏗️ 2. Architecture simple

## Frontend
- Génère les clés
- Chiffre les messages
- Déchiffre les messages

## Backend
- Stocke les utilisateurs
- Stocke les messages chiffrés
- Stocke les clés publiques

---

# 🔐 3. Étape 1 — Authentification

## Backend
Créer :
- POST /register
- POST /login

Utiliser :
- bcrypt (hash mot de passe)
- JWT (authentification)

## Frontend
- Form login/register
- Stocker le token (idéalement en mémoire ou cookie sécurisé)

---

# 🔑 4. Étape 2 — Génération des clés

## À faire côté frontend

Générer une paire de clés :

- RSA-OAEP (simple à implémenter)

Exemple :

```js
const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["encrypt", "decrypt"]
);
```

## Stockage

- Clé publique → envoyée au backend
- Clé privée → stockée dans IndexedDB

⚠️ Ne jamais stocker la clé privée en clair dans localStorage

---

# 🔁 5. Étape 3 — Envoi d’un message

## Étapes

1. Récupérer la clé publique du destinataire
2. Générer une clé AES (clé temporaire)
3. Chiffrer le message avec AES
4. Chiffrer la clé AES avec la clé publique du destinataire
5. Envoyer au backend :

```json
{
  "encryptedMessage": "...",
  "encryptedKey": "...",
  "iv": "..."
}
```

---

# 🔓 6. Étape 4 — Réception d’un message

## Étapes

1. Recevoir les données chiffrées
2. Déchiffrer la clé AES avec la clé privée
3. Déchiffrer le message avec AES

---

# 🔐 7. Chiffrement AES (message)

```js
const iv = crypto.getRandomValues(new Uint8Array(12));

const encrypted = await crypto.subtle.encrypt(
  {
    name: "AES-GCM",
    iv,
  },
  aesKey,
  new TextEncoder().encode(message)
);
```

---

# 🔑 8. Chiffrement de la clé AES

```js
const encryptedKey = await crypto.subtle.encrypt(
  {
    name: "RSA-OAEP"
  },
  publicKey,
  aesKey
);
```

---

# 🗄️ 9. Backend — Stockage

## Table users
- id
- email
- password
- publicKey

## Table messages
- id
- senderId
- receiverId
- encryptedMessage
- encryptedKey
- iv
- createdAt

---

# 📡 10. API endpoints

## Auth
- POST /register
- POST /login

## Keys
- GET /users/:id/public-key

## Messages
- POST /messages
- GET /messages/:userId

---

# 🧪 11. Test basique

- User A envoie message
- Backend stocke version chiffrée
- User B récupère message
- User B peut lire
- Backend ne peut pas lire

---

# 🛡️ 12. Bonnes pratiques sécurité

- Toujours utiliser HTTPS
- Valider toutes les entrées
- Gérer les erreurs de déchiffrement
- Ne jamais exposer de clé privée

---

# ⭐ 13. Bonus (optionnel mais très valorisé)

- Forward secrecy (ECDH)
- Protection contre replay attacks
- Chiffrement des clés privées avec mot de passe

---

# 🧠 Résumé simple

1. Login utilisateur
2. Génération des clés
3. Chiffrement côté client
4. Stockage côté serveur (chiffré uniquement)
5. Déchiffrement côté client

---

# 🚀 Plan d’action rapide

Jour 1 : Auth + Backend
Jour 2 : Clés + stockage
Jour 3 : Envoi message chiffré
Jour 4 : Réception + UI
Jour 5 : Sécurité + polish

---

# 📌 Conclusion

Ce projet teste :
- ta compréhension du frontend
- ta logique backend
- ta maîtrise de la sécurité

Si c’est bien fait, c’est un projet très solide pour portfolio.

