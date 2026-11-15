// Signing in to a tool server with OAuth, the way MCP asks for it: the server names its sign-in
// service, Debo registers itself there (dynamic client registration), sends the person to sign
// in with PKCE (S256), and gets back tokens it keeps encrypted. The SDK does the OAuth itself
// (`auth()` in @modelcontextprotocol/sdk); this file only stores what the SDK hands it and makes
// the `state` that ties the sign-in page back to one person and one server.
//
// Rules:
//   - Tokens, the client registration and the PKCE verifier live in ONE encrypted record per
//     server in `credentials` (id `mcp-oauth-<server id>`). That collection is never exported,
//     never returned to the app, never logged.
//   - The `state` is signed with a key only this server knows, lasts 10 minutes, and carries a
//     random nonce that must match the one saved for that server. The nonce is deleted before
//     the code is exchanged, so a state works once.
//   - Outside a sign-in (listing tools, calling one) the provider can refresh tokens but can
//     never start a new sign-in: it throws SignInNeeded instead.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "../../../../packages/integrations/src/vault.ts";
import type { Store } from "../db.ts";
import { AppError } from "../errors.ts";

export const STATE_TTL_MS = 10 * 60_000;
/** Tokens are refreshed this long before they run out. */
export const REFRESH_EARLY_MS = 60_000;
const SECRETS = "credentials";
export const oauthRecordId = (serverId: string) => `mcp-oauth-${serverId}`;

/**
 * The server's sign-in ran out or was taken back, and only the person can sign in again.
 * 409, not 401: a 401 from Debo means the person's Debo session ended.
 */
export class SignInNeeded extends AppError {
  constructor() {
    super("Your sign-in to this server ran out. Choose Sign in again on the Apps screen.", 409);
    this.name = "SignInNeeded";
  }
}

// ---- the signed state ---------------------------------------------------------------------

export interface SignInState {
  owner: string;
  server: string;
  nonce: string;
  to: "web" | "native";
}
const StateSchema = z.object({
  o: z.string().min(1).max(100),
  s: z.string().min(1).max(100),
  n: z.string().min(16).max(64),
  t: z.enum(["web", "native"]),
  e: z.number().int(),
});
const mac = (body: string, key: string) => createHmac("sha256", key).update(`mcp-oauth\n${body}`).digest();

export function signState(state: SignInState, key: string, now: number): string {
  const body = Buffer.from(
    JSON.stringify({ o: state.owner, s: state.server, n: state.nonce, t: state.to, e: now + STATE_TTL_MS }),
  ).toString("base64url");
  return `${body}.${mac(body, key).toString("base64url")}`;
}

/** The state's contents, or null when it is forged, changed, malformed or older than 10 minutes. */
export function verifyState(value: string, key: string, now: number): SignInState | null {
  if (value.length > 1000) return null;
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = mac(body, key);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let parsed: z.infer<typeof StateSchema>;
  try {
    parsed = StateSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    return null;
  }
  if (parsed.e < now) return null;
  return { owner: parsed.o, server: parsed.s, nonce: parsed.n, to: parsed.t };
}

// ---- what is stored -----------------------------------------------------------------------

export interface OAuthRecord {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  /** When the access token runs out, in ms since 1970. */
  expiresAt?: number;
  discovery?: OAuthDiscoveryState;
  /** A sign-in that was started and not finished yet. */
  pending?: { nonce: string; verifier?: string; expiresAt: number };
}

/** Reads and writes one server's encrypted record. */
export class OAuthVault {
  constructor(
    private readonly db: Store,
    private readonly key: string,
    readonly owner: string,
    readonly serverId: string,
  ) {}
  async load(): Promise<OAuthRecord> {
    const row = await this.db.get<{ secret: string }>(this.owner, SECRETS, oauthRecordId(this.serverId));
    if (!row) return {};
    try {
      return JSON.parse(decryptSecret(row.secret, this.key)) as OAuthRecord;
    } catch {
      // A record that can't be read is treated as no sign-in; the person signs in again.
      return {};
    }
  }
  async save(record: OAuthRecord) {
    await this.db.put(this.owner, SECRETS, {
      id: oauthRecordId(this.serverId),
      secret: encryptSecret(JSON.stringify(record), this.key),
    });
  }
  async remove() {
    await this.db.remove(this.owner, SECRETS, oauthRecordId(this.serverId));
  }
}

/**
 * What the SDK's `auth()` and transport ask for. `state` is set only while a person is signing
 * in; without it the provider may refresh tokens but never start a new sign-in.
 */
