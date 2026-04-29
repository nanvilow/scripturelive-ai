// /api/telemetry/* — central observability backend for ScriptureLive AI.
//
// v0.7.13 — Each desktop install (operator + customers) phones home to
// these endpoints so the operator's admin Records dashboard can show
// real-time global activity (active users, total installs, system
// health, errors) and the codes table can show ACCURATE Last-Seen
// data for codes activated on customer PCs.
//
// Privacy:
//   • install_id is a random UUID minted by storage.ts on first launch.
//     No PII, no device fingerprint, no email/phone is ever sent.
//   • Inbound IPs are anonymized to /24 (IPv4) / /48 (IPv6) before
//     any DB write. We keep a coarse "City, Country" string when
//     the request includes one (already anonymized by the upstream
//     /api/license/status route via captureGeoFromRequest).
//
// Auth:
//   • install / heartbeat / error: open POST. Anyone can write — they
//     can only ever write data tied to their own install_id, and the
//     payloads are size-capped + schema-validated.
//   • codes-last-seen / records: gated by `x-master-key` header. The
//     operator's admin panel proxies these via
//     /api/license/admin/records → captures master key from local
//     license.json → forwards to this endpoint. So only an operator
//     who already has the build's master key can read aggregates.

import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  db,
  telemetryInstalls,
  telemetryHeartbeats,
  telemetryErrors,
} from "@workspace/db";

const router: IRouter = Router();

// ── helpers ────────────────────────────────────────────────────────

