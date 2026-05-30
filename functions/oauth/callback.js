// OAuth callback for Decap CMS GitHub auth.
// Exchanges the code for an access token, then postMessages it
// back to the Decap admin window using the exact protocol Decap expects.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return htmlError("Missing OAuth code");
  }

  // CSRF check
  const cookie = request.headers.get("Cookie") || "";
  const cookieState = (cookie.match(/oauth_state=([^;]+)/) || [])[1];
  if (!cookieState || cookieState !== state) {
    return htmlError("OAuth state mismatch (possible CSRF)");
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return htmlError(
      "Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET env var on this Cloudflare Pages project."
    );
  }

  // Exchange code for token
  const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "scripturelive-ai-decap",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = await tokenResp.json();

  if (!data.access_token) {
    return htmlError(
      `GitHub OAuth failed: ${data.error_description || data.error || "unknown error"}`
    );
  }

  const payload = JSON.stringify({ token: data.access_token, provider: "github" });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Authenticating…</title></head>
<body style="background:#0a0a0a;color:#fafafa;font-family:system-ui;padding:2rem;">
<p>Authenticating, this window will close…</p>
<script>
(function() {
  if (!window.opener) {
    document.body.innerHTML = '<p>Error: opener window not found. Close this tab and try again from /admin/.</p>';
    return;
  }
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:github:success:' + ${JSON.stringify(payload)},
      e.origin
    );
    window.removeEventListener("message", receiveMessage, false);
  }
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "*");
})();
</script>
</body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": "oauth_state=; Path=/; Max-Age=0",
    },
  });
}

function htmlError(message) {
  const safe = String(message).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  return new Response(
    `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#fafafa;font-family:system-ui;padding:2rem;">
     <h1>Authentication error</h1><pre>${safe}</pre>
     <p><a style="color:#fbbf24" href="/admin/">Back to admin</a></p></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