export class StoredOAuthProvider implements OAuthClientProvider {
  /** Where the SDK wanted to send the person. Read by the service after `auth()`. */
  authorizationUrl?: URL;
  private verifier?: string;

  constructor(
    private readonly vault: OAuthVault,
    private record: OAuthRecord,
    private readonly options: {
      redirectUrl: string;
      now: () => number;
      scope?: string;
      /** Set only while the person is signing in. */
      state?: string;
    },
  ) {}

  static async open(vault: OAuthVault, options: StoredOAuthProvider["options"]) {
    return new StoredOAuthProvider(vault, await vault.load(), options);
  }

  get data(): Readonly<OAuthRecord> {
    return this.record;
  }
  private async update(change: Partial<OAuthRecord>) {
    this.record = { ...this.record, ...change };
    await this.vault.save(this.record);
  }

  get redirectUrl() {
    return this.options.redirectUrl;
  }
  get clientMetadata(): OAuthClientMetadata {
    // A public client when the sign-in service allows it: then there is no client secret at all.
    const methods = this.record.discovery?.authorizationServerMetadata?.token_endpoint_auth_methods_supported;
    const method = !methods || methods.includes("none") ? "none" : methods.includes("client_secret_post") ? "client_secret_post" : "client_secret_basic";
    return {
      client_name: "Debo",
      redirect_uris: [this.options.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      ...(this.options.scope ? { scope: this.options.scope } : {}),
    };
  }

  state() {
    if (!this.options.state) throw new SignInNeeded();
    return this.options.state;
  }
  redirectToAuthorization(url: URL) {
    if (!this.options.state) throw new SignInNeeded();
    this.authorizationUrl = url;
  }

  clientInformation() {
    return this.record.client;
  }
  async saveClientInformation(client: OAuthClientInformationMixed) {
    await this.update({ client });
  }
  tokens() {
    return this.record.tokens;
  }
  async saveTokens(tokens: OAuthTokens) {
    // Some services send no new refresh token on a refresh: then the old one is still good.
    const refresh = tokens.refresh_token ?? this.record.tokens?.refresh_token;
    await this.update({
      tokens: { ...tokens, ...(refresh ? { refresh_token: refresh } : {}) },
      expiresAt: typeof tokens.expires_in === "number" ? this.options.now() + tokens.expires_in * 1000 : undefined,
    });
  }
  async saveCodeVerifier(verifier: string) {
    if (!this.record.pending) throw new SignInNeeded();
    await this.update({ pending: { ...this.record.pending, verifier } });
  }
  codeVerifier() {
    const verifier = this.verifier ?? this.record.pending?.verifier;
    if (!verifier) throw new SignInNeeded();
    return verifier;
  }
  discoveryState() {
    return this.record.discovery;
  }
  async saveDiscoveryState(discovery: OAuthDiscoveryState) {
    await this.update({ discovery });
  }
  async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all") return this.update({ client: undefined, tokens: undefined, expiresAt: undefined, discovery: undefined, pending: undefined });
    if (scope === "client") return this.update({ client: undefined });
    if (scope === "tokens") return this.update({ tokens: undefined, expiresAt: undefined });
    if (scope === "discovery") return this.update({ discovery: undefined });
    this.verifier = undefined;
    return this.update({ pending: undefined });
  }

  /** Starts a sign-in: old tokens go, a fresh nonce is saved. */
  async begin(nonce: string) {
    await this.update({ tokens: undefined, expiresAt: undefined, pending: { nonce, expiresAt: this.options.now() + STATE_TTL_MS } });
  }
  /**
   * Takes the waiting sign-in out of storage (so its state can't be used twice) and keeps the
   * verifier in memory for the code exchange. False when there is none, it ran out, or the nonce
   * is not the one saved.
   */
  async take(nonce: string): Promise<boolean> {
    const pending = this.record.pending;
    if (!pending) return false;
    const a = Buffer.from(pending.nonce);
    const b = Buffer.from(nonce);
    // An older link for this server: leave the newer sign-in alone.
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    await this.update({ pending: undefined });
    if (pending.expiresAt < this.options.now() || !pending.verifier) return false;
    this.verifier = pending.verifier;
    return true;
  }
  /** True when the access token runs out within a minute and there is a refresh token to use. */
  needsRefresh() {
    const at = this.record.expiresAt;
    return Boolean(this.record.tokens?.refresh_token && at && at - REFRESH_EARLY_MS < this.options.now());
  }
}
