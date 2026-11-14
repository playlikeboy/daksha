// "Add your own tool server (MCP)" on the Apps screen. A person can point Debo at a tool
// server they run or trust. It is NOT one of Debo's apps: a stranger may run it, and what Debo
// sends it leaves Debo. The words on this screen say so. Colours and sizes come from ui.tsx.
import { Plus, Server, ShieldAlert } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  addToolServer,
  hostOf,
  loadToolServers,
  refreshToolServer,
  removeToolServer,
  setToolServerReads,
  type ToolServer,
} from "./mcp-data";
import { Button, Card, Chip, colors, ErrorNotice, Field, relativeDate, s, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const accessText = { reads: "reads", changes: "changes something", destructive: "can delete" } as const;

export function ToolServersSection() {
  const { api, notify } = useWorkspace();
  const [servers, setServers] = useState<ToolServer[]>();
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [open, setOpen] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const [form, setForm] = useState({ name: "", url: "", secret: "", headerName: "" });
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

  async function add() {
    setBusy("add");
    setError("");
    try {
      const made = await addToolServer(api, {
        name: form.name,
        url: form.url,
        ...(form.secret ? { secret: form.secret } : {}),
        ...(form.secret && form.headerName ? { headerName: form.headerName } : {}),
      });
      setForm({ name: "", url: "", secret: "", headerName: "" });
      setAdding(false);
      notify(`${made.name} is added. Debo found ${made.tools.length} ${made.tools.length === 1 ? "tool" : "tools"}.`);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(undefined);
    }
  }

  return (
    <View style={{ gap: spacing[3] }} accessibilityLabel="Your own tool servers">
      <Text style={s.heading}>Your own tool servers</Text>
      <Text style={s.muted}>
        If you run or trust a tool server (MCP), Debo can use its tools in chat and by voice. Every
        tool waits for your yes, unless you allow a server to read without asking.
      </Text>
      <ErrorNotice error={error} />
      {!servers && !error && (
        <View style={[s.row, { gap: spacing[3] }]} accessibilityLabel="Loading your tool servers">
          <ActivityIndicator size="small" color={colors.blueDark} />
          <Text style={s.muted}>Loading tool servers…</Text>
        </View>
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
                <Chip tint={server.lastOk === false ? colors.lavender : colors.green}>
                  {server.lastOk === false ? "Not working" : "Working"}
                </Chip>
              </View>
              <Text style={s.small}>
                {hostOf(server.url)} · {server.tools.length} {server.tools.length === 1 ? "tool" : "tools"}
                {server.hasSecret ? " · secret saved" : ""}
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
                What each tool says about itself comes from the server. Debo treats it as a claim,
                not a promise.
              </Text>
            </View>
          )}
          {confirming === server.id ? (
            <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
              <Text style={s.text}>
                Remove {server.name}? Debo stops using it and deletes the secret it saved. You can add
                it again any time.
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
      {adding ? (
        <Card style={{ gap: spacing[3], padding: spacing[4] }}>
          <Text style={[s.text, { fontWeight: "600" }]}>Add your own tool server (MCP)</Text>
          <View style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
            <ShieldAlert size={18} color={colors.danger} />
            <Text style={[s.small, { flex: 1 }]}>
              Only add a server you trust. Debo sends it what you ask it to do, such as the words
              of a note, and Debo does not control what it does with them. Debo never sends your
              journal or memories to it by itself. What it sends back is treated as plain data, and
              every change waits for your yes.
            </Text>
          </View>
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
          <Text style={s.small}>
            Debo saves the secret encrypted and never shows it again. Servers that need you to sign in
            with OAuth can’t be added yet.
          </Text>
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button
              primary
              busy={busy === "add"}
              disabled={!form.name.trim() || !form.url.trim()}
              onPress={() => void add()}
            >
              Add this tool server
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
