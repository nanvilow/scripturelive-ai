import fs from "node:fs";
import OpenAI from "openai";

const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!apiKey || !baseURL) {
  console.error("Missing AI_INTEGRATIONS_OPENAI_* env in this shell.");
  process.exit(1);
}
const client = new OpenAI({ apiKey, baseURL });

const VERSE =
  "For God so loved the world, that he gave his only begotten Son, " +
  "that whosoever believeth in him should not perish, but have everlasting life.";

console.log("STEP 1: synthesize known Bible verse via OpenAI TTS");
console.log("  Input verse: " + JSON.stringify(VERSE));

const tts = await client.audio.speech.create({
  model: "gpt-4o-mini-tts",
  voice: "alloy",
  input: VERSE,
  response_format: "mp3",
});
const buf = Buffer.from(await tts.arrayBuffer());
const samplePath = "/tmp/john316.mp3";
fs.writeFileSync(samplePath, buf);
console.log("  Wrote " + buf.length + " bytes to " + samplePath);

console.log("\nSTEP 2: POST that audio to api-server /api/transcribe");
const fd = new FormData();
fd.append("audio", new Blob([buf], { type: "audio/mpeg" }), "john316.mp3");
fd.append("language", "en");

const t0 = Date.now();
const r = await fetch("http://127.0.0.1:39999/api/transcribe", {
  method: "POST",
  body: fd,
});
const elapsed = Date.now() - t0;
const body = await r.json();
console.log("  HTTP status: " + r.status);
console.log("  Round-trip latency: " + elapsed + " ms");
console.log("  Response body: " + JSON.stringify(body));

console.log("\nSTEP 3: compare returned transcription to original verse");
const got = (body.text || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const want = VERSE.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
console.log("  WANT: " + want);
console.log("  GOT:  " + got);
console.log("  EXACT MATCH: " + (got === want));
if (got !== want) {
  const aSet = new Set(want.split(" "));
  const bSet = new Set(got.split(" "));
  let inter = 0;
  for (const w of aSet) if (bSet.has(w)) inter++;
  console.log("  word overlap: " + inter + "/" + aSet.size +
              " (" + Math.round(100 * inter / aSet.size) + "%)");
}
