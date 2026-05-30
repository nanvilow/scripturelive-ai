const REPO = "nanvilow/scripturelive-ai";
const BRANCH = "main";
const GH_API = "https://api.github.com";
const TOKEN_KEY = "slai_admin_token";

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export interface FileState {
  json: any;
  sha: string;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function decodeBase64Utf8(b64: string): string {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GH_API}/user`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Authentication failed (${res.status})`);
  return res.json();
}

export async function getFile(token: string, path: string): Promise<FileState> {
  const res = await fetch(
    `${GH_API}/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  const data = await res.json();
  return { json: JSON.parse(decodeBase64Utf8(data.content)), sha: data.sha };
}

export async function putFile(
  token: string,
  path: string,
  json: unknown,
  sha: string,
  message: string,
): Promise<string> {
  const content = encodeBase64Utf8(JSON.stringify(json, null, 2) + "\n");
  const res = await fetch(`${GH_API}/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content, sha, branch: BRANCH }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`Publish failed (${res.status})${detail ? ": " + detail : ""}`);
  }
  const data = await res.json();
  return data.content.sha as string;
}

const SUCCESS_PREFIX = "authorization:github:success:";
const ERROR_PREFIX = "authorization:github:error:";

/**
 * Replicates the Decap/Netlify-CMS popup OAuth handshake against the
 * repo-root Cloudflare Pages functions at /oauth/auth + /oauth/callback.
 * All messages are same-origin (the callback page is served from this domain).
 */
export function loginWithGitHub(): Promise<string> {
  return new Promise((resolve, reject) => {
    const origin = window.location.origin;
    const popup = window.open(
      `${origin}/oauth/auth?provider=github`,
      "github-oauth",
      "width=640,height=760,menubar=no,toolbar=no",
    );
    if (!popup) {
      reject(new Error("Popup blocked. Please allow popups and try again."));
      return;
    }

    let settled = false;
    let token: string | null = null;

    function cleanup() {
      window.removeEventListener("message", handler);
      clearInterval(poll);
      clearTimeout(timeout);
    }

    function handler(e: MessageEvent) {
      // Only trust messages from this popup, on our own origin.
      if (e.origin !== origin || e.source !== popup) return;
      const d = e.data;
      if (typeof d !== "string") return;

      if (d === "authorizing:github") {
        // Acknowledge so the popup sends us its token payload.
        popup!.postMessage("authorizing:github", origin);
        return;
      }
      if (d.startsWith(SUCCESS_PREFIX)) {
        try {
          const payload = JSON.parse(d.slice(SUCCESS_PREFIX.length));
          token = payload?.token ?? null;
        } catch {
          token = null;
        }
        settled = true;
        cleanup();
        try {
          popup!.close();
        } catch {
          /* ignore */
        }
        if (token) resolve(token);
        else reject(new Error("GitHub did not return a token."));
        return;
      }
      if (d.startsWith(ERROR_PREFIX)) {
        settled = true;
        cleanup();
        try {
          popup!.close();
        } catch {
          /* ignore */
        }
        reject(new Error("GitHub authorization was denied."));
      }
    }

    const poll = setInterval(() => {
      if (popup!.closed && !settled) {
        cleanup();
        reject(new Error("Login window was closed before finishing."));
      }
    }, 500);

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        popup!.close();
      } catch {
        /* ignore */
      }
      reject(new Error("Login timed out. Please try again."));
    }, 180000);

    window.addEventListener("message", handler);
  });
}
