type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
};

/**
 * KOVA UI-development mode:
 * external content API proxies are intentionally disabled.
 * Firebase Auth/Firestore continue to handle account and support systems.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({
        error: "KOVA content APIs are disabled during UI development.",
        mode: "local-demo",
      }), {
        status: 410,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
