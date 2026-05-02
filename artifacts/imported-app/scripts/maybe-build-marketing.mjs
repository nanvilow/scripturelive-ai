#!/usr/bin/env node
// v0.7.34 NO-OP STUB. The marketing site at scriptureliveai.com is being
// moved to its own standalone Replit project, so this artifact no longer
// builds or bundles the @workspace/site Vite SPA. This file remains
// only because `.replit` has a `[deployment.build]` pre-build hook that
// invokes it by path; deleting the file would make the deploy fail with
// "Cannot find module …/maybe-build-marketing.mjs" before the artifact
// build even starts. The hook line itself can't be removed via the
// agent (the Replit sandbox blocks direct edits to `.replit` for files
// other than well-known sections), so we keep this stub as an exit-0
// shim until someone removes the hook from `.replit` via the Files
// pane. See artifacts/imported-app/DEPLOY.md.
process.exit(0);
