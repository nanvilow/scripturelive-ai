import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import logo from "@/logo.png";
import { Login } from "./Login";
import { SectionEditor } from "./SectionEditor";
import { COLLECTIONS } from "./schema";
import {
  clearToken,
  fetchUser,
  getStoredToken,
  storeToken,
  type GitHubUser,
} from "./github";

import pageContent from "@/content/page-content.json";
import features from "@/content/features.json";
import pricing from "@/content/pricing.json";
import testimonials from "@/content/testimonials.json";
import downloads from "@/content/downloads.json";
import heroButtons from "@/content/hero-buttons.json";

const DEMO_DATA: Record<string, any[]> = {
  "page-content": (pageContent as any).items,
  features: (features as any).items,
  pricing: (pricing as any).items,
  testimonials: (testimonials as any).items,
  downloads: (downloads as any).items,
  "hero-buttons": (heroButtons as any).items,
};

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [checking, setChecking] = useState<boolean>(() => !!getStoredToken());
  const [demo, setDemo] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("demo") === "1",
  );
  const [activeKey, setActiveKey] = useState<string>(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    if (s && COLLECTIONS.some((c) => c.key === s)) return s;
    return COLLECTIONS[0].key;
  });
  const dirtyRef = useRef(false);

  const handleDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d;
  }, []);

  function confirmDiscard(): boolean {
    if (!dirtyRef.current) return true;
    return window.confirm(
      "You have unpublished changes that will be lost. Continue?",
    );
  }

  function selectSection(key: string) {
    if (key === activeKey) return;
    if (!confirmDiscard()) return;
    dirtyRef.current = false;
    setActiveKey(key);
  }

  useEffect(() => {
    document.title = "Content Studio — ScriptureLive AI";
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    fetchUser(token)
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleToken(t: string) {
    storeToken(t);
    setDemo(false);
    setToken(t);
  }

  function signOut() {
    if (!confirmDiscard()) return;
    dirtyRef.current = false;
    clearToken();
    setToken(null);
    setUser(null);
    setDemo(false);
  }

  const activeCollection = useMemo(
    () => COLLECTIONS.find((c) => c.key === activeKey) ?? COLLECTIONS[0],
    [activeKey],
  );

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!token && !demo) {
    return <Login onToken={handleToken} onDemo={() => setDemo(true)} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2.5 min-w-0">
            <img src={logo} alt="ScriptureLive AI" className="h-8 w-auto" />
            <span className="font-display font-bold tracking-tight truncate">
              Content Studio
            </span>
          </a>
          <div className="flex items-center gap-3">
            {demo ? (
              <span className="rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-semibold">
                Demo mode
              </span>
            ) : (
              user && (
                <div className="hidden sm:flex items-center gap-2 text-sm">
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full border border-border/60"
                  />
                  <span className="text-muted-foreground">
                    {user.name || user.login}
                  </span>
                </div>
              )
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              data-testid="button-signout"
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              {demo ? "Exit demo" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="lg:sticky lg:top-24 self-start">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
            {COLLECTIONS.map((c) => {
              const active = c.key === activeKey;
              return (
                <li key={c.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => selectSection(c.key)}
                    className={`w-full text-left rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                    }`}
                    data-testid={`nav-${c.key}`}
                  >
                    {c.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0">
          <SectionEditor
            key={activeCollection.key}
            collection={activeCollection}
            token={token}
            demo={demo}
            onDirtyChange={handleDirtyChange}
            demoData={DEMO_DATA[activeCollection.key]}
          />
        </main>
      </div>
    </div>
  );
}
