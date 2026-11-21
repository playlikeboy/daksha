// "Add your own tool server (MCP)" on the Apps screen. A person can point Daksha at a tool
// server they run or trust. It is NOT one of Daksha's apps: a stranger may run it, and what Daksha
// sends it leaves Daksha. The words on this screen say so. Colours and sizes come from ui.tsx.
// A server can take a secret, or a sign-in (OAuth) on the server's own page. The Composio card
// is a shortcut for a person's OWN Composio account (not the apps Daksha connects for them).
import { KeyRound, LogIn, Plus, Server, ShieldAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { Text } from "./text";
import {
  addToolServer,
  COMPOSIO_CONNECT_URL,
  composioHeaderFor,
  freeName,
  hostOf,
  loadToolServers,
  refreshToolServer,
  removeToolServer,
  setToolServerReads,
  signOutToolServer,
  startToolServerSignIn,
  type ToolServer,
} from "./mcp-data";
import { suggestToolServers, type ToolServerSuggestion } from "./mcp-suggestions";
import { dropSignInWindow, openSignInPage, reserveSignInWindow } from "./open-connect-link";
import { Button, Card, CheckRow, Chip, colors, ErrorNotice, Field, relativeDate, s, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const accessText = { reads: "reads", changes: "changes something", destructive: "can delete" } as const;
/** Where the sign-in page sends people back to. The in-app sheet closes when it gets there. */
const RETURN_URL = "debo://tool-servers";
const returnTo = () => (Platform.OS === "web" ? ("web" as const) : ("native" as const));
const emptyForm = { name: "", url: "", secret: "", headerName: "", signIn: false };
const composioStart = {
  url: COMPOSIO_CONNECT_URL,
  secret: "",
  headerName: composioHeaderFor(COMPOSIO_CONNECT_URL),
};

export function ToolServersSection() {
  const { api, notify } = useWorkspace();
  const [servers, setServers] = useState<ToolServer[]>();
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [open, setOpen] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const [form, setForm] = useState(emptyForm);
  const [composioKey, setComposioKey] = useState<typeof composioStart>();
  // Most people never need this, so it starts folded away unless a server is already added.
  const [shown, setShown] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await loadToolServers(api);
      if (alive.current) {
        setServers(next);
        setError("");
      }
    } catch (e) {
      if (alive.current) setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Back from a sign-in page: check again when Daksha is in front.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  async function run(id: string, work: () => Promise<unknown>, done?: string) {
    setBusy(id);
    setError("");
    try {
      await work();
      if (done) notify(done);
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(undefined);
      await refresh();
    }
  }

  /** Opens the server's sign-in page. The tab is reserved first, before any waiting. */
  async function signIn(id: string, start: () => Promise<{ url?: string; name: string }>) {
    setError("");
    const reserved = reserveSignInWindow();
    setBusy(id);
    try {
      const { url, name } = await start();
      if (!url) throw new Error("I couldn't start the sign-in. Try again in a moment.");
      await refresh();
      await openSignInPage(url, reserved, RETURN_URL);
      notify(`Sign in to ${name} on the page that opened, then come back here.`);
      return true;
    } catch (e) {
      dropSignInWindow(reserved);
      setError(errorText(e));
      return false;
    } finally {
      if (alive.current) setBusy(undefined);
      await refresh();
    }
  }

  async function add() {
    if (form.signIn) {
      const ok = await signIn("add", async () => {
        const made = await addToolServer(api, { name: form.name, url: form.url, auth: "sign-in", to: returnTo() });
        return { url: made.signInUrl, name: made.name };
      });
      if (ok && alive.current) {
        setForm(emptyForm);
        setAdding(false);
      }
      return;
    }
    setBusy("add");
    setError("");
    try {
      const made = await addToolServer(api, {
        name: form.name,
        url: form.url,
        ...(form.secret ? { secret: form.secret } : {}),
        ...(form.secret && form.headerName ? { headerName: form.headerName } : {}),
      });
      setForm(emptyForm);
      setAdding(false);
      notify(`${made.name} is added. Daksha found ${made.tools.length} ${made.tools.length === 1 ? "tool" : "tools"}.`);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(undefined);
    }
  }

  async function addComposioKey() {
    if (!composioKey) return;
    setBusy("composio");
    setError("");
    try {
      const made = await addToolServer(api, {
        name: freeName("Composio", servers),
        url: composioKey.url,
        secret: composioKey.secret,
        headerName: composioKey.headerName,
        preset: "composio",
      });
      setComposioKey(undefined);
      notify(`Composio is added. Daksha found ${made.tools.length} ${made.tools.length === 1 ? "tool" : "tools"}.`);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(undefined);
    }
  }

  if (!shown && !servers?.length && !error)
    return (
      <View style={{ gap: spacing[2], alignItems: "flex-start" }}>
        <Text accessibilityRole="header" style={s.heading}>For developers</Text>
        <Text style={s.muted}>Add a tool server of your own. You don't need this to use Daksha.</Text>
        <Button small onPress={() => setShown(true)}>
          Show tool servers
        </Button>
      </View>
    );

  return (
    <View style={{ gap: spacing[3] }} accessibilityLabel="Your own tool servers">
      <Text accessibilityRole="header" style={s.heading}>Your own tool servers</Text>
      <Text style={s.muted}>
        If you run or trust a tool server (MCP), Daksha can use its tools in chat and by voice. Every
        tool waits for your yes, unless you allow a server to read without asking.
      </Text>
      <ErrorNotice error={error} />
      {!servers && !error && (
        <Skeleton label="Loading your tool servers" variant="apps" rows={1} />
      )}
      {servers?.map((server) => (
        <Card key={server.id} style={{ gap: spacing[3], padding: spacing[4] }}>
          <View style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
            <View style={[s.iconBox, { backgroundColor: colors.subtle }]}>
              <Server size={20} color={colors.blueDark} />
            </View>
            <View style={{ flex: 1, gap: spacing[1] }}>
              <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                <Text style={[s.text, { fontWeight: "600" }]}>{server.name}</Text>
                {server.auth === "sign-in" && !server.signedIn ? (
                  <Chip tint={colors.lavender}>Needs you to sign in</Chip>
                ) : (
                  <Chip tint={server.lastOk === false ? colors.lavender : colors.green}>
                    {server.lastOk === false ? "Not working" : "Working"}
                  </Chip>
                )}
              </View>
              <Text style={s.small}>
                {hostOf(server.url)} · {server.tools.length} {server.tools.length === 1 ? "tool" : "tools"}
                {server.hasSecret ? " · secret saved" : ""}
                {server.auth === "sign-in" ? (server.signedIn ? " · signed in" : " · not signed in") : ""}
              </Text>
              <Text style={s.small}>
                {server.lastAt
                  ? `${server.lastOk === false ? "Last try failed" : "Last worked"} ${relativeDate(server.lastAt)}. ${server.lastMessage ?? ""}`
                  : "Not tried yet."}
              </Text>
            </View>
          </View>
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button small onPress={() => setOpen(open === server.id ? undefined : server.id)}>
              {open === server.id ? "Hide its tools" : "See its tools"}
            </Button>
            <Button
              small
              busy={busy === server.id}
              onPress={() => void run(server.id, () => refreshToolServer(api, server.id), "Checked the server again.")}
            >
              Check it again
            </Button>
            <Button
              small
              primary={server.autoRead}
              disabled={busy === server.id}
              onPress={() =>
                void run(server.id, () => setToolServerReads(api, server.id, !server.autoRead))
              }
            >
              {server.autoRead ? "Reading without asking: on" : "Reading without asking: off"}
            </Button>
            {server.auth === "sign-in" && (
              <Button
                small
                primary={!server.signedIn}
                icon={LogIn}
                busy={busy === `sign-in:${server.id}`}
                disabled={busy === server.id}
                onPress={() =>
                  void signIn(`sign-in:${server.id}`, async () => ({
                    ...(await startToolServerSignIn(api, server.id, returnTo())),
                    name: server.name,
                  }))
                }
              >
                {server.signedIn ? "Sign in again" : "Sign in"}
              </Button>
            )}
            {server.auth === "sign-in" && server.signedIn && (
              <Button
                small
                disabled={busy === server.id}
                onPress={() =>
                  void run(
                    server.id,
                    () => signOutToolServer(api, server.id),
                    `Signed out of ${server.name}. Daksha deleted its sign-in.`,
                  )
                }
              >
                Sign out
              </Button>
            )}
          </View>
          {open === server.id && (
            <View style={{ gap: spacing[2] }}>
              {server.tools.length ? (
                server.tools.map((tool) => (
                  <View key={tool.name} style={{ gap: spacing[0.5] }}>
                    <Text style={[s.text, { fontWeight: "600" }]}>
                      {tool.name} <Text style={s.small}>({accessText[tool.access]})</Text>
                    </Text>
                    {!!tool.description && <Text style={s.small}>{tool.description}</Text>}
                  </View>
                ))
              ) : (
                <Text style={s.muted}>This server did not list any tools.</Text>
              )}
              <Text style={s.small}>
                What each tool says about itself comes from the server. Daksha treats it as a claim,
                not a promise.
              </Text>
            </View>
          )}
          {confirming === server.id ? (
            <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
              <Text style={s.text}>
                Remove {server.name}? Daksha stops using it and deletes the secret or sign-in it saved.
                You can add it again any time.
              </Text>
              <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
                <Button
                  danger
                  busy={busy === server.id}
                  onPress={() =>
                    void run(server.id, () => removeToolServer(api, server.id), `${server.name} is removed.`).then(() =>
                      setConfirming(undefined),
                    )
                  }
                >
                  {`Yes, remove ${server.name}`}
                </Button>
                <Button onPress={() => setConfirming(undefined)}>Keep it</Button>
              </View>
            </View>
          ) : (
            <View style={s.row}>
              <Button small danger onPress={() => setConfirming(server.id)}>
                {`Remove ${server.name}`}
              </Button>
            </View>
          )}
        </Card>
      ))}
      {servers && !servers.length && !adding && (
        <Text style={s.muted}>You have not added a tool server yet.</Text>
      )}
      {!adding && (
        <ComposioCard
          busy={busy}
          keyForm={composioKey}
          setKeyForm={setComposioKey}
          onSignIn={() =>
            void signIn("composio", async () => {
              const made = await addToolServer(api, {
                name: freeName("Composio", servers),
                url: COMPOSIO_CONNECT_URL,
                auth: "sign-in",
                preset: "composio",
                to: returnTo(),
              });
              return { url: made.signInUrl, name: made.name };
            })
          }
          onAddKey={() => void addComposioKey()}
        />
      )}
      {adding ? (
        <Card style={{ gap: spacing[3], padding: spacing[4] }}>
          <Text style={[s.text, { fontWeight: "600" }]}>Add your own tool server (MCP)</Text>
          <View style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
            <ShieldAlert size={18} color={colors.danger} />
            <Text style={[s.small, { flex: 1 }]}>
              Only add a server you trust. Daksha sends it what you ask it to do, such as the words
              of a note, and Daksha does not control what it does with them. Daksha never sends your
              journal or memories to it by itself. What it sends back is treated as plain data, and
              every change waits for your yes.
            </Text>
          </View>
          <SuggestedServers
            query={form.name}
            onPick={(pick) =>
              setForm({ ...emptyForm, name: pick.name, url: pick.url, signIn: pick.auth === "sign-in" })
            }
          />
          <Field
            label="Name"
            value={form.name}
            onChangeText={(name) => setForm({ ...form, name })}
            placeholder="For example: My notes"
            maxLength={40}
            autoCapitalize="none"
          />
          <Field
            label="Address (https only)"
            value={form.url}
            onChangeText={(url) => setForm({ ...form, url })}
            placeholder="https://tools.example.com/mcp"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {/* A real checkbox: screen readers hear on or off, and the words wrap on a phone. */}
          <CheckRow
            label="Sign in on the server's own page instead of typing a secret"
            checked={form.signIn}
            onPress={() => setForm({ ...form, signIn: !form.signIn, secret: "", headerName: "" })}
          />
          {form.signIn ? (
            <Text style={s.small}>
              Daksha opens the server’s own sign-in page. After you sign in, Daksha keeps the sign-in
              encrypted and never shows it. Sign out or Remove deletes it.
            </Text>
          ) : (
            <>
              <Field
                label="Secret (optional)"
                value={form.secret}
                onChangeText={(secret) => setForm({ ...form, secret })}
                placeholder="A token or key the server gave you"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label="Header name for the secret (optional)"
                value={form.headerName}
                onChangeText={(headerName) => setForm({ ...form, headerName })}
                placeholder="Leave empty to send it as a bearer token"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={s.small}>Daksha saves the secret encrypted and never shows it again.</Text>
            </>
          )}
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button
              primary
              busy={busy === "add"}
              disabled={!form.name.trim() || !form.url.trim()}
              onPress={() => void add()}
            >
              {form.signIn ? "Add and sign in" : "Add this tool server"}
            </Button>
            <Button
              disabled={busy === "add"}
              onPress={() => {
                setAdding(false);
                setError("");
              }}
            >
              Cancel
            </Button>
          </View>
        </Card>
      ) : (
        <Button icon={Plus} onPress={() => setAdding(true)}>
          Add your own tool server (MCP)
        </Button>
      )}
    </View>
  );
}

/**
 * A shortcut for a person who has their own Composio account: one tool server for every app they
 * connected there. Sign in on Composio's page, or paste a key.
 */
function ComposioCard(props: {
  busy?: string;
  keyForm?: typeof composioStart;
  setKeyForm: (form: typeof composioStart | undefined) => void;
  onSignIn: () => void;
  onAddKey: () => void;
}) {
  const { busy, keyForm, setKeyForm } = props;
  return (
    <Card style={{ gap: spacing[3], padding: spacing[4] }}>
      <Text style={[s.text, { fontWeight: "600" }]}>Composio: connect all your apps at once</Text>
      <Text style={s.small}>
        If you have your own Composio account, add it once and Daksha can use the apps you connected
        there. This uses your Composio account, not Daksha’s. Every change still waits for your yes.
      </Text>
      {keyForm ? (
        <View style={{ gap: spacing[3] }}>
          <Field
            label="Composio address"
            value={keyForm.url}
            onChangeText={(url) => setKeyForm({ ...keyForm, url, headerName: composioHeaderFor(url) })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Field
            label="Your Composio API key"
            value={keyForm.secret}
            onChangeText={(secret) => setKeyForm({ ...keyForm, secret })}
            placeholder="Paste the key from your Composio account"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="Header name for the key"
            value={keyForm.headerName}
            onChangeText={(headerName) => setKeyForm({ ...keyForm, headerName })}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={s.small}>
            For connect.composio.dev, use your own API key. For a project address from your Composio
            dashboard, use that project’s API key. Daksha saves the key encrypted and never shows it again.
          </Text>
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button
              primary
              busy={busy === "composio"}
              disabled={!keyForm.secret.trim() || !keyForm.url.trim()}
              onPress={props.onAddKey}
            >
              Add Composio
            </Button>
            <Button disabled={busy === "composio"} onPress={() => setKeyForm(undefined)}>
              Cancel
            </Button>
          </View>
        </View>
      ) : (
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          <Button primary icon={LogIn} busy={busy === "composio"} onPress={props.onSignIn}>
            Sign in with Composio
          </Button>
          <Button icon={KeyRound} disabled={busy === "composio"} onPress={() => setKeyForm(composioStart)}>
            Use an API key
          </Button>
        </View>
      )}
    </Card>
  );
}

/**
 * Known tool servers (from Hermes Agent's list) that fill in the form when picked. Typing in the
 * Name box narrows the list. Picking one only fills the form; the warning above still applies.
 */
function SuggestedServers({ query, onPick }: { query: string; onPick: (pick: ToolServerSuggestion) => void }) {
  const picks = suggestToolServers(query, 8);
  if (!picks.length) return null;
  return (
    <View style={{ gap: spacing[2] }} accessibilityLabel="Suggested tool servers">
      <Text style={s.small}>Known servers. Pick one to fill in its address, or type your own below.</Text>
      <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
        {picks.map((pick) => (
          <Button
            key={pick.id}
            small
            accessibilityLabel={`${pick.name}: ${pick.about}${pick.auth === "sign-in" ? " Needs a sign-in." : ""}`}
            onPress={() => onPick(pick)}
          >
            {pick.name}
          </Button>
        ))}
      </View>
    </View>
  );
}