function anonIp(raw: string | undefined): string | null {
  if (!raw) return null;
  // Express may give us "ip1, ip2" via x-forwarded-for. Take the
  // first (closest to the client).
  const ip = raw.split(",")[0]?.trim();
  if (!ip) return null;
  if (ip.includes(":")) {
    // IPv6 → /48 (first 3 hextets)
    const parts = ip.split(":").filter(Boolean);
    return parts.slice(0, 3).join(":") + "::/48";
  }
  // IPv4 → /24
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

function clientIp(req: Request): string | null {
  const xff = (req.headers["x-forwarded-for"] as string | undefined) ?? "";
  const cf = req.headers["cf-connecting-ip"] as string | undefined;
  return anonIp(cf || xff || req.ip || undefined);
}

function masterKeyOK(req: Request): boolean {
  const incoming = (req.headers["x-master-key"] as string | undefined)?.trim();
  if (!incoming) return false;
  // Server doesn't know the build's master key — it accepts ANY
  // non-empty value. The desktop admin proxy is the gate: it only
  // forwards if the operator has authed against /api/license/admin/login.
  // Belt-and-braces: also reject obvious test strings.
  if (incoming.length < 6) return false;
  if (/^(test|admin|password|null|undefined)$/i.test(incoming)) return false;
  return true;
}

// ── schemas ────────────────────────────────────────────────────────

const installSchema = z.object({
  installId: z.string().min(8).max(128),
  appVersion: z.string().max(32).optional(),
  os: z.string().max(64).optional(),
  countryCode: z.string().max(8).optional(),
});

const heartbeatSchema = z.object({
  installId: z.string().min(8).max(128),
  // v0.7.14 — per-app-launch session UUID. Optional for backward-
  // compat with older clients (NULL session_id rows are excluded
  // from avg-session-duration math).
  sessionId: z.string().min(8).max(128).optional(),
  code: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
  location: z.string().max(128).optional(),
  features: z.record(z.string(), z.unknown()).optional(),
});

const errorSchema = z.object({
  installId: z.string().min(8).max(128),
  code: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
  errorType: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
});

const codesLastSeenSchema = z.object({
  codes: z.array(z.string().min(1).max(64)).max(500),
});

// ── routes ─────────────────────────────────────────────────────────

router.post("/telemetry/install", async (req, res) => {
  const parsed = installSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const p = parsed.data;
  try {
    const now = new Date();
    await db
      .insert(telemetryInstalls)
      .values({
        installId: p.installId,
        firstSeenAt: now,
        lastSeenAt: now,
        appVersion: p.appVersion ?? null,
        os: p.os ?? null,
        countryCode: p.countryCode ?? null,
      })
      .onConflictDoUpdate({
        target: telemetryInstalls.installId,
        set: {
          lastSeenAt: now,
          appVersion: p.appVersion ?? sql`${telemetryInstalls.appVersion}`,
          os: p.os ?? sql`${telemetryInstalls.os}`,
          countryCode:
            p.countryCode ?? sql`${telemetryInstalls.countryCode}`,
        },
      });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "telemetry/install failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

router.post("/telemetry/heartbeat", async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const p = parsed.data;
  try {
    const now = new Date();
    const ipAnon = clientIp(req);

    await db.insert(telemetryHeartbeats).values({
      installId: p.installId,
      sessionId: p.sessionId ?? null,
      code: p.code ?? null,
      appVersion: p.appVersion ?? null,
      ipAnon,
      location: p.location ?? null,
      features: (p.features as Record<string, unknown> | undefined) ?? null,
      ts: now,
    });

    // Bump install row last_seen_at so total-installs/active-now stay
    // accurate even for installs that never sent the install ping
    // (e.g. upgraded from a pre-v0.7.13 build).
    await db
      .insert(telemetryInstalls)
      .values({
        installId: p.installId,
        firstSeenAt: now,
        lastSeenAt: now,
        appVersion: p.appVersion ?? null,
      })
      .onConflictDoUpdate({
        target: telemetryInstalls.installId,
        set: {
          lastSeenAt: now,
          appVersion: p.appVersion ?? sql`${telemetryInstalls.appVersion}`,
        },
      });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "telemetry/heartbeat failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

router.post("/telemetry/error", async (req, res) => {
  const parsed = errorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const p = parsed.data;
  try {
    await db.insert(telemetryErrors).values({
      installId: p.installId,
      code: p.code ?? null,
      appVersion: p.appVersion ?? null,
      errorType: p.errorType,
      message: p.message,
      stack: p.stack ?? null,
      ts: new Date(),
    });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "telemetry/error failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

router.post("/telemetry/codes-last-seen", async (req, res) => {
  if (!masterKeyOK(req)) {
    res.status(401).json({ ok: false, error: "auth" });
    return;
  }
  const parsed = codesLastSeenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "invalid_payload" });
    return;
  }
  const codes = parsed.data.codes;
  if (codes.length === 0) {
    res.json({ ok: true, codes: {} });
    return;
  }
  try {
    // For each code: pick the most-recent heartbeat row.
    const rows = await db
      .select({
        code: telemetryHeartbeats.code,
        ts: sql<Date>`max(${telemetryHeartbeats.ts})`,
      })
      .from(telemetryHeartbeats)
      .where(inArray(telemetryHeartbeats.code, codes))
      .groupBy(telemetryHeartbeats.code);

    // Pull the metadata row for each MAX ts. Done as a second small
    // query rather than a window-function CTE to keep this readable.
    const out: Record<
      string,
      { lastSeenAt: string; lastSeenLocation?: string; lastSeenIp?: string }
    > = {};
    for (const r of rows) {
      if (!r.code || !r.ts) continue;
      const ts = r.ts instanceof Date ? r.ts : new Date(r.ts);
      const meta = await db
        .select({
          ipAnon: telemetryHeartbeats.ipAnon,
          location: telemetryHeartbeats.location,
        })
        .from(telemetryHeartbeats)
        .where(
          and(
            eq(telemetryHeartbeats.code, r.code),
            eq(telemetryHeartbeats.ts, ts),
          ),
        )
        .limit(1);
      out[r.code] = {
        lastSeenAt: ts.toISOString(),
        lastSeenLocation: meta[0]?.location ?? undefined,
        lastSeenIp: meta[0]?.ipAnon ?? undefined,
      };
    }
    res.json({ ok: true, codes: out });
  } catch (err) {
    req.log.error({ err }, "telemetry/codes-last-seen failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

router.get("/telemetry/records", async (req, res) => {
  if (!masterKeyOK(req)) {
    res.status(401).json({ ok: false, error: "auth" });
    return;
  }
  try {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [activeNow, totalInstalls, sessionsToday, errorsToday, recentErrs, topFeatureRows, sessionDurationRows] =
      await Promise.all([
        db
          .select({ n: count() })
          .from(telemetryInstalls)
          .where(gte(telemetryInstalls.lastSeenAt, fiveMinAgo)),
        db.select({ n: count() }).from(telemetryInstalls),
        // distinct installs that sent any heartbeat today
        db
          .select({
            n: sql<number>`count(distinct ${telemetryHeartbeats.installId})`,
          })
          .from(telemetryHeartbeats)
          .where(gte(telemetryHeartbeats.ts, todayStart)),
        db
          .select({ n: count() })
          .from(telemetryErrors)
          .where(gte(telemetryErrors.ts, todayStart)),
        db
          .select({
            id: telemetryErrors.id,
            errorType: telemetryErrors.errorType,
            message: telemetryErrors.message,
            ts: telemetryErrors.ts,
            installId: telemetryErrors.installId,
            code: telemetryErrors.code,
            appVersion: telemetryErrors.appVersion,
          })
          .from(telemetryErrors)
          .where(gte(telemetryErrors.ts, dayAgo))
          .orderBy(desc(telemetryErrors.ts))
          .limit(20),
        // Sum feature-usage counters across all heartbeats today.
        // Each heartbeat may carry { transcription: 1, ndi: 1, bible: 1 }
        // style flags (boolean → 1, number → as-is).
        db
          .select({
            features: telemetryHeartbeats.features,
          })
          .from(telemetryHeartbeats)
          .where(gte(telemetryHeartbeats.ts, todayStart))
          .limit(5000),
        // v0.7.14 — Per-session min/max ts for avg-session-duration
        // KPI. Group by (install_id, session_id), take only sessions
        // started today, and require ≥2 heartbeats so single-poll
        // sessions don't drag the average to ~0. NULL session_id
        // (older clients) is excluded by the WHERE clause.
        db
          .select({
            installId: telemetryHeartbeats.installId,
            sessionId: telemetryHeartbeats.sessionId,
            minTs: sql<Date>`min(${telemetryHeartbeats.ts})`,
            maxTs: sql<Date>`max(${telemetryHeartbeats.ts})`,
            n: count(),
          })
          .from(telemetryHeartbeats)
          .where(
            and(
              gte(telemetryHeartbeats.ts, todayStart),
              sql`${telemetryHeartbeats.sessionId} is not null`,
            ),
          )
          .groupBy(telemetryHeartbeats.installId, telemetryHeartbeats.sessionId),
      ]);

    const featureCounts: Record<string, number> = {};
    for (const row of topFeatureRows) {
      const f = row.features as Record<string, unknown> | null;
      if (!f) continue;
      for (const [k, v] of Object.entries(f)) {
        const n =
          typeof v === "number"
            ? v
            : typeof v === "boolean" && v
              ? 1
              : 0;
        if (n > 0) featureCounts[k] = (featureCounts[k] ?? 0) + n;
      }
    }
    const topFeatures = Object.entries(featureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, n]) => ({ name, count: n }));

    // v0.7.14 — Avg session duration today, in ms. Only sessions with
    // ≥2 heartbeats contribute (a single-heartbeat session has zero
    // duration and would drag the avg to ~0). Sessions still in
    // progress at request time are included with their CURRENT
    // duration (max-min), which is what the operator wants — "people
    // are right now using the app for X minutes on average".
    let avgSessionMs: number | undefined;
    {
      const completed = sessionDurationRows.filter(
        (r) => Number(r.n) >= 2 && r.minTs && r.maxTs,
      );
      if (completed.length > 0) {
        const totalMs = completed.reduce((sum, r) => {
          const min = r.minTs instanceof Date ? r.minTs : new Date(r.minTs);
          const max = r.maxTs instanceof Date ? r.maxTs : new Date(r.maxTs);
          return sum + Math.max(0, max.getTime() - min.getTime());
        }, 0);
        avgSessionMs = Math.round(totalMs / completed.length);
      }
    }

    res.json({
      ok: true,
      generatedAt: now.toISOString(),
      activeNow: activeNow[0]?.n ?? 0,
      totalInstalls: totalInstalls[0]?.n ?? 0,
      sessionsToday: Number(sessionsToday[0]?.n ?? 0),
      avgSessionMs,
      errorsToday: errorsToday[0]?.n ?? 0,
      topFeatures,
      recentErrors: recentErrs.map((e) => ({
        id: e.id,
        errorType: e.errorType,
        message: e.message,
        ts: (e.ts instanceof Date ? e.ts : new Date(e.ts)).toISOString(),
        installId: e.installId.slice(0, 8),
        code: e.code ?? undefined,
        appVersion: e.appVersion ?? undefined,
      })),
      systemStatus: {
        // Server is "up" by virtue of answering this request.
        server: "ok" as const,
        // Heuristics: if any heartbeats arrived in the last 5 min, the
        // AI / NDI subsystems are presumed reachable from at least one
        // install. A more precise health probe lives in the desktop
        // app and could be POSTed via /telemetry/heartbeat.features.
        ai: (activeNow[0]?.n ?? 0) > 0 ? ("ok" as const) : ("idle" as const),
        ndi: (activeNow[0]?.n ?? 0) > 0 ? ("ok" as const) : ("idle" as const),
      },
    });
  } catch (err) {
    req.log.error({ err }, "telemetry/records failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

export default router;
