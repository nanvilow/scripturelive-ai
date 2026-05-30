import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Github,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import logo from "@/logo.png";
import { loginWithGitHub } from "./github";

export function Login({
  onToken,
  onDemo,
}: {
  onToken: (token: string) => void;
  onDemo: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pat, setPat] = useState("");

  async function handleGitHub() {
    setError(null);
    setLoading(true);
    try {
      const token = await loginWithGitHub();
      onToken(token);
    } catch (e: any) {
      setError(e?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  function handlePat(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = pat.trim();
    if (!trimmed) {
      setError("Paste a token first.");
      return;
    }
    onToken(trimmed);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, hsl(var(--primary) / 0.12), transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <img src={logo} alt="ScriptureLive AI" className="h-12 w-auto mb-5" />
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Content Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to edit and publish your website content.
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl p-6 sm:p-8 shadow-xl">
          <Button
            className="w-full rounded-xl font-semibold"
            size="lg"
            onClick={handleGitHub}
            disabled={loading}
            data-testid="button-login-github"
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Github className="mr-2 h-5 w-5" />
            )}
            Continue with GitHub
          </Button>

          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <span>
              You'll be asked to authorize with GitHub. Only collaborators on the
              site repository can publish changes.
            </span>
          </p>

          {error && (
            <p
              className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="text-login-error"
            >
              {error}
            </p>
          )}

          <div className="mt-6 border-t border-border/50 pt-4">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Advanced — sign in with a personal access token
            </button>

            {showAdvanced && (
              <form onSubmit={handlePat} className="mt-3 space-y-2">
                <Label htmlFor="pat" className="text-xs text-muted-foreground">
                  GitHub token with <code>repo</code> scope
                </Label>
                <Input
                  id="pat"
                  type="password"
                  placeholder="ghp_…"
                  value={pat}
                  onChange={(e) => setPat(e.target.value)}
                  data-testid="input-pat"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full rounded-xl"
                  size="sm"
                  data-testid="button-login-pat"
                >
                  Use token
                </Button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onDemo}
            className="text-xs text-muted-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
            data-testid="button-demo"
          >
            Preview the studio (demo, read-only)
          </button>
        </div>
      </div>
    </div>
  );
}
