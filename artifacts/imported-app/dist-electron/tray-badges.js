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
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBadgedIcon = renderBadgedIcon;
const electron_1 = require("electron");
const COLORS = {
    blue: '#3b82f6',
    orange: '#f59e0b',
    green: '#22c55e',
    red: '#ef4444',
};
/**
 * Composite a colored circle badge onto the bottom-right corner of an
 * icon and return as an electron NativeImage. The dot diameter and
 * white outline scale as a fraction of the icon so the same helper
 * produces a readable badge on a 16px tray icon (Windows / Linux) and
 * on the 192px source we feed macOS.
 *
 * The white stroke is what makes the badge readable against both light
 * and dark system trays — without it, the orange downloading dot
 * disappears against a yellow Windows accent and the green ready dot
 * disappears against a green Linux Yaru theme.
 *
 * `sharp` is loaded via dynamic import on the first render rather than
 * a top-level `import sharp from 'sharp'`. The native binding can fail
 * to load on exotic / mis-packaged platforms; using a dynamic import
 * keeps that failure a *caught promise rejection* inside this function
 * (and therefore inside the caller's try/catch in `prepareTrayBadges`),
 * not a synchronous throw at app startup that would prevent the tray
 * from initializing at all.
 */
async function renderBadgedIcon(baseIconPath, size, color) {
    const sharp = (await Promise.resolve().then(() => __importStar(require('sharp')))).default;
    const dotDiameter = Math.max(5, Math.round(size * 0.5));
    const stroke = Math.max(1, Math.round(dotDiameter * 0.16));
    const offset = Math.max(0, Math.round(size * 0.02));
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${dotDiameter}" height="${dotDiameter}">` +
        `<circle cx="${dotDiameter / 2}" cy="${dotDiameter / 2}" ` +
        `r="${dotDiameter / 2 - stroke / 2}" ` +
        `fill="${COLORS[color]}" stroke="white" stroke-width="${stroke}" />` +
        `</svg>`);
    const buffer = await sharp(baseIconPath)
        .resize(size, size, { fit: 'contain' })
        .composite([{
            input: svg,
            left: size - dotDiameter - offset,
            top: size - dotDiameter - offset,
        }])
        .png()
        .toBuffer();
    return electron_1.nativeImage.createFromBuffer(buffer);
}
//# sourceMappingURL=tray-badges.js.map