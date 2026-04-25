"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPreferences = readPreferences;
exports.writePreferences = writePreferences;
exports.shouldHideOnCloseFromInputs = shouldHideOnCloseFromInputs;
exports.installHideToTrayCloseHandler = installHideToTrayCloseHandler;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/**
 * Read preferences from the given path. Missing file ⇒ `{}`.
 * Malformed JSON / unreadable file ⇒ `{}` (best-effort, never
 * throws). Pure other than the filesystem read.
 */
function readPreferences(filePath) {
    try {
        if (!node_fs_1.default.existsSync(filePath))
            return {};
        const raw = node_fs_1.default.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object')
            return parsed;
    }
    catch {
        // best-effort: defaults
    }
    return {};
}
/**
 * Write preferences to the given path. Creates the parent directory
 * on demand. Throws on filesystem errors so the caller (typically an
 * IPC handler) can surface a real error to the renderer instead of
 * silently dropping the operator's choice.
 */
function writePreferences(filePath, prefs) {
    const dir = node_path_1.default.dirname(filePath);
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    node_fs_1.default.writeFileSync(filePath, JSON.stringify(prefs, null, 2));
}
/**
 * Pure decision function for the X-button close handler. Returns
 * true ⇒ caller should `event.preventDefault()` and hide the window
 * to tray. Returns false ⇒ caller should let the close proceed.
 *
 * Order matches the original inline checks in main.ts so any
 * regression in the close handler shows up here first.
 */
function shouldHideOnCloseFromInputs(inputs) {
    if (inputs.isQuitting)
        return false;
    if (inputs.quitOnClose)
        return false;
    if (!inputs.hasLiveTray)
        return false;
    if (!inputs.windowAlive)
        return false;
    return true;
}
/**
 * Wires up the X-button → hide-to-tray vs really-close behavior on a
 * window. Lives here (instead of inline in main.ts) so the bundled
 * Electron app and the Electron-based E2E harness install the SAME
 * handler code — no risk of the test version drifting away from
 * what ships to operators.
 *
 * @param win        The window whose `close` event we're attaching to.
 * @param getInputs  Factory the handler calls at fire time. Returns
 *                   the live values for `isQuitting`, `quitOnClose`,
 *                   and `hasLiveTray` — the handler always supplies
 *                   `windowAlive` itself from the passed-in window.
 *                   Calling at fire time (not at install time) is
 *                   what makes "toggling takes effect on the very
 *                   next close without a restart" actually work.
 * @param onHide     Optional side-effect to run after a successful
 *                   hide (e.g. the first-time tray-hint notification).
 */
function installHideToTrayCloseHandler(win, getInputs, onHide) {
    win.on('close', (event) => {
        const inputs = {
            ...getInputs(),
            windowAlive: !win.isDestroyed(),
        };
        if (!shouldHideOnCloseFromInputs(inputs))
            return;
        event.preventDefault();
        try {
            win.hide();
        }
        catch { /* ignore — window may have been torn down */ }
        onHide?.();
    });
}
//# sourceMappingURL=preferences.js.map