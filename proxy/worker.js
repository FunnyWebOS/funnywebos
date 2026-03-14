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

    // Catalog: fill the app with tracks (Audius preferred, iTunes fallback).
    if (url.pathname === "/aether/v1/catalog/trending") {
      try {
        if (request.method !== "GET") {
          return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
        }

        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
        const audiusBearer = String(env.AUDIUS_BEARER_TOKEN || "").trim();
        const audiusApiKey = String(env.AUDIUS_API_KEY || "").trim();
        const audiusAppName = String(env.AUDIUS_APP_NAME || "aether_music").trim() || "aether_music";

        if (audiusBearer) {
          const headers = new Headers();
          headers.set("authorization", `Bearer ${audiusBearer}`);
          if (audiusApiKey) headers.set("x-api-key", audiusApiKey);
          headers.set("accept", "application/json");

          const upstream = await fetch(`https://api.audius.co/v1/tracks/trending?limit=${limit}`, { headers });
          if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            throw new Error(text || `Audius HTTP ${upstream.status}`);
          }
          const payload = await upstream.json();
          const tracks = Array.isArray(payload && payload.data) ? payload.data : [];

          const pickArtwork = (t) => {
            const art = (t && (t.artwork || t.cover_art || t.coverArt)) || null;
            if (!art) return "";
            if (typeof art === "string") return art;
            if (typeof art !== "object") return "";
            return (
              art["1000x1000"] ||
              art["480x480"] ||
              art["150x150"] ||
              art["100x100"] ||
              ""
            );
          };

          const rows = tracks.map((t) => ({
            source: "audius",
            id: t && t.id ? String(t.id) : "",
            title: t && (t.title || t.track_title || t.trackTitle) ? String(t.title || t.track_title || t.trackTitle) : "",
            artist: t && (t.user && t.user.name ? t.user.name : (t.artist || t.genre)) ? String(t.user && t.user.name ? t.user.name : (t.artist || "")) : "",
            genre: t && (t.genre || t.mood) ? String(t.genre || t.mood) : "",
            coverUrl: pickArtwork(t),
            audioUrl: `${url.origin}/aether/v1/audius/stream/${encodeURIComponent(String(t && t.id ? t.id : ""))}`,
          })).filter((t) => t && t.id && t.title && t.audioUrl);

          return withCors(json({ ok: true, rows }), origin || "*");
        }

        // Public Audius (no token): works with app_name on many deployments.
        try {
          const upstream = await fetch(`https://api.audius.co/v1/tracks/trending?limit=${limit}&app_name=${encodeURIComponent(audiusAppName)}`, {
            headers: { accept: "application/json" },
          });
          if (upstream.ok) {
            const payload = await upstream.json().catch(() => null);
            const tracks = Array.isArray(payload && payload.data) ? payload.data : [];

            const pickArtwork = (t) => {
              const art = (t && (t.artwork || t.cover_art || t.coverArt)) || null;
              if (!art) return "";
              if (typeof art === "string") return art;
              if (typeof art !== "object") return "";
              return (
                art["1000x1000"] ||
                art["480x480"] ||
                art["150x150"] ||
                art["100x100"] ||
                ""
              );
            };

            const rows = tracks.map((t) => ({
              source: "audius",
              id: t && t.id ? String(t.id) : "",
              title: t && (t.title || t.track_title || t.trackTitle) ? String(t.title || t.track_title || t.trackTitle) : "",
              artist: t && (t.user && t.user.name ? t.user.name : (t.artist || "")) ? String(t.user && t.user.name ? t.user.name : (t.artist || "")) : "",
              genre: t && (t.genre || t.mood) ? String(t.genre || t.mood) : "",
              coverUrl: pickArtwork(t),
              audioUrl: `${url.origin}/aether/v1/audius/stream/${encodeURIComponent(String(t && t.id ? t.id : ""))}`,
            })).filter((t) => t && t.id && t.title && t.audioUrl);

            if (rows.length) {
              return withCors(json({ ok: true, rows, note: "audius_public" }), origin || "*");
            }
          }
        } catch (err) {
          // ignore, fallback to iTunes
        }

        // Fallback: iTunes search API (30s preview, but no key required).
        const seedTerms = [
          "top hits",
          "rap",
          "pop",
          "electronic",
          "house",
          "afrobeats",
          "phonk",
          "kpop",
        ];
        const term = seedTerms[Math.floor(Math.random() * seedTerms.length)];
        const itunesUrl = new URL("https://itunes.apple.com/search");
        itunesUrl.searchParams.set("media", "music");
        itunesUrl.searchParams.set("entity", "song");
        itunesUrl.searchParams.set("limit", String(limit));
        itunesUrl.searchParams.set("term", term);
        const itunesResp = await fetch(itunesUrl.toString(), { headers: { accept: "application/json" } });
        if (!itunesResp.ok) {
          const text = await itunesResp.text().catch(() => "");
          throw new Error(text || `iTunes HTTP ${itunesResp.status}`);
        }
        const itunesPayload = await itunesResp.json();
        const results = Array.isArray(itunesPayload && itunesPayload.results) ? itunesPayload.results : [];
        const rows = results
          .map((r) => ({
            source: "itunes",
            id: r && r.trackId ? String(r.trackId) : "",
            title: r && r.trackName ? String(r.trackName) : "",
            artist: r && r.artistName ? String(r.artistName) : "",
            genre: r && r.primaryGenreName ? String(r.primaryGenreName) : "",
            coverUrl: r && (r.artworkUrl100 || r.artworkUrl60) ? String(r.artworkUrl100 || r.artworkUrl60) : "",
            audioUrl: r && r.previewUrl ? String(r.previewUrl) : "",
          }))
          .filter((t) => t && t.id && t.title && t.audioUrl);

        return withCors(json({ ok: true, rows, note: "itunes_preview_only" }), origin || "*");
      } catch (err) {
        return withCors(json({ ok: false, error: String(err && err.message ? err.message : err) }, { status: 500 }), origin || "*");
      }
    }

    // Catalog search: return tracks for a user query (Audius preferred, iTunes fallback).
    if (url.pathname === "/aether/v1/catalog/search") {
      try {
        if (request.method !== "GET") {
          return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
        }

        const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 25)));
        const query = String(url.searchParams.get("query") || url.searchParams.get("q") || "").trim();
        if (!query) {
          return withCors(json({ ok: true, rows: [] }), origin || "*");
        }

        const audiusBearer = String(env.AUDIUS_BEARER_TOKEN || "").trim();
        const audiusApiKey = String(env.AUDIUS_API_KEY || "").trim();
        const audiusAppName = String(env.AUDIUS_APP_NAME || "aether_music").trim() || "aether_music";

        const pickArtwork = (t) => {
          const art = (t && (t.artwork || t.cover_art || t.coverArt)) || null;
          if (!art) return "";
          if (typeof art === "string") return art;
          if (typeof art !== "object") return "";
          return (
            art["1000x1000"] ||
            art["480x480"] ||
            art["150x150"] ||
            art["100x100"] ||
            ""
          );
        };

        // Audius search (token optional).
        try {
          const headers = new Headers();
          headers.set("accept", "application/json");
          if (audiusBearer) headers.set("authorization", `Bearer ${audiusBearer}`);
          if (audiusApiKey) headers.set("x-api-key", audiusApiKey);

          const upstreamUrl = audiusBearer
            ? `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`
            : `https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}&app_name=${encodeURIComponent(audiusAppName)}`;

          const upstream = await fetch(upstreamUrl, { headers });
          if (upstream.ok) {
            const payload = await upstream.json().catch(() => null);
            const tracks = Array.isArray(payload && payload.data) ? payload.data : [];
            const rows = tracks.map((t) => ({
              source: "audius",
              id: t && t.id ? String(t.id) : "",
              title: t && (t.title || t.track_title || t.trackTitle) ? String(t.title || t.track_title || t.trackTitle) : "",
              artist: t && (t.user && t.user.name ? t.user.name : (t.artist || "")) ? String(t.user && t.user.name ? t.user.name : (t.artist || "")) : "",
              genre: t && (t.genre || t.mood) ? String(t.genre || t.mood) : "",
              coverUrl: pickArtwork(t),
              audioUrl: `${url.origin}/aether/v1/audius/stream/${encodeURIComponent(String(t && t.id ? t.id : ""))}`,
            })).filter((t) => t && t.id && t.title && t.audioUrl);

            if (rows.length) {
              return withCors(json({ ok: true, rows }), origin || "*");
            }
          }
        } catch (err) {
          // ignore, fallback
        }

        // Fallback: iTunes search API (30s preview).
        const itunesUrl = new URL("https://itunes.apple.com/search");
        itunesUrl.searchParams.set("media", "music");
        itunesUrl.searchParams.set("entity", "song");
        itunesUrl.searchParams.set("limit", String(limit));
        itunesUrl.searchParams.set("term", query);
        const itunesResp = await fetch(itunesUrl.toString(), { headers: { accept: "application/json" } });
        if (!itunesResp.ok) {
          const text = await itunesResp.text().catch(() => "");
          throw new Error(text || `iTunes HTTP ${itunesResp.status}`);
        }
        const itunesPayload = await itunesResp.json();
        const results = Array.isArray(itunesPayload && itunesPayload.results) ? itunesPayload.results : [];
        const rows = results
          .map((r) => ({
            source: "itunes",
            id: r && r.trackId ? String(r.trackId) : "",
            title: r && r.trackName ? String(r.trackName) : "",
            artist: r && r.artistName ? String(r.artistName) : "",
            genre: r && r.primaryGenreName ? String(r.primaryGenreName) : "",
            coverUrl: r && (r.artworkUrl100 || r.artworkUrl60) ? String(r.artworkUrl100 || r.artworkUrl60) : "",
            audioUrl: r && r.previewUrl ? String(r.previewUrl) : "",
          }))
          .filter((t) => t && t.id && t.title && t.audioUrl);

        return withCors(json({ ok: true, rows, note: "itunes_preview_only" }), origin || "*");
      } catch (err) {
        return withCors(json({ ok: false, error: String(err && err.message ? err.message : err) }, { status: 500 }), origin || "*");
      }
    }

    // Audius: redirect to stream URL (full tracks for Audius-hosted content).
    if (url.pathname.startsWith("/aether/v1/audius/stream/")) {
      try {
        if (request.method !== "GET") {
          return withCors(json({ error: "Method not allowed" }, { status: 405 }), origin || "*");
        }

        const trackId = url.pathname.split("/").pop();
        const audiusBearer = String(env.AUDIUS_BEARER_TOKEN || "").trim();
        const audiusApiKey = String(env.AUDIUS_API_KEY || "").trim();
        const audiusAppName = String(env.AUDIUS_APP_NAME || "aether_music").trim() || "aether_music";

        // Public path (no token): just redirect to Audius API stream URL (it will redirect again to the content node).
        if (!audiusBearer) {
          const target = `https://api.audius.co/v1/tracks/${encodeURIComponent(String(trackId || ""))}/stream?app_name=${encodeURIComponent(audiusAppName)}`;
          return withCors(new Response(null, { status: 302, headers: { location: target } }), origin || "*");
        }

        const streamUrl = new URL(`https://api.audius.co/v1/tracks/${encodeURIComponent(String(trackId || ""))}/stream`);
        streamUrl.searchParams.set("no_redirect", "true");
        if (audiusApiKey) streamUrl.searchParams.set("api_key", audiusApiKey);

        const headers = new Headers();
        headers.set("authorization", `Bearer ${audiusBearer}`);
        if (audiusApiKey) headers.set("x-api-key", audiusApiKey);
        headers.set("accept", "application/json");

        const upstream = await fetch(streamUrl.toString(), { headers });
        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          throw new Error(text || `Audius HTTP ${upstream.status}`);
        }

        const payload = await upstream.json().catch(() => null);
        const target = payload && payload.data ? String(payload.data) : "";
        if (!target) throw new Error("Missing stream url");

        // Redirect so the browser can stream from the content node.
        return withCors(new Response(null, { status: 302, headers: { location: target } }), origin || "*");
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
