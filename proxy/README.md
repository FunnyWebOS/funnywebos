# AetherOS AI Proxy (Free)

GitHub Pages is static: any API key shipped to the browser is public. This proxy keeps your Groq key on the server side.

## 1) Prereqs

- A Cloudflare account (free)
- Node.js installed (for `wrangler`)

## 2) Install Wrangler

```bash
npm i -g wrangler
wrangler login
```

## 3) Deploy the Worker

From the repo root:

```bash
cd proxy
wrangler deploy
```

Set your secret key:

```bash
wrangler secret put GROQ_API_KEY
```

Optional (recommended): restrict calls to your GitHub Pages origin:

- Edit `proxy/wrangler.toml` and set `ALLOWED_ORIGINS`
  - Example: `https://<username>.github.io`
- Re-deploy: `wrangler deploy`

## 4) Point the frontend to the proxy

Create `env.js` at the repo root (DO NOT commit it) and set:

```js
window.AETHER_RUNTIME_ENV = {
  AETHER_AI_PROXY_URL: "https://<your-worker>.<your-subdomain>.workers.dev"
};
```

Your `index.html` already loads `env.js` before `main.js`.

## Endpoint

- `POST /openai/v1/chat/completions` (OpenAI-compatible)
  - Forwarded to `https://api.groq.com/openai/v1/chat/completions`

## Supabase Config (Optional)

If you don't want to ship Supabase config in `env.js`, this Worker can also serve it to the frontend.

- `GET /aether/v1/supabase-config`
  - Returns JSON: `{ url, anonKey, table, usernameColumn, passwordColumn }`
  - Set Worker vars/secrets (Cloudflare dashboard recommended):
    - `SUPABASE_URL`
    - `SUPABASE_ANON_KEY`
    - `SUPABASE_TABLE`
    - `SUPABASE_USERNAME_COLUMN`
    - `SUPABASE_PASSWORD_COLUMN`

Then in the frontend set either:

- `AETHER_SUPABASE_CONFIG_URL` (recommended), or
- `AETHER_AI_PROXY_URL` (fallback: the OS will try `${AETHER_AI_PROXY_URL}/aether/v1/supabase-config`).
