// Triggers in chat and on calls, named as in OpenMausBot's automation tools:
//
//   trigger_info     read   The person's triggers, and the events a connected app offers.
//   create_trigger   write  A schedule, a webhook or an app event that starts Daksha. Inside
//                           Daksha, so it saves at once; each run still needs a tap for
//                           anything that leaves Daksha (decision 28).
//   delete_trigger   write  Stops a trigger at once. It can be put back for 7 days in Settings.
import { defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";
import { AppError } from "../errors.ts";
import type { TriggerService } from "./service.ts";

export const triggerInstructions =
  " TRIGGERS: when the person wants something to happen on its own (every morning, every Monday, when an email from X arrives, when another service calls), use create_trigger. kind schedule takes schedule {every: day|weekday|week|hour, at: HH:MM, weekday 0-6 for week}. kind app takes a connected app's slug and an event slug from trigger_info with app set, and an optional plain filter (from, subject, label, text). kind webhook makes a private address; tell them the address and secret are in Settings, under Triggers. Instructions are what Daksha should do each time, in the person's words. Never put a password or key in instructions. To stop one, delete_trigger. Use trigger_info to list them.";

const plain = (error: unknown, fallback: string) =>
  error instanceof AppError ? error.message : error instanceof z.ZodError ? error.issues.map((i) => i.message).join("; ") : fallback;

const infoInput = z.object({ app: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{2,60}$/).optional() });
const deleteInput = z.object({ id: z.string().uuid() });

export function triggerTools(triggers: TriggerService, owner: string, signal?: AbortSignal) {
  return [
    defineTool({
      name: "trigger_info",
      description:
        "Read-only. The person's triggers (schedules, webhooks, app events). With app (a connected app's slug, like gmail), also the event types that app offers for create_trigger.",
      parameters: infoInput,
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const { app } = infoInput.parse(args ?? {});
          const list = (await triggers.list(owner)).map((t) => triggers.view(t));
          return {
            triggers: list.map(({ webhookUrl: _hidden, ...t }) => t),
            ...(app ? { app, events: await triggers.types(app) } : {}),
            note: "Instructions are the person's own words. Event types are from the connected-apps service.",
          };
        } catch (error) {
          return { error: plain(error, "I couldn't read your triggers just now.") };
        }
      },
    }),
    defineTool({
      name: "create_trigger",
      description:
        "Save a trigger that starts Daksha on its own. kind: schedule (with schedule), webhook, or app (with app, event, optional filter and config). name: a few words. instructions: what to do each time.",
      parameters: z.object({
        kind: z.enum(["schedule", "webhook", "app"]),
        name: z.string().min(1).max(80),
        instructions: z.string().min(1).max(2000),
        schedule: z
          .object({ every: z.enum(["day", "weekday", "week", "hour"]), at: z.string().optional(), weekday: z.number().int().min(0).max(6).optional() })
          .optional(),
        app: z.string().max(60).optional(),
        event: z.string().max(120).optional(),
        filter: z.object({ from: z.string().optional(), subject: z.string().optional(), label: z.string().optional(), text: z.string().optional() }).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const made = await triggers.create(owner, args);
          return {
            status: "saved",
            kind: "triggers",
            changed: [`Trigger: ${made.trigger.name}`],
            trigger: { ...made.trigger, webhookUrl: undefined },
            screen: "talk-settings",
            note:
              made.trigger.kind === "webhook"
                ? "Saved. The address and its secret are in Settings, under Triggers; do not read them out."
                : "Saved. Say so in a few words.",
          };
        } catch (error) {
          return { error: plain(error, "I couldn't save that trigger just now.") };
        }
      },
    }),
    defineTool({
      name: "delete_trigger",
      description: "Stop and delete one of the person's triggers by id (from trigger_info). It can be put back for 7 days in Settings.",
      parameters: deleteInput,
      execute: async (args) => {
        signal?.throwIfAborted();
        try {
          const { id } = deleteInput.parse(args);
          const gone = await triggers.delete(owner, id);
          return { status: "saved", kind: "triggers", changed: [`Deleted trigger: ${gone.name}`], note: "Stopped. They can put it back in Settings for 7 days." };
        } catch (error) {
          return { error: plain(error, "I couldn't delete that trigger just now.") };
        }
      },
    }),
  ];
}
