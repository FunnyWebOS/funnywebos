import http from "node:http";
import { URL } from "node:url";

const port = Number.parseInt(process.env.PORT || "3000", 10);

const parseAllowedOrigins = (raw) =>
  String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

const isOriginAllowed = (origin) => {
  if (!origin) return false;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
};

const send = (res, status, body, headers = {}) => {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
};

const withCorsHeaders = (origin) => {
  const o = origin || "*";
  return {
    "access-control-allow-origin": o,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, withCorsHeaders(origin));
    return res.end();
  }

  if (url.pathname === "/health") {
    return send(res, 200, { ok: true }, withCorsHeaders(origin));
  }

  if (!isOriginAllowed(origin)) {
    return send(res, 403, { error: "Origin not allowed" }, withCorsHeaders(origin));
  }

  if (req.method !== "POST") {
    return send(res, 405, { error: "Method not allowed" }, withCorsHeaders(origin));
  }

  if (url.pathname !== "/openai/v1/chat/completions") {
    return send(res, 404, { error: "Not found" }, withCorsHeaders(origin));
  }

  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    return send(res, 500, { error: "Missing GROQ_API_KEY" }, withCorsHeaders(origin));
  }

  let bodyText = "";
  try {
    bodyText = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request body" }, withCorsHeaders(origin));
  }

  const upstream = "https://api.groq.com/openai/v1/chat/completions";
  const upstreamResp = await fetch(upstream, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: bodyText,
  });

  const respText = await upstreamResp.text();
  const headers = withCorsHeaders(origin);
  headers["content-type"] = upstreamResp.headers.get("content-type") || "application/json; charset=utf-8";
  return send(res, upstreamResp.status, respText, headers);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`AetherOS AI proxy listening on :${port}`);
});

