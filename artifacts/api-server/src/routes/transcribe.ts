import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { logger } from "../lib/logger";

/**
 * /api/transcribe — Deepgram REST proxy for the desktop client.
 *
 * v0.7.19 — OpenAI removed. The operator's OpenAI project key was
 * rotated and the rotation never propagated cleanly to this Replit
 * deployment, so every customer .exe forwarding here was getting 401
 * on every MediaRecorder chunk. Deepgram already powered the streaming
 * WebSocket path, so consolidating on a single STT vendor (controlled
 * by DEEPGRAM_API_KEY) eliminates the rotation-mismatch class of bug
 * entirely.
 */

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Same Deepgram REST URL + post-processing flags as the streaming
// path, so transcript style is consistent across paths. See the
// Next-side route for per-flag rationale.
const DEEPGRAM_REST_URL =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en";

function pickMime(incomingType: string): string {
  const t = (incomingType || "").toLowerCase();
  if (t.includes("wav") || t.includes("x-wav")) return "audio/wav";
  if (t.includes("mp3") || t.includes("mpeg")) return "audio/mpeg";
  if (t.includes("ogg")) return "audio/ogg";
  if (t.includes("m4a") || t.includes("mp4") || t.includes("aac")) return "audio/mp4";
  if (t.includes("flac")) return "audio/flac";
  if (t.includes("webm")) return t || "audio/webm";
  return t || "audio/webm";
}

interface DeepgramPrerecordedResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
}

router.post(
  "/transcribe",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    const apiKey = (process.env["DEEPGRAM_API_KEY"] || "").trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          "Transcription is unavailable: DEEPGRAM_API_KEY is not configured on the server.",
      });
      return;
    }

    const file = req.file;
    if (!file || !file.buffer || file.size === 0) {
      res.status(400).json({ error: 'Missing "audio" file.' });
      return;
    }
    if (file.size < 1024) {
      res.json({ text: "" });
      return;
    }

    try {
      const mime = pickMime(file.mimetype || "");
      const upstream = await fetch(DEEPGRAM_REST_URL, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": mime,
        },
        body: file.buffer,
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        const keyTail = apiKey.slice(-6);
        logger.error(
          { status: upstream.status, keyTail, detail: detail.slice(0, 200) },
          "[transcribe] Deepgram REST call rejected",
        );
        if (upstream.status === 401 || upstream.status === 403) {
          res
            .status(401)
            .json({ error: "Deepgram rejected the API key configured on the server." });
          return;
        }
        res.status(upstream.status).json({
          error: `Deepgram HTTP ${upstream.status}: ${detail.slice(0, 200)}`,
        });
        return;
      }

      const json = (await upstream.json()) as DeepgramPrerecordedResponse;
      const text = (json.results?.channels?.[0]?.alternatives?.[0]?.transcript || "").trim();
      res.json({ text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      logger.error({ err: msg }, "[transcribe] Deepgram fetch failed");
      res.status(500).json({ error: msg });
    }
  },
);

export default router;
