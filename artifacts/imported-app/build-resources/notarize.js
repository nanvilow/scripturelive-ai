/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * electron-builder afterSign hook.
 *
 * On macOS, when signing credentials are present in the environment, this hook
 * submits the freshly-signed .app bundle to Apple's notarytool and waits for a
 * verdict. electron-builder then staples the notarization ticket onto the .app
 * before packaging the DMG, so Gatekeeper accepts the installer on first launch
 * with no right-click workaround.
 *
 * Behavior matrix (macOS only — for other platforms the hook returns early):
 *
 *   CSC_LINK unset                          -> skip (app is unsigned, nothing to notarize)
 *   CSC_LINK set, any APPLE_* var missing   -> FAIL the build (don't silently ship unnotarized)
 *   CSC_LINK + all APPLE_* vars set         -> notarize, fail the build on any error
 *
 * Failing fast when signing is configured but notarization cannot complete is
 * deliberate: a release that's signed-but-not-notarized still triggers
 * Gatekeeper warnings on first launch, defeating the point of paying for a
 * Developer ID certificate.
 */
module.exports = async function notarize(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== "darwin") {
    return;
  }

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID, CSC_LINK } =
    process.env;

  if (!CSC_LINK) {
    console.log(
      "[notarize] CSC_LINK is not set — skipping notarization (app is unsigned).",
    );
    return;
  }

  const missing = [];
  if (!APPLE_ID) missing.push("APPLE_ID");
  if (!APPLE_APP_SPECIFIC_PASSWORD) missing.push("APPLE_APP_SPECIFIC_PASSWORD");
  if (!APPLE_TEAM_ID) missing.push("APPLE_TEAM_ID");
  if (missing.length > 0) {
    throw new Error(
      `[notarize] CSC_LINK is set (so the .app is being signed) but the following ` +
        `notarization env vars are missing: ${missing.join(", ")}. ` +
        `Refusing to ship a signed-but-unnotarized release because Gatekeeper would ` +
        `still warn on first launch. Set the missing vars or unset CSC_LINK.`,
    );
  }

  let notarizeFn;
  try {
    ({ notarize: notarizeFn } = require("@electron/notarize"));
  } catch (err) {
    throw new Error(
      `[notarize] Cannot load @electron/notarize (${err && err.message}). ` +
        `Run \`pnpm install\` in artifacts/imported-app and retry. Refusing to ` +
        `ship a signed-but-unnotarized release.`,
    );
  }

  const appName = packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Submitting ${appPath} to Apple notarytool…`);
  const start = Date.now();
  await notarizeFn({
    tool: "notarytool",
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
  const seconds = Math.round((Date.now() - start) / 1000);
  console.log(`[notarize] Notarization succeeded in ${seconds}s.`);
};
