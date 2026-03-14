const json = (value, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
};

const withCors = (response, origin) => {
  const next = new Response(response.body, response);
  next.headers.set("access-control-allow-origin", origin || "*");
  next.headers.set("access-control-allow-methods", "GET, POST, PATCH, OPTIONS");
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
  if (!origin) return allowedOrigins.length === 0; // allow if not configured
  if (allowedOrigins.length === 0) return true; // allow all if not configured
  return allowedOrigins.includes(origin);
};

const pickSupabase = (env) => {
  return {
    url: (env.SUPABASE_URL || "").trim(),
    anonKey: (env.SUPABASE_ANON_KEY || "").trim(),
  };
};

const supabaseFetch = async (env, path, init = {}) => {
  const supa = pickSupabase(env);
  if (!supa.url || !supa.anonKey) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_ANON_KEY");
  }

  const headers = new Headers(init.headers || {});
  headers.set("apikey", supa.anonKey);
  headers.set("authorization", `Bearer ${supa.anonKey}`);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  const url = `${supa.url.replace(/\/+$/, "")}/rest/v1/${String(path || "").replace(/^\/+/, "")}`;
  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const ct = String(resp.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return await resp.json();
  return null;
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

    // AetherOS: deliver Supabase config without shipping keys in env.js.
    // Note: This endpoint must never return a service-role key to the browser.
    if (url.pathname === "/aether/v1/supabase-config") {
      if (request.method !== "GET") {
        return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
      }

      return withCors(
        json({
          url: (env.SUPABASE_URL || "").trim(),
          anonKey: (env.SUPABASE_ANON_KEY || "").trim(),
          table: (env.SUPABASE_TABLE || "").trim(),
          usernameColumn: (env.SUPABASE_USERNAME_COLUMN || "").trim(),
          passwordColumn: (env.SUPABASE_PASSWORD_COLUMN || "").trim(),
        }),
        origin || "*"
      );
    }

    // Aether Music: proxy CRUD to Supabase without shipping keys to the browser.
    if (url.pathname === "/aether/v1/music/tracks") {
      try {
        if (request.method === "GET") {
          const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200)));
          const rows = await supabaseFetch(env, `aether_music_tracks?select=*&order=created_at.desc&limit=${limit}`, {
            method: "GET",
          });
          return withCors(json({ ok: true, rows: Array.isArray(rows) ? rows : [] }), origin || "*");
        }

        if (request.method === "POST") {
          const payload = await request.json().catch(() => null);
          const rows = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.rows) ? payload.rows : [payload]);
          const cleaned = rows.filter(Boolean);
          if (cleaned.length === 0) {
            return withCors(json({ ok: false, error: "Missing rows" }, { status: 400 }), origin || "*");
          }

          await supabaseFetch(env, "aether_music_tracks", {
            method: "POST",
            headers: { "content-type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify(cleaned),
          });

          return withCors(json({ ok: true }), origin || "*");
        }

        return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
      } catch (err) {
        return withCors(json({ ok: false, error: String(err && err.message ? err.message : err) }, { status: 500 }), origin || "*");
      }
    }

    if (url.pathname === "/aether/v1/music/tracks/plays") {
      try {
        if (request.method !== "POST") {
          return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
        }

        const payload = await request.json().catch(() => null);
        const id = payload && payload.id !== undefined && payload.id !== null ? String(payload.id) : "";
        const plays = payload && payload.plays !== undefined ? Number(payload.plays) : NaN;
        if (!id || !Number.isFinite(plays)) {
          return withCors(json({ ok: false, error: "Missing id/plays" }, { status: 400 }), origin || "*");
        }

        await supabaseFetch(env, `aether_music_tracks?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ plays }),
        });

        return withCors(json({ ok: true }), origin || "*");
      } catch (err) {
        return withCors(json({ ok: false, error: String(err && err.message ? err.message : err) }, { status: 500 }), origin || "*");
      }
    }

    if (url.pathname === "/openai/v1/chat/completions") {
      if (request.method !== "POST") {
        return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
      }

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
