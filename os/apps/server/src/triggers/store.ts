// Triggers: things that start Daksha on their own (docs/TRIGGERS.md is part of FEATURES.md).
//
//   schedule  every day, every weekday, once a week or every hour, at a time the person picks
//   webhook   a private web address another service can call, signed with its own secret
//   app       an event in a connected app (Composio), such as "a new email from my bank"
//
// Each run is an ordinary background task with the person's instructions and, for webhooks and
// app events, the event as untrusted data. The task's tools still prepare anything that leaves
// Daksha for the person's tap (decision 28). One record per trigger, kind "triggers".
import { z } from "zod";
import { APP_FILTER_MAX } from "../../../../third_party/openmausbot/triggers/app-trigger-filter.ts";

export const KIND = "triggers";
/** Triggers one person may have. */
export const TRIGGERS_MAX = 20;
/** Runs one trigger may have waiting or running at once (OpenMausBot's DEFAULT_MAX_PENDING_RUNS). */
export const MAX_PENDING_RUNS = 3;
/** Webhook and app-event runs one trigger may start in an hour. */
export const RUNS_PER_HOUR = 20;
/** A deleted trigger can be put back for this long (OpenMausBot's RESTORE_WINDOW_MS). */
export const RESTORE_DAYS = 7;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 07:30.");
export const scheduleSchema = z.object({
  every: z.enum(["day", "weekday", "week", "hour"]),
  /** Local time; for "hour" only the minutes are used. */
  at: time.default("08:00"),
  /** 0 is Sunday. Only for "week". */
  weekday: z.number().int().min(0).max(6).optional(),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const filterSchema = z
  .object({
    from: z.string().trim().max(APP_FILTER_MAX).optional(),
    subject: z.string().trim().max(APP_FILTER_MAX).optional(),
    label: z.string().trim().max(APP_FILTER_MAX).optional(),
    text: z.string().trim().max(APP_FILTER_MAX).optional(),
  })
  .strict();

export const createTriggerInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("schedule"),
    name: z.string().trim().min(1).max(80),
    instructions: z.string().trim().min(1).max(2000),
    schedule: scheduleSchema,
  }),
  z.object({
    kind: z.literal("webhook"),
    name: z.string().trim().min(1).max(80),
    instructions: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("app"),
    name: z.string().trim().min(1).max(80),
    instructions: z.string().trim().min(1).max(2000),
    /** Composio toolkit slug, like gmail. */
    app: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,60}$/),
    /** Composio trigger type slug, like GMAIL_NEW_GMAIL_MESSAGE. */
    event: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,120}$/),
    filter: filterSchema.optional(),
    config: z.record(z.string(), z.unknown()).default({}),
  }),
]);
export type CreateTriggerInput = z.infer<typeof createTriggerInput>;

export interface Trigger {
  id: string;
  name: string;
  instructions: string;
  kind: "schedule" | "webhook" | "app";
  enabled: boolean;
  schedule?: Schedule;
  /** The random part of the webhook address. Its secret is derived from it on the server. */
  hookId?: string;
  app?: {
    app: string;
    event: string;
    filter?: z.infer<typeof filterSchema>;
    config: Record<string, unknown>;
    /** The trigger's id at the connected-apps service. */
    remoteId?: string;
    state: "active" | "error";
    error?: string;
  };
  runs: number;
  filtered: number;
  /** Run start times in the last hour, for RUNS_PER_HOUR. */
  recent: string[];
  lastSlot?: string;
  lastRunAt?: string;
  lastTaskId?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}
