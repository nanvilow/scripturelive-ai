import {
  pgTable,
  text,
  timestamp,
  serial,
  index,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const telemetryInstalls = pgTable(
  "telemetry_installs",
  {
    installId: text("install_id").primaryKey(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appVersion: text("app_version"),
    os: text("os"),
    countryCode: text("country_code"),
  },
  (t) => ({
    lastSeenIdx: index("telemetry_installs_last_seen_idx").on(t.lastSeenAt),
  }),
);

export const telemetryHeartbeats = pgTable(
  "telemetry_heartbeats",
  {
    id: serial("id").primaryKey(),
    installId: text("install_id").notNull(),
    /** v0.7.14 — Per-app-launch UUID minted by the desktop client at
     *  Next.js module-load time (effectively when the Electron app
     *  starts) and held in memory until the process exits. Lets the
     *  /telemetry/records endpoint derive per-session start/end
     *  timestamps and an average-usage-time KPI without any explicit
     *  session/start or session/end roundtrip. Older heartbeats (pre
     *  v0.7.14) carry NULL here and are excluded from the average. */
    sessionId: text("session_id"),
    code: text("code"),
    appVersion: text("app_version"),
    ipAnon: text("ip_anon"),
    location: text("location"),
    features: jsonb("features"),
    ts: timestamp("ts", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    installIdx: index("telemetry_hb_install_idx").on(t.installId),
    codeIdx: index("telemetry_hb_code_idx").on(t.code),
    tsIdx: index("telemetry_hb_ts_idx").on(t.ts),
    sessionIdx: index("telemetry_hb_session_idx").on(t.sessionId),
  }),
);

export const telemetryErrors = pgTable(
  "telemetry_errors",
  {
    id: serial("id").primaryKey(),
    installId: text("install_id").notNull(),
    code: text("code"),
    appVersion: text("app_version"),
    errorType: text("error_type").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    ts: timestamp("ts", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    installIdx: index("telemetry_err_install_idx").on(t.installId),
    tsIdx: index("telemetry_err_ts_idx").on(t.ts),
    typeIdx: index("telemetry_err_type_idx").on(t.errorType),
  }),
);

export type TelemetryInstall = typeof telemetryInstalls.$inferSelect;
export type TelemetryHeartbeat = typeof telemetryHeartbeats.$inferSelect;
export type TelemetryError = typeof telemetryErrors.$inferSelect;

export const TELEMETRY_HB_RETENTION_INTERVAL = sql`'30 days'::interval`;
export const TELEMETRY_ERR_RETENTION_INTERVAL = sql`'90 days'::interval`;
