import { useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";

const AdminApp = lazy(() => import("@/admin/AdminApp"));

const queryClient = new QueryClient();

const SITE_ORIGIN = "https://scriptureliveai.com";
const INDEX_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

const ROUTE_SEO: Record<string, { title: string; description: string }> = {
  "/": {
    title: "ScriptureLive AI — Instant AI Bible Verse Display for Live Preaching",
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

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function SeoHead() {
  const [location] = useLocation();
  useEffect(() => {
    const path = !location || location === "" ? "/" : location;
    const known = ROUTE_SEO[path];
    const canonicalPath = path === "/" ? "/" : path.replace(/\/+$/, "");
    const url = `${SITE_ORIGIN}${canonicalPath}`;
    const seo = known ?? ROUTE_SEO["/"];

    document.title = seo.title;
    upsertMeta("name", "description", seo.description);
    upsertLink("canonical", url);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:title", seo.title);
    upsertMeta("property", "og:description", seo.description);
    upsertMeta("name", "twitter:url", url);
    upsertMeta("name", "twitter:title", seo.title);
    upsertMeta("name", "twitter:description", seo.description);
    upsertMeta("name", "robots", known ? INDEX_ROBOTS : "noindex, follow");
  }, [location]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/admin">
        <Suspense
          fallback={
            <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
              Loading…
            </div>
          }
        >
          <AdminApp />
        </Suspense>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SeoHead />
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
