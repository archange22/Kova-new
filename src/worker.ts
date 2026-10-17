type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

const API_ORIGIN = "https://api.mangadex.org";
const COVER_ORIGIN = "https://uploads.mangadex.org";

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Vary": "Origin",
  };
}

function allowedImageHost(hostname: string) {
  return hostname === "mangadex.network" || hostname.endsWith(".mangadex.network");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      let upstream: URL | null = null;

      if (url.pathname.startsWith("/api/mangadex/")) {
        const apiPath = url.pathname.slice("/api/mangadex".length);
        upstream = new URL(apiPath + url.search, API_ORIGIN);
      } else if (url.pathname.startsWith("/api/mangadex-cover/")) {
        const coverPath = url.pathname.slice("/api/mangadex-cover".length);
        upstream = new URL("/covers" + coverPath, COVER_ORIGIN);
      } else if (url.pathname === "/api/mangadex-image") {
        const imageUrl = url.searchParams.get("url");
        if (!imageUrl) return new Response("Missing image URL", { status: 400 });
        let parsed: URL;
        try {
          parsed = new URL(imageUrl);
        } catch {
          return new Response("Invalid image URL", { status: 400 });
        }
        if (parsed.protocol !== "https:" || !allowedImageHost(parsed.hostname)) {
          return new Response("Image host not allowed", { status: 403 });
        }
        upstream = parsed;
      }

      if (upstream) {
        const response = await fetch(upstream.toString(), {
          method: request.method,
          headers: {
            "Accept": url.pathname.startsWith("/api/mangadex/") ? "application/json" : "image/avif,image/webp,image/*,*/*",
            "User-Agent": "KOVA/1.0 (MangaDex public API client)",
          },
          redirect: "follow",
        });
        const headers = new Headers();
        const contentType = response.headers.get("Content-Type");
        if (contentType) headers.set("Content-Type", contentType);
        headers.set("Cache-Control", url.pathname.startsWith("/api/mangadex/") ? "public, max-age=60" : "public, max-age=3600");
        Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
        return new Response(request.method === "HEAD" ? null : response.body, {
          status: response.status,
          headers,
        });
      }
    } catch {
      return new Response("MangaDex est momentanément inaccessible. Réessaie dans un instant.", {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...cors },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
