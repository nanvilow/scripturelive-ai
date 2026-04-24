import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import OpenAI, { toFile } from "openai";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const BIBLE_PROMPT =
  "The speaker is delivering a Christian sermon and may quote the Bible. " +
  "Common Bible book names: Genesis, Exodus, Leviticus, Numbers, Deuteronomy, " +
  "Joshua, Judges, Ruth, Samuel, Kings, Chronicles, Ezra, Nehemiah, Esther, " +
  "Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, " +
  "Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, " +
  "Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, " +
  "Luke, John, Acts, Romans, Corinthians, Galatians, Ephesians, Philippians, " +
  "Colossians, Thessalonians, Timothy, Titus, Philemon, Hebrews, James, Peter, " +
  "Jude, Revelation. Common terms: Jesus, Christ, Lord, God, Holy Spirit, " +
  "gospel, salvation, righteousness, kingdom, covenant, prophet, apostle, " +
  "disciple, faith, grace, mercy, sin, repentance, baptism, communion, amen.";

interface ClientSpec {
  apiKey: string;
  baseURL?: string;
}

let cached: { spec: ClientSpec; client: OpenAI } | null = null;

function resolveClientSpec(): ClientSpec | null {
  const directKey = process.env["OPENAI_API_KEY"];
  if (directKey) return { apiKey: directKey };
  const proxyKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const proxyBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (proxyKey && proxyBase) return { apiKey: proxyKey, baseURL: proxyBase };
  return null;
}

function getClient(): OpenAI | null {
  const spec = resolveClientSpec();
  if (!spec) return null;
  if (
    cached &&
    cached.spec.apiKey === spec.apiKey &&
    cached.spec.baseURL === spec.baseURL
  ) {
    return cached.client;
  }
  const client = spec.baseURL
    ? new OpenAI({ apiKey: spec.apiKey, baseURL: spec.baseURL })
    : new OpenAI({ apiKey: spec.apiKey });
  cached = { spec, client };
  return client;
}

function pickExtAndMime(incomingType: string): { ext: string; mime: string } {
  const t = (incomingType || "").toLowerCase();
  if (t.includes("wav") || t.includes("x-wav")) return { ext: "wav", mime: "audio/wav" };
  if (t.includes("mp3") || t.includes("mpeg")) return { ext: "mp3", mime: "audio/mpeg" };
  if (t.includes("ogg")) return { ext: "ogg", mime: "audio/ogg" };
  if (t.includes("m4a") || t.includes("mp4") || t.includes("aac"))
    return { ext: "m4a", mime: "audio/mp4" };
  if (t.includes("flac")) return { ext: "flac", mime: "audio/flac" };
  if (t.includes("webm")) return { ext: "webm", mime: t };
  return { ext: "webm", mime: t || "audio/webm" };
}

router.post(
  "/transcribe",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    const client = getClient();
    if (!client) {
      res.status(503).json({
        error:
          "Transcription is unavailable: OPENAI_API_KEY is not configured on the server.",
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
      const { ext, mime } = pickExtAndMime(file.mimetype || "");
      const named = await toFile(file.buffer, `chunk.${ext}`, { type: mime });

      const result = await client.audio.transcriptions.create({
        file: named,
        model: "gpt-4o-mini-transcribe",
        language: "en",
        prompt: BIBLE_PROMPT,
        response_format: "json",
      });

      const text = (result?.text || "").trim();
      res.json({ text });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      logger.error({ err: msg }, "[transcribe] failed");
      if (/Incorrect API key|401|Invalid.*api.*key|authentication/i.test(msg)) {
        res
          .status(401)
          .json({ error: "OpenAI rejected the API key configured on the server." });
        return;
      }
      res.status(500).json({ error: msg });
    }
  },
);

export default router;
