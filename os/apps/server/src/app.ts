import "./config.ts";
import { randomUUID } from "node:crypto";
import { MessageSchema } from "@ag-ui/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { JWTVerifyGetKey } from "jose";
import { z } from "zod";
import {
  calendarRangeSchema,
  emailDraftSchema,
  proposalSchema,
} from "../../../packages/domain/src/index.ts";
import { accountRoutes } from "./account.ts";
import { ActionService } from "./actions.ts";
import { agentConfigured, makeRuntime } from "./agent.ts";
import { createAuth } from "./auth.ts";
import { BrowserService } from "./browser.ts";
import { ComputerService, type DockerRunner, resolveComputerDeployment } from "./computer.ts";
import { computerRoutes } from "./computer-routes.ts";
import {
  type ConnectorService,
  connectorCallbackRoute,
  connectorRoutes,
  createConnectors,
} from "./connectors/index.ts";
import type { Config } from "./config.ts";
import { publicUrlFor } from "./public-address.ts";
import { McpService } from "./mcp/service.ts";
import { mcpOAuthCallbackRoute, mcpRoutes } from "./mcp/routes.ts";
import { imageMakerFromEnv } from "./images/makers.ts";
import { imageRoutes } from "./images/routes.ts";
import { ImageService } from "./images/service.ts";
import { ownKeyRoutes } from "./own-keys/routes.ts";
import { OwnKeysService } from "./own-keys/service.ts";
import type { Store } from "./db.ts";
import { createDebo, type DeboService, deboRoutes } from "./debo/index.ts";
import { activeCustomVoice, CustomPeopleService, customPeopleRoutes, personModelFor } from "./custom-people/index.ts";
import { agentRoutes } from "./engine/routes.ts";
import { AgentService } from "./engine/service.ts";
import { AppError } from "./errors.ts";
import { Files } from "./files.ts";
import { GoogleAuth } from "./google-auth.ts";
import { checkinRoutes } from "./companion.ts";
import { CompanionJobs } from "./companion-jobs.ts";
import { buildBriefing, calendarFrom } from "./briefing.ts";
import { NewsService } from "./news/service.ts";
import { newsRoutes } from "./news/routes.ts";
import { newsWhyFor } from "./news/why.ts";
import { PromiseFinder } from "./promises.ts";
import { PushService, pushKeysFromEnv, pushRoutes } from "./push.ts";
import { companionRoutes } from "./reminders.ts";
import { PeopleStore, peopleRoutes } from "./people.ts";
import { CustomAvatarStore, customAvatarRoutes, voiceCharacterOf } from "./custom-avatars.ts";
import { PersonaStore, personaRoutes } from "./persona.ts";
import { OnboardingStore, onboardingRoutes } from "./onboarding.ts";
import { TalkSettingsStore, talkSettingsRoutes, voiceFor } from "./talk-settings.ts";
import { neonAuthProxy } from "./neon-auth-proxy.ts";
import { rateLimit } from "./rate-limit.ts";
import { DatabaseAgentRunner, threadOwner } from "./thread-runner.ts";
import { assertThreadId, ThreadStore } from "./threads.ts";
import { backgroundFailure } from "./log.ts";
import { readTimeZone, requestTimeZone, TIME_ZONE_HEADER, TimeZoneStore } from "./time-zone.ts";
import type { VoiceBrain } from "./voice/brain.ts";
import { EngineVoiceBrain } from "./voice/engine-brain.ts";
import { voiceAgentRoutes, voiceTokenRoutes } from "./voice/routes.ts";
import { ffmpegTools } from "./debo/audio.ts";
import {
  deboCartesiaKey,
  diarizerFromEnv,
  customPeopleGlue,
  voiceCopyRoutes,
  VoiceCopyService,
} from "./voice-clone/index.ts";
import { WorkspaceService } from "./workspace.ts";
import { type PhoneConfig, readPhoneConfig } from "./phone/config.ts";
import { livekitDialer } from "./phone/dialer.ts";
import { phoneAgentRoutes, phoneRoutes } from "./phone/routes.ts";
import { composioEventsFromEnv } from "./connectors/composio-events.ts";
import { EngineChannelBrain } from "./channels/brain.ts";
import { readChannelsConfig } from "./channels/config.ts";
import { channelHookRoutes, channelRoutes } from "./channels/routes.ts";
import { type ChannelBrain, ChannelService } from "./channels/service.ts";
import { proposalRoutes } from "./proposals/routes.ts";
import { ProposalService } from "./proposals/service.ts";
import { triggerHookRoutes, triggerRoutes } from "./triggers/routes.ts";
import { type AppEventSource, TriggerService } from "./triggers/service.ts";
import { type Dialer, PhoneService } from "./phone/service.ts";

