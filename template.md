# Guide : Créer une Application Premium (AetherOS v3)

AetherOS (FunnyWEB OS) permet de créer des applications `.html` intégrées, avec un design “Blue Glass” et une API utilisateur synchronisée.

---

## 1) Installation / Publication

- En local : mettre votre fichier dans `/apps/mon_app.html` suffit généralement.
- Sur GitHub Pages : l’auto-discovery du dossier `/apps/` n’est pas fiable (pas de listing de répertoire). Ajoutez donc une entrée dans `apps/registry.json` :

```json
{
  "id": "mon_app",
  "title": "Mon App",
  "creator": "Moi",
  "description": "Description courte.",
  "category": "productivity",
  "icon": "✨",
  "appFile": "mon_app.html"
}
```

---

## 2) Design System : Blue Glass (CSS)

### Couleurs et Tokens
```css
:root {
  --accent: #0A84FF;                /* Bleu Action */
  --glass: rgba(10, 25, 45, 0.45);  /* Bleu Glass Pro */
  --border: rgba(255, 255, 255, 0.15);
  --text: #ffffff;
  --text-dim: rgba(255, 255, 255, 0.6);
}
```

### Effet Glassmorphism Premium
Le fond du body doit être transparent pour que le flou de la fenêtre agisse.
```css
body {
  background: transparent;
  color: var(--text);
  margin: 0;
  padding: 24px;
  height: 100vh;
  box-sizing: border-box;
  font-family: -apple-system, system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}

.native-card {
  background: var(--glass);
  backdrop-filter: blur(25px) saturate(180%);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}
```

---

## 3) API Utilisateur (Synchronization)

Le système envoie un message au chargement :
```js
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'funnyweb_user_sync') {
    const { userName, sessionID, profilePic, theme, uiPreferences } = event.data;
    // userName: Nom affiché
    // sessionID: ID unique du compte
    // profilePic: Base64 de la photo de profil
    // theme: "light" | "dark"
    // uiPreferences: préférences UI (dock, notifications, etc.)
  }
});
```

---

## 4) Notifications (optionnel)

Depuis une app (iframe), vous pouvez envoyer une notification OS :
```js
window.parent?.windowManager?.notify('Mon App', 'Hello depuis mon app', 'system');
```

Les utilisateurs peuvent filtrer par type dans `Paramètres > Notifications` (ex : `settings_change`, `accounts`, `install`, etc.).

---

## 5) Template Universel (Blue Glass)

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mon App</title>
  <style>
    :root {
      --accent: #0A84FF;
      --glass: rgba(10, 25, 45, 0.45);
      --border: rgba(255, 255, 255, 0.15);
      --text: #ffffff;
    }
    body {
      margin: 0;
      padding: 24px;
      height: 100vh;
      box-sizing: border-box;
      background: transparent;
      color: var(--text);
      font-family: -apple-system, system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .main-app {
      flex: 1;
      background: var(--glass);
      backdrop-filter: blur(30px) saturate(180%);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }
    .btn {
      border: none;
      background: var(--accent);
      color: #fff;
      padding: 10px 14px;
      border-radius: 12px;
      cursor: pointer;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="main-app">
    <h1 id="welcome">Mon App</h1>
    <p style="opacity:.75">Prêt pour le futur du WebOS.</p>
    <button class="btn" onclick="notify()">Notifier</button>
  </div>

  <script>
    function notify() {
      window.parent?.windowManager?.notify('Mon App', 'Notification envoyée !', 'system');
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'funnyweb_user_sync') {
        const { userName } = event.data;
        const el = document.getElementById('welcome');
        if (el && userName) el.textContent = `Salut ${userName}`;
      }
    });
  </script>
</body>
</html>
```

---

## 6) Règles d’or

- Pensez transparent : `body { background: transparent; }`
- Stretch : `height: 100vh` + `flex: 1`
- Accent : utilisez `--accent` pour les actions principales
- Identité : utilisez `event.data.sessionID` pour identifier l’utilisateur (cloud/P2P)
