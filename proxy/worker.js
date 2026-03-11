const json = (value, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
};

const withCors = (response, origin) => {
  const next = new Response(response.body, response);
  next.headers.set("access-control-allow-origin", origin || "*");
  next.headers.set("access-control-allow-methods", "POST, OPTIONS");
  next.headers.set("access-control-allow-headers", "content-type");
  next.headers.set("access-control-max-age", "86400");
  next.headers.set("vary", "Origin");
  return next;
};

const parseAllowedOrigins = (raw) => {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return false;
  if (allowedOrigins.length === 0) return true; // allow all if not configured
  return allowedOrigins.includes(origin);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), origin || "*");
    }

    if (!isOriginAllowed(origin, allowedOrigins)) {
      return withCors(json({ error: "Origin not allowed" }, { status: 403 }), origin || "*");
    }

    if (request.method !== "POST") {
      return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
    }

    if (url.pathname === "/openai/v1/chat/completions") {
      const apiKey = (env.GROQ_API_KEY || "").trim();
      if (!apiKey) {
        return withCors(json({ error: "Missing GROQ_API_KEY" }, { status: 500 }), origin);
      }

      const upstream = "https://api.groq.com/openai/v1/chat/completions";
      const body = await request.text();

      const upstreamResp = await fetch(upstream, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body,
      });

      const passthrough = new Response(upstreamResp.body, upstreamResp);
      passthrough.headers.delete("set-cookie");
      return withCors(passthrough, origin);
    }

    return withCors(json({ error: "Not found" }, { status: 404 }), origin || "*");
  },
};

