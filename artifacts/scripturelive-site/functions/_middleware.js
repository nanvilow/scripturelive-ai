// Edge SEO middleware for the ScriptureLive marketing SPA on Cloudflare Pages.
//
// The site is a single-page app: every route is served the same static
// index.html (via the `/*  /index.html  200` rule in _redirects), whose
// canonical/robots/title reflect the homepage. Client-side <SeoHead> fixes the
// head after hydration, but the FIRST byte Googlebot fetches for /privacy or
// /terms still claims the homepage canonical — which is what produces the
// "Alternate page with proper canonical tag" warning in Search Console.
//
// This middleware rewrites the head per request path at the edge so the
// initial HTML is already correct. Known content routes become self-canonical
// and indexable; unknown routes (SPA fallback 404s) are marked noindex.

const ORIGIN = "https://scriptureliveai.com";
const INDEX_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

const ROUTE_SEO = {
  "/": {
    title:
      "ScriptureLive AI — Instant AI Bible Verse Display for Live Preaching",
    description:
      "ScriptureLive AI listens to the pastor and instantly displays every Bible verse on screens, NDI, OBS, vMix and live streams. Free download for Windows. Built for churches in Ghana and worldwide.",
  },
  "/privacy": {
    title: "Privacy Policy — ScriptureLive AI",
    description:
      "How ScriptureLive AI handles your data. This marketing site runs no cookies, analytics or trackers — learn what the desktop app collects and your rights.",
  },
  "/terms": {
    title: "Terms of Service — ScriptureLive AI",
    description:
      "The terms governing your use of ScriptureLive AI, the AI-powered real-time Bible verse display software for churches.",
  },
};

function normalizePath(pathname) {
  if (!pathname || pathname === "/") return "/";
  const stripped = pathname.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

class AttrSetter {
  constructor(attr, value) {
    this.attr = attr;
    this.value = value;
  }
  element(el) {
    el.setAttribute(this.attr, this.value);
  }
}

class TextSetter {
  constructor(value) {
    this.value = value;
  }
  element(el) {
    el.setInnerContent(this.value);
  }
}

export async function onRequest(context) {
  const { request, next } = context;
  const response = await next();

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  const path = normalizePath(new URL(request.url).pathname);
  const seo = ROUTE_SEO[path];
  const known = Boolean(seo);
  const meta = seo || ROUTE_SEO["/"];
  const url = `${ORIGIN}${path}`;
  const robots = known ? INDEX_ROBOTS : "noindex, follow";

  return new HTMLRewriter()
    .on("title", new TextSetter(meta.title))
    .on('link[rel="canonical"]', new AttrSetter("href", url))
    .on('meta[name="description"]', new AttrSetter("content", meta.description))
    .on('meta[name="robots"]', new AttrSetter("content", robots))
    .on('meta[property="og:url"]', new AttrSetter("content", url))
    .on('meta[property="og:title"]', new AttrSetter("content", meta.title))
    .on(
      'meta[property="og:description"]',
      new AttrSetter("content", meta.description),
    )
    .on('meta[name="twitter:url"]', new AttrSetter("content", url))
    .on('meta[name="twitter:title"]', new AttrSetter("content", meta.title))
    .on(
      'meta[name="twitter:description"]',
      new AttrSetter("content", meta.description),
    )
    .transform(response);
}
