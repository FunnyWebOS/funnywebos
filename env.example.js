// Copy this file to `env.js` (do not commit `env.js`).
// WARNING: Anything in `env.js` is public on GitHub Pages. Put only non-secrets here.
window.AETHER_RUNTIME_ENV = {
  // Cloudflare Worker proxy URL (recommended): keeps your IA key server-side
  // Example: "https://aetheros-ai-proxy.<your-subdomain>.workers.dev"
  AETHER_AI_PROXY_URL: "",

  // Supabase (optionnel): anon key is public; NEVER put service_role keys in the browser.
  // Sans Supabase, tu peux quand meme creer des comptes locaux (stockes dans localStorage).
  AETHER_SUPABASE_URL: "",
  AETHER_SUPABASE_ANON_KEY: "",
  AETHER_SUPABASE_TABLE: ""
};
