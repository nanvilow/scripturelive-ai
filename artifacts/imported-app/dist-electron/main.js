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
const frame_capture_1 = require("./frame-capture");
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
    nextProcess.stdout?.on('data', (b) => process.stdout.write(`[next] ${b}`));
    nextProcess.stderr?.on('data', (b) => process.stderr.write(`[next:err] ${b}`));
    nextProcess.on('exit', (code) => {
        if (code !== 0 && !electron_1.app.isReady())
            electron_1.app.quit();
    });
    // Wait for server readiness
    const url = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${url}/api/output?format=json`);
            if (res.ok)
                return url;
        }
        catch { /* not ready */ }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Next server failed to start');
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
            await frameCapture.start({ width: opts.width, height: opts.height, fps: opts.fps });
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
    electron_1.ipcMain.handle('output:open-window', () => {
        if (!appBaseUrl)
            return { ok: false, error: 'app not ready' };
        const win = new electron_1.BrowserWindow({
            width: 1280, height: 720, backgroundColor: '#000',
            title: 'ScriptureLive — Congregation Display',
            autoHideMenuBar: true,
        });
        win.removeMenu();
        win.loadURL(`${appBaseUrl}/api/output/congregation`);
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
    setupIpc();
    try {
        appBaseUrl = await startNextServer();
    }
    catch (err) {
        console.error('[main] Failed to start Next server:', err);
        electron_1.app.quit();
        return;
    }
    await createMainWindow(appBaseUrl);
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