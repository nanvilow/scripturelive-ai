"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_fs_1 = __importDefault(require("node:fs"));
const ndi_service_1 = require("./ndi-service");
let logFilePath = '';
function setupFileLogging() {
    try {
        const dir = electron_1.app.getPath('userData');
        if (!node_fs_1.default.existsSync(dir))
            node_fs_1.default.mkdirSync(dir, { recursive: true });
        logFilePath = node_path_1.default.join(dir, 'launch.log');
        const stream = node_fs_1.default.createWriteStream(logFilePath, { flags: 'w' });
        const wrap = (orig, prefix) => (...args) => {
            try {
                const line = `[${new Date().toISOString()}] ${prefix} ` +
                    args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
                stream.write(line);
            }
            catch { /* ignore */ }
            try {
                orig(...args);
            }
            catch { /* ignore */ }
        };
        console.log = wrap(console.log.bind(console), 'LOG');
        console.error = wrap(console.error.bind(console), 'ERR');
        console.warn = wrap(console.warn.bind(console), 'WRN');
        console.log('ScriptureLive AI starting', {
            version: electron_1.app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            execPath: process.execPath,
            resourcesPath: process.resourcesPath,
            userData: dir,
        });
        process.on('uncaughtException', (err) => { console.error('uncaughtException', err); });
        process.on('unhandledRejection', (err) => { console.error('unhandledRejection', err); });
    }
    catch (e) {
        // best-effort: file logging optional
    }
}
function fatalError(stage, err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
    console.error(`[fatal:${stage}]`, msg);
    try {
        electron_1.dialog.showErrorBox('ScriptureLive AI failed to start', `Stage: ${stage}\n\n${msg}\n\nFull log saved to:\n${logFilePath}\n\nPlease send this log file to support.`);
    }
    catch { /* ignore */ }
}
const frame_capture_1 = require("./frame-capture");
const updater_1 = require("./updater");
const isDev = !electron_1.app.isPackaged;
// ── Chromium command-line flags ───────────────────────────────────
// Best-effort flags to coax Web Speech / mic capture into working in
// the packaged app. These are applied BEFORE app.whenReady so they
// take effect during Chromium init.
//
// Note: Web Speech API in Electron is inherently limited because
// Google's speech-to-text endpoint requires a Google API key that's
// only baked into Chrome — packaged Electron builds will hit
// `network` errors. The renderer-side hook now detects this and
// shows a clear actionable error instead of bouncing on/off forever.
electron_1.app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,SpeechSynthesisAPI,WebRTC-Audio-Red-For-Opus');
electron_1.app.commandLine.appendSwitch('enable-speech-dispatcher');
// Auto-grant getUserMedia for the bundled origin so the mic doesn't
// need a per-session prompt the user has to click through.
electron_1.app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
electron_1.app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const ndi = new ndi_service_1.NdiService();
let frameCapture = null;
let mainWindow = null;
let nextProcess = null;
let appBaseUrl = '';
let ndiTransition = Promise.resolve();
function serializeNdi(fn) {
    const next = ndiTransition.then(() => fn(), () => fn());
    ndiTransition = next.catch(() => undefined);
    return next;
}
function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = (0, node_net_1.createServer)();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, () => {
            const addr = srv.address();
            if (addr && typeof addr === 'object') {
                const port = addr.port;
                srv.close(() => resolve(port));
            }
            else {
                reject(new Error('failed to allocate port'));
            }
        });
    });
}
function getUserDbPath() {
    const dir = node_path_1.default.join(electron_1.app.getPath('userData'), 'db');
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
    const dbPath = node_path_1.default.join(dir, 'custom.db');
    if (!node_fs_1.default.existsSync(dbPath)) {
        const bundled = isDev
            ? node_path_1.default.join(__dirname, '..', 'db', 'custom.db')
            : node_path_1.default.join(process.resourcesPath, 'app-db', 'custom.db');
        if (node_fs_1.default.existsSync(bundled)) {
            try {
                node_fs_1.default.copyFileSync(bundled, dbPath);
            }
            catch { /* ignore */ }
        }
    }
    return dbPath;
}
async function startNextServer() {
    if (isDev) {
        return process.env.NEXT_DEV_URL || 'http://localhost:3000';
    }
    const port = await getFreePort();
    const dbPath = getUserDbPath();
    const standaloneDir = node_path_1.default.join(process.resourcesPath, 'app', '.next', 'standalone');
    const serverEntry = node_path_1.default.join(standaloneDir, 'server.js');
    if (!node_fs_1.default.existsSync(serverEntry)) {
        throw new Error(`Next standalone server missing at ${serverEntry}`);
    }
    nextProcess = (0, node_child_process_1.spawn)(process.execPath, [serverEntry], {
        cwd: standaloneDir,
        env: {
            ...process.env,
            PORT: String(port),
            HOSTNAME: '127.0.0.1',
            NODE_ENV: 'production',
            DATABASE_URL: `file:${dbPath}`,
            ELECTRON_RUN_AS_NODE: '1',
        },
        stdio: 'pipe',
    });
    nextProcess.stdout?.on('data', (b) => console.log(`[next] ${b.toString().trimEnd()}`));
    nextProcess.stderr?.on('data', (b) => console.error(`[next:err] ${b.toString().trimEnd()}`));
    nextProcess.on('exit', (code) => {
        console.log(`[next] process exited with code ${code}`);
    });
    // Wait for server readiness
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 60_000;
    let lastErr = null;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${url}/api/output?format=json`);
            if (res.ok)
                return url;
            lastErr = new Error(`HTTP ${res.status}`);
        }
        catch (e) {
            lastErr = e;
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Next server failed to start within 60s. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
async function createMainWindow(url) {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 640,
        backgroundColor: '#0a0a0a',
        icon: process.platform === 'win32'
            ? node_path_1.default.join(process.resourcesPath, 'app', '.next', 'standalone', 'public', 'icon-512.png')
            : undefined,
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            // Allow the renderer to use the microphone for live transcription
            // (Web Speech API + getUserMedia). Without these the Electron
            // session denies the request silently and the transcription panel
            // sits idle even when the user grants OS-level mic permission.
            webSecurity: true,
        },
        title: 'ScriptureLive AI',
        autoHideMenuBar: true,
    });
    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
        electron_1.shell.openExternal(target);
        return { action: 'deny' };
    });
    await mainWindow.loadURL(url);
    mainWindow.on('closed', () => { mainWindow = null; });
}
async function showDialog(opts) {
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    return parent ? electron_1.dialog.showMessageBox(parent, opts) : electron_1.dialog.showMessageBox(opts);
}
async function handleManualUpdateCheck() {
    if (!electron_1.app.isPackaged) {
        await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: 'Updates are disabled in development builds.',
            detail: `You're running ScriptureLive AI ${electron_1.app.getVersion()} from source.`,
            buttons: ['OK'],
            defaultId: 0,
        });
        return;
    }
    const existing = (0, updater_1.getUpdateState)();
    if (existing.status === 'downloading') {
        await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: 'An update is already downloading.',
            detail: `Download is ${Math.round(existing.percent)}% complete. You'll be prompted to restart when it's ready.`,
            buttons: ['OK'],
        });
        return;
    }
    if (existing.status === 'downloaded') {
        const choice = await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: `Update ready to install`,
            detail: `Version ${existing.version} has been downloaded. Restart now to install it.`,
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
        if (choice.response === 0) {
            const { autoUpdater } = await Promise.resolve().then(() => __importStar(require('electron-updater')));
            setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
        return;
    }
    // Drive the same code path as the `updater:check` IPC handler.
    const state = await (0, updater_1.runManualCheck)();
    if (state.status === 'not-available') {
        await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: "You're up to date",
            detail: `ScriptureLive AI ${electron_1.app.getVersion()} is the latest version.`,
            buttons: ['OK'],
        });
    }
    else if (state.status === 'available') {
        await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: 'Update available',
            detail: `Version ${state.version} is downloading in the background. You'll be prompted to restart when it's ready.`,
            buttons: ['OK'],
        });
    }
    else if (state.status === 'downloading') {
        await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: 'Update available',
            detail: `An update is downloading in the background (${Math.round(state.percent)}%). You'll be prompted to restart when it's ready.`,
            buttons: ['OK'],
        });
    }
    else if (state.status === 'downloaded') {
        const choice = await showDialog({
            type: 'info',
            title: 'Check for Updates',
            message: 'Update ready to install',
            detail: `Version ${state.version} has been downloaded. Restart now to install it.`,
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
        if (choice.response === 0) {
            const { autoUpdater } = await Promise.resolve().then(() => __importStar(require('electron-updater')));
            setImmediate(() => autoUpdater.quitAndInstall(false, true));
        }
    }
    else if (state.status === 'error') {
        const choice = await showDialog({
            type: 'warning',
            title: 'Check for Updates',
            message: "Couldn't check for updates",
            detail: `${state.message}\n\nYou can download the latest installer from the releases page instead.`,
            buttons: ['Open releases page', 'OK'],
            defaultId: 1,
            cancelId: 1,
        });
        if (choice.response === 0)
            (0, updater_1.openReleasesPage)();
    }
}
function buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const checkForUpdatesItem = {
        label: 'Check for Updates…',
        click: () => { void handleManualUpdateCheck(); },
    };
    const template = [];
    if (isMac) {
        template.push({
            label: electron_1.app.name,
            submenu: [
                { role: 'about' },
                checkForUpdatesItem,
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        });
    }
    template.push({ role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }, {
        role: 'help',
        submenu: [
            ...(isMac ? [] : [checkForUpdatesItem, { type: 'separator' }]),
            {
                label: 'View Releases on GitHub',
                click: () => { (0, updater_1.openReleasesPage)(); },
            },
        ],
    });
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function broadcastNdiStatus(status) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ndi:status', status);
    }
}
function setupIpc() {
    electron_1.ipcMain.handle('app:info', () => ({
        version: electron_1.app.getVersion(),
        platform: process.platform,
        isDesktop: true,
        appUrl: appBaseUrl,
        ndiAvailable: ndi.isAvailable(),
        ndiUnavailableReason: ndi.unavailableReason(),
    }));
    electron_1.ipcMain.handle('ndi:status', () => ndi.getStatus());
    electron_1.ipcMain.handle('ndi:start', (_e, opts) => serializeNdi(async () => {
        if (!ndi.isAvailable()) {
            return { ok: false, error: ndi.unavailableReason() || 'NDI runtime not available' };
        }
        try {
            if (frameCapture) {
                await frameCapture.stop();
                frameCapture = null;
            }
            await ndi.start(opts);
            frameCapture = new frame_capture_1.FrameCapture({
                baseUrl: appBaseUrl,
                onFrame: (buf, w, h) => ndi.sendFrame(buf, w, h),
                onStatus: (msg) => broadcastNdiStatus({ ...ndi.getStatus(), captureMessage: msg }),
            });
            const layout = opts.layout === 'ndi' ? 'ndi' : 'mirror';
            let capturePath = '/api/output/congregation';
            let transparent = false;
            if (layout === 'ndi') {
                transparent = opts.transparent !== false;
                const lt = opts.lowerThird || {};
                const params = new URLSearchParams();
                if (transparent)
                    params.set('transparent', '1');
                if (lt.enabled)
                    params.set('lowerThird', '1');
                if (lt.position === 'top')
                    params.set('position', 'top');
                if (lt.branding)
                    params.set('branding', lt.branding.slice(0, 80));
                if (lt.accent)
                    params.set('accent', lt.accent.replace(/[^0-9a-fA-F]/g, '').slice(0, 6));
                const qs = params.toString();
                capturePath = '/api/output/ndi' + (qs ? `?${qs}` : '');
            }
            await frameCapture.start({
                width: opts.width,
                height: opts.height,
                fps: opts.fps,
                path: capturePath,
                transparent,
            });
            broadcastNdiStatus(ndi.getStatus());
            return { ok: true, status: ndi.getStatus() };
        }
        catch (err) {
            try {
                if (frameCapture)
                    await frameCapture.stop();
            }
            catch { /* ignore */ }
            frameCapture = null;
            try {
                await ndi.stop();
            }
            catch { /* ignore */ }
            const message = err instanceof Error ? err.message : String(err);
            broadcastNdiStatus({ ...ndi.getStatus(), error: message });
            return { ok: false, error: message };
        }
    }));
    electron_1.ipcMain.handle('ndi:stop', () => serializeNdi(async () => {
        try {
            if (frameCapture) {
                await frameCapture.stop();
                frameCapture = null;
            }
            await ndi.stop();
            broadcastNdiStatus(ndi.getStatus());
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }));
    // List physical displays so the renderer can show a "send to which screen?" picker
    electron_1.ipcMain.handle('output:list-displays', () => {
        try {
            const primary = electron_1.screen.getPrimaryDisplay();
            return electron_1.screen.getAllDisplays().map((d, i) => ({
                id: d.id,
                label: d.label && d.label.length > 0 ? d.label : `Display ${i + 1}`,
                primary: d.id === primary.id,
                width: d.size.width,
                height: d.size.height,
            }));
        }
        catch {
            return [];
        }
    });
    // ── Hardened kiosk-style output window factory ─────────────────
    // Goal: the output window must look and behave EXACTLY like a vMix /
    // Wirecast / EasyWorship secondary output — not a browser. That means:
    //   - true fullscreen kiosk on whatever display we land on (primary OR
    //     secondary), no taskbar, no title bar, no menu, no chrome
    //   - no right-click context menu (no "Inspect Element" giveaway)
    //   - no dev-tools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
    //   - no scrollbars, no text selection, no user zoom
    //   - cursor auto-hides after idle so projectors don't show a pointer
    //   - black backdrop so any letterboxed slide blends into the wall
    //   - Esc cleanly closes the window for the operator
    function createKioskOutput(opts) {
        let target = electron_1.screen.getPrimaryDisplay();
        if (opts.displayId !== undefined) {
            const found = electron_1.screen.getAllDisplays().find((d) => d.id === opts.displayId);
            if (found)
                target = found;
        }
        else if (electron_1.screen.getAllDisplays().length > 1) {
            // No explicit pick → prefer the first non-primary display so the
            // operator's main console monitor stays free for the operator UI.
            const others = electron_1.screen.getAllDisplays().filter((d) => d.id !== electron_1.screen.getPrimaryDisplay().id);
            if (others[0])
                target = others[0];
        }
        const { x, y, width, height } = target.bounds;
        const win = new electron_1.BrowserWindow({
            x, y, width, height,
            backgroundColor: '#000',
            title: opts.title,
            frame: false,
            autoHideMenuBar: true,
            // ALWAYS fullscreen + kiosk, even on the primary display. This is
            // what stops it from "looking like a browser window" — no chrome
            // of any kind, no taskbar peek, no resize handles.
            fullscreen: true,
            kiosk: true,
            simpleFullscreen: true,
            // (Cursor hiding is handled below via CSS injection — Electron's
            // BrowserWindow doesn't expose a cross-platform autoHideCursor.)
            // Stay above the operator console so a click on the console doesn't
            // bring the projector behind it.
            alwaysOnTop: target.id !== electron_1.screen.getPrimaryDisplay().id,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                // Disable devtools entirely on production output windows.
                devTools: false,
            },
        });
        win.removeMenu();
        win.setMenuBarVisibility(false);
        // Block dev-tools / view-source / reload key combos. The operator
        // should never accidentally open the inspector mid-service.
        win.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown')
                return;
            const key = input.key;
            // Esc → close the output cleanly.
            if (key === 'Escape') {
                event.preventDefault();
                try {
                    win.close();
                }
                catch { /* ignore */ }
                return;
            }
            // Block F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+R, F5, Ctrl+P
            const ctrl = input.control || input.meta;
            const shift = input.shift;
            if (key === 'F12' ||
                key === 'F5' ||
                (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c')) ||
                (ctrl && (key === 'U' || key === 'u' || key === 'R' || key === 'r' || key === 'P' || key === 'p'))) {
                event.preventDefault();
            }
        });
        // Block the right-click "Inspect Element" menu entirely.
        win.webContents.on('context-menu', (e) => e.preventDefault());
        // Inject CSS that strips scrollbars, text selection, and the
        // browser cursor. This is what kills the last bit of "browser feel" —
        // even if the page has its own scrollbar or selection styles, this
        // wins because it's an !important on the documentElement.
        win.webContents.on('did-finish-load', () => {
            win.webContents.insertCSS(`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #000 !important;
          cursor: none !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        * { cursor: none !important; }
      `).catch(() => { });
        });
        // Lock pinch-zoom and Ctrl+wheel zoom.
        win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => { });
        win.webContents.on('zoom-changed', () => {
            win.webContents.setZoomFactor(1);
        });
        win.loadURL(`${appBaseUrl}${opts.path}`);
        return win;
    }
    electron_1.ipcMain.handle('output:open-window', (_e, opts) => {
        if (!appBaseUrl)
            return { ok: false, error: 'app not ready' };
        createKioskOutput({
            displayId: opts?.displayId,
            path: '/api/output/congregation',
            title: 'ScriptureLive — Congregation Display',
        });
        return { ok: true };
    });
    // Stage-display window: shows current slide, next slide, sermon notes,
    // countdown timer and clock for the speaker on a separate screen.
    electron_1.ipcMain.handle('output:open-stage', (_e, opts) => {
        if (!appBaseUrl)
            return { ok: false, error: 'app not ready' };
        createKioskOutput({
            displayId: opts?.displayId,
            path: '/api/output/stage',
            title: 'ScriptureLive — Stage Display',
        });
        return { ok: true };
    });
    ndi.on('frame', (count) => {
        broadcastNdiStatus({ ...ndi.getStatus(), frameCount: count });
    });
    ndi.on('error', (msg) => {
        broadcastNdiStatus({ ...ndi.getStatus(), error: msg });
    });
}
electron_1.app.whenReady().then(async () => {
    setupFileLogging();
    // ── Permissions ────────────────────────────────────────────────
    // Auto-grant the renderer the permissions it needs to behave like
    // a real desktop production tool — microphone (live transcription),
    // media playback (preview/live videos), display capture (NDI frame
    // grabber). Without this the Electron Chromium silently denies
    // mic access even after the user clicks Allow at the OS level,
    // which is why transcription stays dead in the packaged app.
    try {
        const allowed = new Set([
            'media',
            'mediaKeySystem',
            'audioCapture',
            'videoCapture',
            'display-capture',
            'fullscreen',
            'clipboard-read',
            'clipboard-sanitized-write',
        ]);
        electron_1.session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
            cb(allowed.has(permission));
        });
        electron_1.session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
        // Skip the device-chooser modal (default mic / default camera).
        electron_1.session.defaultSession.setDevicePermissionHandler(() => true);
    }
    catch (err) {
        console.error('[permissions] failed to wire permission handlers (non-fatal):', err);
    }
    try {
        buildAppMenu();
    }
    catch (err) {
        console.error('[menu] init failed (non-fatal):', err);
    }
    try {
        setupIpc();
    }
    catch (err) {
        fatalError('setupIpc', err);
        electron_1.app.quit();
        return;
    }
    try {
        appBaseUrl = await startNextServer();
    }
    catch (err) {
        fatalError('startNextServer', err);
        electron_1.app.quit();
        return;
    }
    try {
        await createMainWindow(appBaseUrl);
    }
    catch (err) {
        fatalError('createMainWindow', err);
        electron_1.app.quit();
        return;
    }
    try {
        (0, updater_1.setupAutoUpdater)({ getMainWindow: () => mainWindow });
    }
    catch (err) {
        console.error('[updater] init failed (non-fatal):', err);
    }
    // ── Auto-start NDI sender ─────────────────────────────────────
    // The whole point of "one-click NDI" is that the user shouldn't have
    // to click anything. As soon as the app is up and the NDI runtime is
    // present, fire up the sender on its own with sensible defaults so
    // the source appears in vMix / Wirecast / OBS / NDI Studio Monitor
    // immediately on the LAN. The user can stop it from the NDI panel
    // if they don't want it.
    if (ndi.isAvailable()) {
        try {
            await ndi.start({ name: 'ScriptureLive AI', width: 1920, height: 1080, fps: 30 });
            frameCapture = new frame_capture_1.FrameCapture({
                baseUrl: appBaseUrl,
                onFrame: (buf, w, h) => ndi.sendFrame(buf, w, h),
                onStatus: (msg) => broadcastNdiStatus({ ...ndi.getStatus(), captureMessage: msg }),
            });
            await frameCapture.start({
                width: 1920,
                height: 1080,
                fps: 30,
                path: '/api/output/congregation',
                transparent: false,
            });
            broadcastNdiStatus(ndi.getStatus());
            console.log('[ndi] auto-started sender "ScriptureLive AI" @ 1080p30');
        }
        catch (err) {
            console.error('[ndi] auto-start failed (non-fatal):', err);
            try {
                if (frameCapture)
                    await frameCapture.stop();
            }
            catch { /* ignore */ }
            frameCapture = null;
            try {
                await ndi.stop();
            }
            catch { /* ignore */ }
        }
    }
    else {
        console.log('[ndi] runtime not detected — sender not auto-started:', ndi.unavailableReason());
    }
});
electron_1.app.on('window-all-closed', async () => {
    try {
        if (frameCapture)
            await frameCapture.stop();
    }
    catch { /* ignore */ }
    try {
        await ndi.stop();
    }
    catch { /* ignore */ }
    if (nextProcess) {
        try {
            nextProcess.kill();
        }
        catch { /* ignore */ }
    }
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', async () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0 && appBaseUrl) {
        await createMainWindow(appBaseUrl);
    }
});
//# sourceMappingURL=main.js.map