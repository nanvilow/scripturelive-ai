"use strict";
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
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        title: 'ScriptureLive AI',
    });
    mainWindow.removeMenu();
    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
        electron_1.shell.openExternal(target);
        return { action: 'deny' };
    });
    await mainWindow.loadURL(url);
    mainWindow.on('closed', () => { mainWindow = null; });
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
    electron_1.ipcMain.handle('output:open-window', (_e, opts) => {
        if (!appBaseUrl)
            return { ok: false, error: 'app not ready' };
        let target = electron_1.screen.getPrimaryDisplay();
        if (opts?.displayId !== undefined) {
            const found = electron_1.screen.getAllDisplays().find((d) => d.id === opts.displayId);
            if (found)
                target = found;
            else {
                // Pick the first non-primary display if available
                const others = electron_1.screen.getAllDisplays().filter((d) => d.id !== electron_1.screen.getPrimaryDisplay().id);
                if (others[0])
                    target = others[0];
            }
        }
        else if (electron_1.screen.getAllDisplays().length > 1) {
            // No explicit pick → prefer the first non-primary display so the
            // operator's main monitor stays free for the console.
            const others = electron_1.screen.getAllDisplays().filter((d) => d.id !== electron_1.screen.getPrimaryDisplay().id);
            if (others[0])
                target = others[0];
        }
        const { x, y, width, height } = target.bounds;
        const win = new electron_1.BrowserWindow({
            x, y, width, height,
            backgroundColor: '#000',
            title: 'ScriptureLive — Congregation Display',
            autoHideMenuBar: true,
            fullscreen: target.id !== electron_1.screen.getPrimaryDisplay().id,
        });
        win.removeMenu();
        win.loadURL(`${appBaseUrl}/api/output/congregation`);
        return { ok: true };
    });
    // Stage-display window: shows current slide, next slide, sermon notes,
    // countdown timer and clock for the speaker on a separate screen.
    electron_1.ipcMain.handle('output:open-stage', (_e, opts) => {
        if (!appBaseUrl)
            return { ok: false, error: 'app not ready' };
        let target = electron_1.screen.getPrimaryDisplay();
        if (opts?.displayId !== undefined) {
            const found = electron_1.screen.getAllDisplays().find((d) => d.id === opts.displayId);
            if (found)
                target = found;
        }
        const { x, y, width, height } = target.bounds;
        const win = new electron_1.BrowserWindow({
            x, y, width, height,
            backgroundColor: '#000',
            title: 'ScriptureLive — Stage Display',
            autoHideMenuBar: true,
            fullscreen: target.id !== electron_1.screen.getPrimaryDisplay().id,
        });
        win.removeMenu();
        win.loadURL(`${appBaseUrl}/api/output/stage`);
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