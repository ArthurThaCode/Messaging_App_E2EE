# 🧪 Guide de Test Complet — WhisperBox E2EE

Ce guide vous accompagne pas à pas pour tester l'application et vérifier la sécurité du chiffrement.

---

## 🚀 1. Phase d'Initialisation (Deux Utilisateurs)

Pour tester la messagerie, vous devez simuler deux personnes différentes.

### Étape 1 : Créer le premier compte (Utilisateur A)
1. Ouvrez l'application.
2. **IMPORTANT** : Cliquez sur le lien **"Join now"** ou **"Inscrivez-vous maintenant"** en bas du formulaire pour passer sur l'onglet **Création de compte**. (Le titre doit être *"Join the zero-knowledge network"*).
3. Remplissez les champs (Nom d'affichage, Nom d'utilisateur, Mot de passe).
4. Cliquez sur **"Generate Secure Identity"**.
5. **Vérification** : Vous devez arriver sur l'interface de messagerie. Un badge vert **"SECURE NODE"** doit être visible en haut à droite.

### Étape 2 : Créer le deuxième compte (Utilisateur B)
1. Ouvrez une **fenêtre de navigation privée** (Incognito).
2. Répétez l'Étape 1 avec un **identifiant différent** (ex: `user_test_2`).

---

## 💬 2. Test de Messagerie Chiffrée

### Étape 3 : Envoyer un message
1. Sur le navigateur de l'**Utilisateur A**, utilisez la barre de recherche à gauche pour chercher l'identifiant exact de l'**Utilisateur B**.
2. Cliquez sur l'utilisateur trouvé pour ouvrir la discussion.
3. Écrivez un message : *"Ceci est un secret de bout en bout"* et envoyez-le.

### Étape 4 : Recevoir et Déchiffrement
1. Allez sur le navigateur de l'**Utilisateur B**.
2. La conversation doit apparaître automatiquement à gauche.
3. Cliquez dessus. Le message doit être déchiffré et lisible.

---

## 🛡️ 3. Vérification de la Sécurité (Audit)

### Audit 1 : Le Serveur est "Aveugle" (Zero Knowledge)
1. Sur le navigateur de l'Utilisateur A, ouvrez les outils de développement (**F12** ou clic droit > Inspecter).
2. Allez dans l'onglet **Réseau** (Network).
3. Envoyez un nouveau message.
4. Cliquez sur la requête `POST /messages` qui vient d'apparaître.
5. Regardez l'onglet **Payload** (ou Charge utile).
6. **Constat** : Vous verrez des champs `ciphertext` et `encrypted_key` contenant du texte aléatoire. **Votre message en clair n'existe nulle part dans la requête.**

### Audit 2 : Persistance de la Clé Privée
1. Rafraîchissez la page (F5) de l'Utilisateur B.
2. **Constat** : Les messages sont toujours lisibles. L'application a récupéré votre clé privée sécurisée dans **IndexedDB** sans vous redemander votre mot de passe.

---

## 🛠️ 4. Résolution des Problèmes Communs

- **Erreur "Introuvable"** : Vérifiez que vous êtes sur le bon onglet (S'inscrire vs Se connecter). Si vous tentez de vous connecter avec un compte qui n'existe pas encore, vous aurez cette erreur.
- **Déchiffrement échoué** : Cela peut arriver si vous avez vidé votre cache de navigateur manuellement sans vous déconnecter proprement.