export async function createApp(
  db: Store,
  config: Config,
  options: {
    docker?: DockerRunner;
    jwks?: JWTVerifyGetKey;
    /** Answers voice questions. Swap this one line to change Daksha's voice brain. */
    voiceBrain?: VoiceBrain;
    /** Where voice settings are read from. Tests pass their own. */
    voiceEnv?: () => Record<string, string | undefined>;
    /** Tests only: stands in for the network call to Neon Auth. */
    neonAuthFetch?: typeof fetch;
    /** The personal journal. Tests pass a fake one. */
    debo?: DeboService;
    /** Connected apps (Composio). Tests pass one built on a fake backend. */
    connectors?: ConnectorService;
    /** The person's own tool servers. Tests pass one with a fake network. */
    mcp?: McpService;
    /** Web push. Tests pass one with a fake sender; otherwise the VAPID keys come from the environment. */
    push?: PushService;
    /** The person's own AI keys. Tests pass one with a fake network. */
    ownKeys?: OwnKeysService;
    /** Pictures. Tests pass one with a fake picture service. */
    images?: ImageService;
    /** Custom people. Tests pass one with a fake model and bucket. */
    customPeople?: CustomPeopleService;
    /** Voice notes and calls of custom people, and voice copies. Tests pass one with fakes. */
    voiceCopy?: VoiceCopyService;
    /** The news feed. Tests pass one with a fake network; nothing reaches a real news service. */
    news?: NewsService;
    /** Places phone calls. Tests pass a fake; otherwise LiveKit SIP, only when its trunk is set. */
    phoneDialer?: (config: PhoneConfig) => Dialer;
    /** Connected-app events for triggers. Defaults to Composio when its key and webhook secret are set. */
    appEvents?: AppEventSource | null;
    /** SMS, WhatsApp and Telegram. Defaults to the env keys (channels/config.ts). */
    channelsEnv?: () => Record<string, string | undefined>;
    channelBrain?: ChannelBrain;
    channelFetch?: typeof fetch;
  } = {},
) {
  await resolveComputerDeployment(config);
  const auth = await createAuth(db, config, { jwks: options.jwks }),
    files = new Files(db, config, auth),
    google = new GoogleAuth(db, config),
    workspace = new WorkspaceService(db, config, files, google);
  const debo = options.debo ?? createDebo(config);
  const made = options.connectors
    ? { service: options.connectors, backend: null }
    : createConnectors(config, { googleConnected: (owner) => workspace.connected(owner) });
  const connectors = made.service;
  const mcp = options.mcp ?? new McpService(db, { encryptionKey: config.encryptionKey });
  // Signing in to a tool server (OAuth): the state is signed with a key made for that one job.
  mcp.configureSignIn({
    stateKey: auth.purposeKey("mcp-oauth-state"),
    redirectUrl: new URL("/api/mcp/oauth/callback", config.publicUrl).toString(),
  });
  const actions = new ActionService(db, {
    execute: (owner, input, connectionId, targetVersion) =>
      input.kind === "journal.add"
        ? debo.executeProposal(owner, input.data.text)
        : input.kind === "connector.call"
          ? input.data.toolkit.startsWith("mcp:")
            ? mcp.executeApproved(owner, input.data)
            : connectors.executeApproved(owner, input.data)
          : workspace.execute(owner, input, connectionId, targetVersion),
    prepare: (owner, input, connectionId) => workspace.prepare(owner, input, connectionId),
    connected: (owner) => workspace.connected(owner),
    connection: (owner) => workspace.connection(owner),
  });
  const browser = new BrowserService(db, config, auth, files);
  const computer = new ComputerService(db, config, options.docker);
  const agent = new AgentService(db, config, workspace, files, actions, browser, computer);
  agent.debo = debo;
  agent.connectors = connectors;
  agent.mcp = mcp;
  // A person's own AI keys (used below by the news "why" lines too).
  const ownKeys = options.ownKeys ?? new OwnKeysService(db, { encryptionKey: config.encryptionKey });
  // News on topics the person follows. Only the topic keywords go to the news services, and
  // the server makes the call. Topic suggestions are read from their own entries here.
  const people = new PeopleStore(db);
  const news =
    options.news ??
    new NewsService({
      db,
      why: newsWhyFor(process.env, (owner) => ownKeys.secret(owner, "anthropic")),
      names: async (owner) => (await people.list(owner)).map((p) => p.name),
      texts: async (owner) => {
        const memories = (await db.list<{ text?: string }>(owner, "memories")).map((m) => m.text ?? "");
        const entries = debo.status().configured
          ? (await debo.listEntries(owner, { limit: 50 }).catch(() => [])).map((e) => e.text)
          : [];
        return [...entries, ...memories];
      },
    });
  agent.news = news;
  // Phone calls to and from the person's own number (docs/PHONE.md). Off without the SIP trunks.
  const phone = new PhoneService(db, {
    config: () => readPhoneConfig(options.voiceEnv?.() ?? process.env),
    tokenKey: auth.purposeKey("phone-call-token"),
    dialer: options.phoneDialer ?? livekitDialer,
    ended: (owner) => debo.callEnded(owner),
  });
  // Reminders, birthdays, the morning check-in and briefing: in-app updates, and a push where it is on.
  const push = options.push ?? new PushService(db, pushKeysFromEnv());
  agent.companion = new CompanionJobs({
    db,
    debo,
    push,
    // A reminder also rings the person's phone when they turned reminder calls on.
    call: (owner, title) => phone.reminderCall(owner, title),
    notify: (owner, title, body, key) => agent.notify(owner, title, body, undefined, key),
    briefing: (owner, now) => buildBriefing({ db, news, calendar: calendarFrom(workspace) }, owner, { now }),
  });
  // Promises in a saved entry become suggestions; deleting the entry takes them away.
  const promises = new PromiseFinder(db, debo);
  agent.promises = promises;
  debo.onEntryChange = (owner, change) => promises.onEntryChange(owner, change);
  // A person's own AI keys, and the pictures Daksha makes (kept in the recordings bucket).
  agent.ownKeys = ownKeys;
  debo.ownAnthropicKey = (owner) => ownKeys.secret(owner, "anthropic");
  const images =
    options.images ??
    new ImageService(db, { store: () => debo.mediaStore, maker: imageMakerFromEnv(process.env), ownKeys });
  agent.images = images;
  // Custom people: from a description or the person's own files, which are read once and deleted.
  // Their model calls use the person's own Anthropic key when set, otherwise Daksha's.
  // Custom people and their voice notes and calls (voice-clone/) point at each other: deleting a
  // person first deletes their recordings and voice copy, the lines kept from a recording go to
  // the person's profile, and one upkeep sweep clears every raw file under persona-uploads/.
  const linked: { voiceCopy?: VoiceCopyService } = {};
  const customPeople =
    options.customPeople ??
    new CustomPeopleService({
      db,
      store: () => debo.mediaStore,
      model: personModelFor(process.env, (owner) => ownKeys.secret(owner, "anthropic")),
      transcriber: () => debo.mediaTools?.transcriber,
      audio: () => debo.mediaTools?.audio,
      later: (work) => void work.catch((error) => backgroundFailure("custom person", error)),
      beforeRemove: async (owner, person) => linked.voiceCopy?.deleteForPerson(owner, person.id),
      sweepAlso: async () => (await linked.voiceCopy?.sweep()) ?? 0,
    });
  agent.customPeople = customPeople;
  // Voice notes and call recordings of a custom person, kept in the same private bucket for a short time.
  const voiceCopy =
    options.voiceCopy ??
    new VoiceCopyService({
      db,
      store: () => debo.mediaStore,
      audio: ffmpegTools(),
      diarizer: diarizerFromEnv(process.env),
      glue: customPeopleGlue(customPeople),
      ownCartesiaKey: (owner) => ownKeys.secret(owner, "cartesia"),
      deboCartesiaKey: deboCartesiaKey(process.env),
      later: (work) => void work.catch((error) => backgroundFailure("voice recording", error)),
    });
  linked.voiceCopy = voiceCopy;
  const threads = new ThreadStore(db);
  // Schedules, signed webhooks and app events that start a background run (triggers/store.ts).
  const appEvents = options.appEvents === null ? undefined : (options.appEvents ?? composioEventsFromEnv(process.env));
  const triggers = new TriggerService({
    db,
    createTask: (owner, input, key) => agent.createTask(owner, input, key),
    hookKey: auth.purposeKey("trigger-webhook"),
    publicUrl: config.publicUrl,
    ...(appEvents ? { apps: appEvents } : {}),
  });
  agent.triggers = triggers;
  // Lines worth remembering and skill drafts, saved only when the person says yes (decision 38).
  const proposals = new ProposalService(db, threads);
  agent.proposals = proposals;
  const timeZones = new TimeZoneStore(db);
  const runner = new DatabaseAgentRunner(threads);
  // Text Daksha by SMS, WhatsApp or Telegram once linked. Each is off without its keys.
  const channelsConfig = () => readChannelsConfig(options.channelsEnv?.() ?? process.env, config.publicUrl);
  const channels = new ChannelService({
    db,
    config: channelsConfig,
    brain: options.channelBrain ?? new EngineChannelBrain(config, agent, runner, threads),
    ...(options.channelFetch ? { fetcher: options.channelFetch } : {}),
  });
  agent.channels = channels;
  const runtime = makeRuntime(config, agent, auth, runner);
  const app = new Hono<{ Variables: { owner: string } }>();
  const origins = new Set([
    ...config.allowedOrigins,
    new URL(config.publicUrl).origin,
    ...(config.publicUrlAliases ?? []),
  ]);
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin)) return c.json({ error: "Origin is not allowed" }, 403);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (origins.has(origin) ? origin : undefined),
      allowHeaders: ["Content-Type", "Authorization", TIME_ZONE_HEADER],
      exposeHeaders: ["ETag", "set-auth-jwt", "set-auth-token"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );
  // Recordings in binding mode go up and come down through here, streamed. The link's signed token
  // is the sign-in, and it fixes the exact size, so this sits before the 12 MB limit and the per-address
  // limit below (a recording goes up in several parts and is played with many range requests).
  if (debo.blobRoutes) app.route("/api/media-blob", debo.blobRoutes);
  app.use(
    "*",
    bodyLimit({
      maxSize: 12 * 1024 * 1024,
      onError: (c) => c.json({ error: "Request is too large; PDFs must be 10 MB or smaller" }, 413),
    }),
  );
  app.use("/api/*", rateLimit(Boolean(config.trustProxy)));
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json({ error: error.issues.map((i) => i.message).join("; ") }, 422);
    if (error instanceof AppError) return c.json({ error: error.message }, error.status);
    if (error.name === "PdfError" || error.name === "RecurringEventError")
      return c.json({ error: error.message }, 422);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid request data" }, 400);
    // Provider and document errors are useful, but raw stack traces and token-bearing responses are not.
    console.error(`[Daksha] ${error.name}`);
    return c.json(
      {
        error:
          error.name === "PdfError" || error.name === "GoogleApiError"
            ? error.message
            : "Request failed. Check the server setup and try again.",
      },
      502,
    );
  });
  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      mode: config.mode,
      // The app reads this to choose between the access-key and email sign-in screens.
      // Sign-in goes through this server (see neon-auth-proxy.ts), so its cookie is not third-party.
      // It goes through the address the app called, so my.daksha.life signs in at api.daksha.life.
      auth: {
        mode: config.authMode ?? "access-key",
        neonAuthUrl: config.neonAuthBaseUrl
          ? `${publicUrlFor(config, c.req.url)}/api/neon-auth`
          : undefined,
      },
      agentConfigured: agentConfigured(config),
      browserConfigured: Boolean(config.workerUrl && config.workerToken),
    }),
  );
  if (config.neonAuthBaseUrl)
    app.route("/api/neon-auth", neonAuthProxy(
        config.neonAuthBaseUrl,
        options.neonAuthFetch,
        [...origins].find((origin) => origin.startsWith("https://")),
      ));
  let loginWindow = 0,
    loginAttempts = 0;
  app.post("/api/session", async (c) => {
    if (Date.now() - loginWindow > 60000) {
      loginWindow = Date.now();
      loginAttempts = 0;
    }
    if (++loginAttempts > 30)
      throw new AppError("Too many sign-in attempts. Try again in a minute.", 429);
    const body = z.object({ accessKey: z.string().optional() }).parse(await c.req.json());
    const session = await auth.session(body.accessKey);
    await workspace.ensureSample("local-user", actions);
    await agent.ensure("local-user");
    if (config.mode === "sample") await agent.refreshIdeas("local-user");
    return c.json(session);
  });
  app.get("/api/google/callback", async (c) => {
    if (c.req.query("error"))
      return c.html("<h1>Google connection cancelled</h1><p>You can return to Daksha.</p>", 400);
    const state = c.req.query("state"),
      code = c.req.query("code");
    if (!state || !code) throw new AppError("Google callback is incomplete");
    await google.callback(state, code);
    return c.html(
      "<h1>Google is connected</h1><p>Return to Daksha and refresh your workspace.</p>",
    );
  });
  // Where the connector provider sends people after they sign in to an app. Public, fixed words.
  app.route(
    "/api/connectors/callback",
    connectorCallbackRoute({
      appUrl: [...origins].find((origin) => origin.startsWith("https://")) ?? [...origins][0],
      sampleComplete: made.backend?.complete?.bind(made.backend),
    }),
  );
  // Where a tool server's sign-in page sends people back. Public; it trusts only the signed state.
  app.route(
    "/api/mcp/oauth/callback",
    mcpOAuthCallbackRoute(
      mcp,
      [...origins].find((origin) => origin.startsWith("https://")) ?? [...origins][0],
    ),
  );
  // The voice agent has no owner session; it proves itself with VOICE_AGENT_SECRET.
  // Voice runs through the same agent, tools and saved conversations as chat, so
  // she can do everything chat can. Journal answers still carry source chips.
  const voiceBrain = options.voiceBrain ?? new EngineVoiceBrain(config, agent, runner, threads);
  app.route(
    "/api/voice",
    voiceAgentRoutes(voiceBrain, options.voiceEnv, {
      turn: (owner, sessionId, who, text) => debo.recordCallTurn(owner, sessionId, who, text),
      sweep: (owner) => debo.sweepCalls(owner),
    }, (owner) => voiceCopy.callVoice(owner)),
  );
  // Phone calls: the voice agent checks the caller's code or PIN here. A caller has no session.
  app.route("/api/voice/phone", phoneAgentRoutes(phone, options.voiceEnv));
  // Signed webhooks that start triggers: before sign-in, each checks its own signature.
  app.route("/api/hooks", triggerHookRoutes(triggers));
  app.route("/api/channels", channelHookRoutes(channels, channelsConfig));
  // Deleting a call also deletes its copy in Chat (same words, same person).
  debo.onCallDeleted = (owner, callId) => threads.remove(owner, `voice-${callId}`);
  // Sample mode only: the in-memory stand-in for the recordings bucket. Its links carry their own one-time token.
  if (debo.devStore) app.route("/api/dev-r2", debo.devStore);
  app.use("/api/*", async (c, next) => {
    // A signed URL grants only the requests its page makes: reads, and the console's input.
    const method = c.req.method === "HEAD" ? "GET" : c.req.method;
    const signedRoute =
      (method === "GET" &&
        /^\/api\/files\/[^/]+\/content$|^\/api\/browsers\/[^/]+\/(?:preview|console)$/.test(
          c.req.path,
        )) ||
      (method === "POST" && /^\/api\/browsers\/[^/]+\/console$/.test(c.req.path));
    const owner =
      signedRoute && c.req.query("signature")
        ? auth.verify(new URL(c.req.url))
        : await auth.owner(c.req.header("authorization"));
    c.set("owner", owner);
    // The person's time zone from the app: used for this request, and kept for background work.
    const zone = readTimeZone(c.req.header(TIME_ZONE_HEADER));
    if (zone)
      await timeZones.remember(owner, zone).catch((error) => backgroundFailure("save time zone", error));
    await requestTimeZone.run(zone, () => next());
  });
  app.delete("/api/session", async (c) => {
    await auth.revoke(c.req.header("authorization"));
    return c.json({ ok: true });
  });
  app.get("/api/workspace", async (c) => {
    const [snapshot, reachable] = await Promise.all([
      workspace.snapshot(c.get("owner"), c.req.query("q")),
      browser.reachable(),
    ]);
    snapshot.browsers = snapshot.browsers.map((s) => browser.decorate(c.get("owner"), s));
    // A configured worker that does not answer is offline, not ready.
    snapshot.connections = snapshot.connections.map((connection) =>
      connection.id === "browser" && connection.status === "connected" && !reachable
        ? { ...connection, status: "unavailable" }
        : connection,
    );
    return c.json(snapshot);
  });
  app.route("/api/voice", voiceTokenRoutes(
      options.voiceEnv,
      (owner) => debo.callEnded(owner),
      // The voice and speed this person chose, sent to the agent inside the signed token.
      // A custom person Daksha is talking as can have their own voice.
      async (owner) => {
        const who = await voiceCharacterOf(db, owner);
        const chosen = voiceFor(await talkSettings.get(owner).catch(() => null), who.character, who.pronoun);
        const custom = (await activeCustomVoice(db, owner).catch(() => undefined))?.voice;
        return custom ? { ...chosen, voice: custom } : chosen;
      },
    ));
  app.route("/api/phone", phoneRoutes(phone));
  app.route("/api/triggers", triggerRoutes(triggers));
  app.route("/api/linked-apps", channelRoutes(channels));
  app.route("/api/proposals", proposalRoutes(proposals));
  app.route("/api/persona", personaRoutes(new PersonaStore(db)));
  // /api/custom-people: the people themselves (custom-people/routes.ts) and, on the same prefix,
  // their voice notes, calls and voice copy (voice-clone/routes.ts, only /:id/audio* and
  // /:id/voice). The two sets of paths never overlap.
  app.route("/api/custom-people", customPeopleRoutes(customPeople));
  app.route("/api/custom-people", voiceCopyRoutes(voiceCopy));
  app.route("/api/onboarding", onboardingRoutes(new OnboardingStore(db)));
  app.route("/api/people", peopleRoutes(new PeopleStore(db)));
  app.route("/api/checkin", checkinRoutes({ db, debo }));
  app.route("/api/companion", companionRoutes(db));
  app.route("/api/news", newsRoutes(news));
  app.route("/api/push", pushRoutes(push));
  const talkSettings = new TalkSettingsStore(db);
  const characterOf = async (owner: string) =>
    (await db.get<{ character?: string }>(owner, "agent-settings", "identity").catch(() => null))?.character;
  app.route(
    "/api/talk-settings",
    talkSettingsRoutes(talkSettings, characterOf, async (owner) => (await voiceCharacterOf(db, owner)).pronoun),
  );
  app.route("/api/custom-avatars", customAvatarRoutes(new CustomAvatarStore(db)));
  app.route("/api/account", accountRoutes(db, files, debo, connectors, mcp, ownKeys, images, customPeople, voiceCopy));
  app.route("/api/connectors", connectorRoutes(connectors));
  app.route("/api/mcp", mcpRoutes(mcp));
  app.route("/api/own-keys", ownKeyRoutes(ownKeys));
  app.route("/api/images", imageRoutes(images));
  app.route("/api/agent", agentRoutes(agent));
  app.route("/api/debo", deboRoutes(debo));
  app.route("/api/computer", computerRoutes(computer, files));
  app.get("/api/calendars", async (c) => c.json(await workspace.calendars(c.get("owner"))));
  app.get("/api/calendar/events", async (c) => {
    const query = z
      .object({
        calendarId: z.string().min(1).max(1024).optional(),
        timeMin: z.iso.datetime({ offset: true }).optional(),
        timeMax: z.iso.datetime({ offset: true }).optional(),
      })
      .parse(c.req.query());
    if (query.timeMin && query.timeMax) calendarRangeSchema.parse(query);
    return c.json(await workspace.events(c.get("owner"), query));
  });
  app.get("/api/mail/threads/:id", async (c) =>
    c.json(await workspace.thread(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/actions", async (c) => {
    const input = proposalSchema.parse(await c.req.json());
    if (input.kind === "email.send")
      for (const id of input.data.attachmentIds) await files.get(c.get("owner"), id);
    return c.json(await actions.propose(c.get("owner"), input), 201);
  });
  app.post("/api/actions/:id/decide", async (c) => {
    const body = z
      .object({ hash: z.string(), decision: z.enum(["approve", "deny"]) })
      .parse(await c.req.json());
    return c.json(
      await actions.decide(c.get("owner"), c.req.param("id"), body.hash, body.decision),
    );
  });
  app.get("/api/drafts", async (c) => c.json(await db.list(c.get("owner"), "drafts")));
  app.post("/api/drafts", async (c) => {
    const body = emailDraftSchema
      .extend({ id: z.string().uuid().optional() })
      .parse(await c.req.json());
    const existing = body.id
      ? await db.get<{ createdAt: string }>(c.get("owner"), "drafts", body.id)
      : null;
    if (body.id && !existing) throw new AppError("Draft not found", 404);
    return c.json(
      await db.put(c.get("owner"), "drafts", {
        ...body,
        id: body.id ?? randomUUID(),
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }),
      201,
    );
  });
  app.get("/api/main-thread", async (c) =>
    c.json({ threadId: await threads.mainThreadId(c.get("owner")), existing: true }),
  );
  app.get("/api/threads", async (c) => {
    const limit = Number(c.req.query("limit"));
    return c.json(
      await threads.list(c.get("owner"), {
        includeArchived: c.req.query("includeArchived") === "true",
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        cursor: c.req.query("cursor"),
      }),
    );
  });
  app.get("/api/threads/:id", async (c) => {
    const thread = await threads.get(c.get("owner"), assertThreadId(c.req.param("id")));
    if (!thread) throw new AppError("Conversation not found", 404);
    return c.json({ id: thread.id, name: thread.name, archived: thread.archived, updatedAt: thread.updatedAt });
  });
  app.patch("/api/threads/:id", async (c) => {
    const body = z.object({ name: z.string() }).parse(await c.req.json());
    return c.json(await threads.rename(c.get("owner"), assertThreadId(c.req.param("id")), body.name));
  });
  app.post("/api/threads/:id/archive", async (c) =>
    c.json(await threads.archive(c.get("owner"), assertThreadId(c.req.param("id")))),
  );
  app.post("/api/threads/:id/restore", async (c) =>
    c.json(await threads.restore(c.get("owner"), assertThreadId(c.req.param("id")))),
  );
  app.get("/api/threads/:id/messages", async (c) => {
    const history = await threads.history(c.get("owner"), assertThreadId(c.req.param("id")));
    return c.json({ messages: history.messages });
  });
  app.get("/api/conversation", async (c) =>
    c.json((await db.get(c.get("owner"), "conversations", "default")) ?? { messages: [] }),
  );
  app.put("/api/conversation", async (c) => {
    const body = await c.req.json();
    const messages = z.array(z.unknown()).max(1000).parse(body.messages);
    for (const message of messages) MessageSchema.parse(message);
    await db.put(c.get("owner"), "conversations", { id: "default", messages });
    return c.json({ ok: true });
  });
  app.post("/api/files", async (c) => {
    const data = await c.req.parseBody();
    const file = data.file;
    if (!(file instanceof File)) throw new AppError("Choose a PDF file");
    return c.json(
      await files.import(
        c.get("owner"),
        file.name,
        new Uint8Array(await file.arrayBuffer()),
        "Uploaded by you",
      ),
      201,
    );
  });
  app.get("/api/files/:id/content", async (c) => {
    const file = await files.get(c.get("owner"), c.req.param("id"));
    c.header("Content-Type", "application/pdf");
    c.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    return c.body(await files.bytes(c.get("owner"), file.id));
  });
  app.post("/api/files/:id/fill", async (c) => {
    const body = z
      .object({ fields: z.record(z.string(), z.union([z.string(), z.boolean()])) })
      .parse(await c.req.json());
    return c.json(await files.fill(c.get("owner"), c.req.param("id"), body.fields), 201);
  });
  app.post("/api/mail/import-attachment", async (c) => {
    const body = z.object({ reference: z.string() }).parse(await c.req.json());
    return c.json(await workspace.importAttachment(c.get("owner"), body.reference), 201);
  });
  app.post("/api/google/connect", async (c) => {
    const body = z.object({ capability: z.enum(["read", "write"]) }).parse(await c.req.json());
    if (config.mode === "sample") {
      await db.put(c.get("owner"), "settings", {
        id: "google",
        enabled: true,
        connectionId: randomUUID(),
      });
      return c.json({ url: null, connected: true });
    }
    return c.json(await google.connect(c.get("owner"), body.capability === "write"));
  });
  app.post("/api/google/disconnect", async (c) => {
    if (config.mode === "sample")
      await db.put(c.get("owner"), "settings", { id: "google", enabled: false });
    else await google.disconnect(c.get("owner"));
    return c.json({ ok: true });
  });
  app.post("/api/browsers", async (c) => {
    const body = z.object({ url: z.url().max(4096) }).parse(await c.req.json());
    return c.json(await browser.create(c.get("owner"), body.url), 201);
  });
  app.get("/api/browsers/:id", async (c) => {
    const owner = c.get("owner");
    return c.json(browser.decorate(owner, await browser.get(owner, c.req.param("id"))));
  });
  app.post("/api/browsers/:id/navigate", async (c) => {
    const body = z.object({ url: z.url().max(4096) }).parse(await c.req.json());
    return c.json(await browser.navigate(c.get("owner"), c.req.param("id"), body.url));
  });
  app.post("/api/browsers/:id/close", async (c) =>
    c.json(await browser.close(c.get("owner"), c.req.param("id"))),
  );
  app.get("/api/browsers/:id/read", async (c) =>
    c.json(await browser.read(c.get("owner"), c.req.param("id"))),
  );
  app.post("/api/browsers/:id/reopen", async (c) => {
    const raw = await c.req.text();
    const body = z.object({ url: z.url().max(4096).optional() }).parse(raw ? JSON.parse(raw) : {});
    return c.json(await browser.reopen(c.get("owner"), c.req.param("id"), body.url));
  });
  app.post("/api/browsers/:id/import-downloads", async (c) =>
    c.json(await browser.imports(c.get("owner"), c.req.param("id"))),
  );
  app.get("/api/browsers/:id/preview", async (c) => {
    const response = await browser.preview(c.get("owner"), c.req.param("id"));
    c.header("Content-Type", "image/png");
    return c.body(await response.arrayBuffer());
  });
  app.get("/api/browsers/:id/console", async (c) => {
    await browser.get(c.get("owner"), c.req.param("id"));
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' blob:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    );
    return c.html(browser.console(c.get("owner"), c.req.param("id")));
  });
  app.post("/api/browsers/:id/console", async (c) => {
    await browser.input(c.get("owner"), c.req.param("id"), await c.req.json());
    return c.json({ ok: true });
  });
  app.all("/api/copilotkit/*", async (c) => {
    if (!agentConfigured(config))
      throw new AppError(
        "Configure a model and provider API key, or a valid AG-UI endpoint, to start chat",
        503,
      );
    // The runner reads the owner from here, so each person only reaches their own threads.
    const response = await threadOwner.run(c.get("owner"), () => runtime.fetch(c.req.raw));
    // Runtime 1.70 emits SSE strings; a WHATWG Response body requires byte chunks.
    const encoder = new TextEncoder();
    const body = response.body?.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
        },
      }),
    );
    return new Response(body, { status: response.status, headers: response.headers });
  });
  app.get("/", (c) =>
    c.json({ name: "Daksha", app: "http://localhost:8081", health: "/api/health" }),
  );
  return { app, auth, files, actions, workspace, agent, computer, debo, connectors, mcp, voiceCopy };
}
