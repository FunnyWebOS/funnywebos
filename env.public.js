// Public runtime config (safe to commit).
// This file is loaded on GitHub Pages.
window.AETHER_RUNTIME_ENV = window.AETHER_RUNTIME_ENV || {};

// Set your deployed proxy base URL here (no trailing slash).
// Example: "https://aetheros-ai-proxy.<your-subdomain>.workers.dev"
window.AETHER_RUNTIME_ENV.AETHER_AI_PROXY_URL = window.AETHER_RUNTIME_ENV.AETHER_AI_PROXY_URL || "https://aetheros-ai-proxy.aetheros.workers.dev";

// Optional: Fetch Supabase config from your Cloudflare Worker (so you don't ship keys in env.js).
// If not set, the OS will try `${AETHER_AI_PROXY_URL}/aether/v1/supabase-config` as a fallback.
window.AETHER_RUNTIME_ENV.AETHER_SUPABASE_CONFIG_URL = window.AETHER_RUNTIME_ENV.AETHER_SUPABASE_CONFIG_URL || "";

// Optional: Ultraviolet proxy config for `newbrowser/` (le nouveau navigateur).
// Set `AETHER_UV_ORIGIN` to your deployed UV site origin (no trailing slash), e.g. "https://uv.example.com".
// If `AETHER_UV_ORIGIN` is set and `AETHER_BROWSER_PROXY_PROVIDER` is not, the browser auto-selects UV.
// Leave empty unless you actually deployed an Ultraviolet server (GitHub Pages is static).
window.AETHER_RUNTIME_ENV.AETHER_UV_ORIGIN = window.AETHER_RUNTIME_ENV.AETHER_UV_ORIGIN || "https://funnywebos.onrender.com";
window.AETHER_RUNTIME_ENV.AETHER_UV_PREFIX = window.AETHER_RUNTIME_ENV.AETHER_UV_PREFIX || "";
window.AETHER_RUNTIME_ENV.AETHER_UV_CODEC = window.AETHER_RUNTIME_ENV.AETHER_UV_CODEC || "Epoxy";
