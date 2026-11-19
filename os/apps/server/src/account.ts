import { Hono } from "hono";
import { z } from "zod";
import type { Store } from "./db.ts";
import { AppError } from "./errors.ts";
import type { ConnectorService } from "./connectors/index.ts";
import type { DeboService } from "./debo/index.ts";
import type { Files } from "./files.ts";
import type { ImageService } from "./images/service.ts";
import type { McpService } from "./mcp/service.ts";
import type { OwnKeysService } from "./own-keys/service.ts";
import type { CustomPeopleService } from "./custom-people/index.ts";
import type { VoiceCopyService } from "./voice-clone/service.ts";

/** Kinds that hold secrets or session state. They are never part of a person's export. */
const NEVER_EXPORTED = new Set(["credentials", "sessions"]);

/**
 * The person's right to take their data and to remove it. Both act only on the
 * signed-in owner. Deleting the Neon Auth login itself is a separate step: see
 * docs/AUTH.md for everything that lives outside this table.
 */
export function accountRoutes(
  db: Store,
  files: Files,
  debo?: DeboService,
  connectors?: ConnectorService,
  mcp?: McpService,
  ownKeys?: OwnKeysService,
  images?: ImageService,
  customPeople?: Pick<CustomPeopleService, "removeAll">,
  voiceCopy?: VoiceCopyService,
) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/export", async (c) => {
    const rows = (await db.listOwner(c.get("owner"))).filter((row) => !NEVER_EXPORTED.has(row.kind));
    c.header("Content-Disposition", 'attachment; filename="daksha-data.json"');
    const journal = (await debo?.exportMine(c.get("owner"))) ?? null;
    // Which apps are connected, and since when. Never a token: Daksha does not hold them.
    const apps = (await connectors?.exportMine(c.get("owner"))) ?? null;
    // The person's own tool servers: name, address, tools and when each last worked. Never the secret.
    const toolServers = mcp
      ? (await mcp.list(c.get("owner"))).map((s) => ({
          name: s.name,
          url: s.url,
          tools: s.tools.map((t) => t.name),
          lastOk: s.lastOk,
          lastAt: s.lastAt,
          addedAt: s.createdAt,
        }))
      : null;
    return c.json({
      exportedAt: new Date().toISOString(),
      // Push devices: the push service address and when it was added. The device keys stay out.
      records: rows
        .filter((row) => row.kind !== "mcp_servers" && row.kind !== "own_keys")
        .map((row) =>
          row.kind === "push-subscriptions" && row.data && typeof row.data === "object"
            ? { ...row, data: { ...(row.data as Record<string, unknown>), keys: undefined } }
            : row,
        ),
      journal,
      connectedApps: apps,
      toolServers,
      // Which of the person's own AI keys are set. Never a key, and never its last characters.
      ownKeys: (await ownKeys?.exportMine(c.get("owner"))) ?? null,
    });
  });
  app.delete("/", async (c) => {
    const owner = c.get("owner");
    // A body that must say so out loud stops a stray request from wiping an account.
    const body = z
      .object({ confirm: z.literal(true) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success)
      throw new AppError('Send {"confirm": true} to delete all of your Daksha data', 400);
    // The journal first: if it fails the person can try again and nothing else is gone yet.
    const entriesRemoved = (await debo?.deleteMine(owner)) ?? 0;
    // Connected apps next: the sign-ins held at the provider must go too, or the wipe is not a wipe.
    const appsDisconnected = (await connectors?.removeAll(owner)) ?? 0;
    const filesRemoved = await files.removeAll(owner);
    // Pictures Daksha made: the files in the bucket go before their records do.
    const imagesRemoved = (await images?.removeAll(owner)) ?? 0;
    // Voice copies are deleted at Cartesia, and leftover recordings in the bucket. This runs
    // before the custom people and the own keys go: a voice copy made on the person's own
    // Cartesia key needs that key to be deleted.
    const voice = (await voiceCopy?.removeAll(owner)) ?? { voiceCopiesRemoved: 0, notConfirmedAtCartesia: 0 };
    // Custom people: any raw upload still in the bucket. Their profiles are records, so they go
    // with the records below.
    const customUploadsRemoved = (await customPeople?.removeAll(owner)) ?? 0;
    // The person's own AI keys. The records below would go anyway; this is the clear path.
    await ownKeys?.removeAll(owner);
    const recordsRemoved = await db.removeOwner(owner);
    return c.json({
      ok: true,
      recordsRemoved,
      filesRemoved,
      entriesRemoved,
      appsDisconnected,
      imagesRemoved,
      customUploadsRemoved,
      voiceCopiesRemoved: voice.voiceCopiesRemoved,
      ...(voice.notConfirmedAtCartesia
        ? {
            note: "Some voice copies could not be confirmed as deleted at Cartesia, because their key was gone. If you used your own Cartesia key, delete them in your Cartesia account.",
          }
        : {}),
    });
  });
  return app;
}
