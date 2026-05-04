# 📘 Explications des Choix d'Implémentation — WhisperBox

Ce document détaille les décisions techniques, l'architecture de sécurité et les choix de code effectués pour l'application de messagerie **WhisperBox**.

## 1. Architecture Cryptographique (E2EE)

L'objectif principal était de garantir que le serveur ne voit **jamais** le contenu des messages ni les clés privées en clair.

### Choix des Algorithmes
- **RSA-OAEP 2048-bit** : Utilisé pour le chiffrement asymétrique (échange de clés). C'est le standard de la **Web Crypto API**. 2048 bits offrent un excellent équilibre entre sécurité robuste et performance sur les navigateurs web.
- **AES-256-GCM** : Utilisé pour le chiffrement symétrique des messages. Le mode **GCM** (Galois/Counter Mode) est privilégié car il assure à la fois la **confidentialité** et l'**intégrité** (authentification des données), empêchant toute modification du message chiffré.
- **PBKDF2 (100,000 itérations)** : Utilisé pour dériver une clé de chiffrement à partir du mot de passe utilisateur. C'est essentiel pour "envelopper" la clé privée RSA avant de l'envoyer au serveur.

## 2. Gestion des Clés (Key Management)

### Le Concept de "Key Wrapping"
Pour permettre à un utilisateur de se connecter depuis un autre appareil sans perdre ses messages, nous devons stocker sa clé privée quelque part. 
- **Le choix** : Chiffrer la clé privée RSA avec une clé dérivée du mot de passe utilisateur (**AES-GCM**) avant l'upload.
- **Conséquence** : Le serveur stocke un blob chiffré. Même si la base de données est compromise, l'attaquant ne peut rien faire sans le mot de passe de l'utilisateur.

### Stockage Local
- **IndexedDB (`idb-keyval`)** : La clé privée *déballée* est stockée dans IndexedDB. Contrairement au `localStorage`, IndexedDB est plus structuré et mieux adapté aux données binaires. Cela permet à l'utilisateur de rafraîchir la page sans avoir à ressaisir son mot de passe pour déchiffrer ses nouveaux messages.

## 3. Logique d'Envoi et de Réception

### Double Chiffrement pour l'Historique
Dans un système E2EE classique, si j'envoie un message chiffré uniquement pour le destinataire, je ne peux plus le lire moi-même dans mon propre historique (car je n'ai pas la clé privée du destinataire).
- **Solution** : Chaque message est chiffré avec une clé AES unique. Cette clé AES est ensuite chiffrée **deux fois** :
  1. Une fois avec la clé publique du destinataire (`encrypted_key`).
  2. Une fois avec ma propre clé publique (`encrypted_key_for_self`).
- **Résultat** : Les deux participants peuvent déchiffrer la même charge utile avec leurs clés respectives.

### Polling vs WebSockets
Le backend fourni utilise une API REST classique. Pour simuler une expérience temps réel, j'ai implémenté un système de **polling** (interrogation régulière) :
- Liste des conversations : toutes les 5 secondes.
- Messages de la discussion active : toutes les 3 secondes.

## 4. Choix de l'Interface (UI/UX)

### Esthétique "Premium Dark"
L'application utilise un design **Glassmorphism** (effets de transparence et flou de fond) pour donner une impression de modernité et de sécurité.
- **Palette** : Indigo/Ardoise/Émeraude pour renforcer l'aspect "technologique" et "crypté".
- **Framer Motion** : Utilisé pour des micro-animations lors de l'apparition des messages et le passage entre les écrans, rendant l'application vivante et fluide.

### Indicateurs de Confiance
Il est crucial que l'utilisateur sache que sa connexion est sécurisée.
- Des icônes de boucliers et des badges "E2EE" sont omniprésents.
- En cas d'erreur de déchiffrement, un message explicite est affiché au lieu de faire planter l'application.

## 5. Structure du Code

- **`crypto.js`** : Module purement fonctionnel sans état, facilitant les tests unitaires de la logique de chiffrement.
- **`AuthContext.jsx`** : Centralise la sécurité. C'est le seul endroit où la clé privée "en clair" réside en mémoire, isolant ainsi la donnée la plus sensible.
- **`api.js`** : Abstraction de la communication avec le backend via Axios, incluant la gestion automatique du token JWT.
