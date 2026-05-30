// Starts the GitHub OAuth flow for Decap CMS.
// Decap opens this in a popup -> we redirect to GitHub's authorize URL
// -> GitHub redirects back to /oauth/callback after the user approves.

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") || "github";

  if (provider !== "github") {
    return new Response("Only github provider is supported", { status: 400 });
  }
  if (!env.GITHUB_CLIENT_ID) {
    return new Response(
      "Missing GITHUB_CLIENT_ID env var on this Cloudflare Pages project.",
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/oauth/callback`;

  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", env.GITHUB_OAUTH_SCOPE || "repo,user");
  authorize.searchParams.set("state", state);
  if (url.searchParams.get("site_id")) {
    authorize.searchParams.set("site_id", url.searchParams.get("site_id"));
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    },
  });
}
