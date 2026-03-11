# Railway AI Proxy (Groq)

This is a tiny backend proxy for AetherOS so your Groq API key stays server-side.

## Deploy on Railway

1) Create a new Railway project → **Deploy from GitHub repo**
2) In Railway settings, set the **Root Directory** to `railway-proxy`
3) Add **Variables**:
   - `GROQ_API_KEY` (secret)
   - `ALLOWED_ORIGINS` (recommended) e.g. `https://<user>.github.io`
4) Deploy

## Frontend config (GitHub Pages)

Set in `env.public.js` (or `env.js` locally):

```js
window.AETHER_RUNTIME_ENV = {
  AETHER_AI_PROXY_URL: "https://<your-service>.up.railway.app"
};
```

## Endpoints

- `GET /health`
- `POST /openai/v1/chat/completions` (OpenAI-compatible) → forwarded to Groq

