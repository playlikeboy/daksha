// "Connect your apps" on the Apps screen, and the chat cards for connected-app tool calls.
// Debo reaches these apps through Composio. The person signs in on the app's own page, and
// Debo never sees the password. Colours and sizes come from ui.tsx tokens only.
import { Link2, Search, ShieldCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Platform, Text, View } from "react-native";
import {
  type AppConnection,
  type AppItem,
  appFromToolName,
  browseApps,
  type CataloguePage,
  connectionsBySlug,
  type ConnectorsOverview,
  disconnectApp,
  loadConnectors,
  readConnectorTool,
  startConnect,
} from "./connectors-data";
import { dropSignInWindow, openSignInPage, reserveSignInWindow } from "./open-connect-link";
import { Button, Card, Chip, colors, ErrorNotice, fontSize, s, Skeleton, spacing } from "./ui";
import { useWorkspace } from "./workspace";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const POLL_MS = 3000;
/** The last list of apps per signed-in session, so coming back to Apps shows it at once. */
const lastOverview = new WeakMap<object, ConnectorsOverview>();

export function ConnectAppsSection({ query }: { query: string }) {
  const { api, notify } = useWorkspace();
  const [overview, setOverview] = useState<ConnectorsOverview | undefined>(() => lastOverview.get(api));
  const [error, setError] = useState("");
  // The rest of the catalogue, a page at a time. `browsing` turns on when the person presses
  // "Show more apps" or types in the search box.
  const [browsing, setBrowsing] = useState(false);
  const [category, setCategory] = useState<string>();
  const [list, setList] = useState<{ key: string; page: CataloguePage; items: AppItem[] }>();
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState<string>();
  const [confirming, setConfirming] = useState<string>();
  const [watching, setWatching] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await loadConnectors(api);
      lastOverview.set(api, next);
      if (alive.current) {
        setOverview(next);
        setError("");
      }
      return next;
    } catch (e) {
      if (alive.current) setError(errorText(e));
      return undefined;
    }
  }, [api]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Come back to the app after signing in: check again when it is visible, and while a sign-in
  // is open, every few seconds, for up to five minutes.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    if (!watching) return;
    const started = Date.now();
    const timer = setInterval(() => {
      void refresh().then((next) => {
        const waiting = next?.connections.some((c) => c.state === "waiting");
        if (!waiting || Date.now() - started > 5 * 60_000) setWatching(false);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [watching, refresh]);

  // One search box for the whole screen. Words narrow the first list at once, and also look
  // through every app Debo can reach, a page at a time.
  const text = query.trim();
  const searching = text.length >= 2;
  const key = `${searching ? text : ""}|${category ?? ""}`;
  const active = (searching || browsing) && Boolean(overview?.configured);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) {
      setList(undefined);
      return;
    }
    setLoadingList(true);
    setListError("");
    const timer = setTimeout(
      () => {
        browseApps(api, { q: searching ? text : undefined, category })
          .then((page) => alive.current && setList({ key, page, items: page.items }))
          .catch((e) => alive.current && setListError(errorText(e)))
          .finally(() => alive.current && setLoadingList(false));
      },
      searching ? 350 : 0,
    );
    return () => clearTimeout(timer);
    // `key` already holds the search words and the category.
  }, [active, key, api, attempt]);
  async function showMore() {
    const current = list;
    if (!current || current.page.nextOffset === null) return;
    setLoadingList(true);
    setListError("");
    try {
      const page = await browseApps(api, {
        q: searching ? text : undefined,
        category,
        offset: current.page.nextOffset,
      });
      if (alive.current)
        setList((now) =>
          now && now.key === current.key
            ? {
                key: now.key,
                page: { ...page, categories: now.page.categories },
                items: [...now.items, ...page.items],
              }
            : now,
        );
    } catch (e) {
      if (alive.current) setListError(errorText(e));
    } finally {
      if (alive.current) setLoadingList(false);
    }
  }

  async function connect(item: { slug: string; name: string }) {
    setError("");
    const reserved = reserveSignInWindow();
    setBusy(item.slug);
    try {
      const link = await startConnect(api, item.slug, Platform.OS === "web" ? "web" : "native");
      setWatching(true);
      await refresh();
      await openSignInPage(link.url, reserved);
      notify(`Sign in to ${item.name} on the page that opened, then come back here.`);
      await refresh();
    } catch (e) {
      dropSignInWindow(reserved);
      setError(errorText(e));
      await refresh();
    } finally {
      if (alive.current) setBusy(undefined);
    }
  }
  async function disconnect(connection: AppConnection) {
    setBusy(connection.toolkit);
    setError("");
    try {
      await disconnectApp(api, connection.id);
      setConfirming(undefined);
      notify(`${connection.name} is disconnected.`);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (alive.current) setBusy(undefined);
    }
  }

  if (!overview && !error)
    return (
      <View style={{ gap: spacing[3] }}>
        <Text style={s.heading}>Connect your apps</Text>
        <Skeleton label="Loading your apps" variant="apps" rows={4} />
      </View>
    );
  if (overview && !overview.configured)
    return (
      <View style={{ gap: spacing[3] }}>
        <Text style={s.heading}>Connect your apps</Text>
        <Card style={{ backgroundColor: colors.subtle, gap: spacing[2] }}>
          <Text style={s.text}>{overview.message ?? "Connecting apps is not set up yet."}</Text>
          <Text style={s.small}>Whoever runs this Debo needs to turn it on. Nothing else is affected.</Text>
        </Card>
      </View>
    );

  const connections = connectionsBySlug(overview?.connections ?? []);
  const words = text.toLowerCase();
  const curated = (overview?.curated ?? []).filter(
    (item) => !words || `${item.name} ${item.slug}`.toLowerCase().includes(words),
  );
  // Apps from the catalogue that the first list does not already show.
  const shown = new Set(curated.map((item) => item.slug));
  // While new search words load, the last results stay (faded), so the list does not jump.
  const stale = list && list.key !== key && loadingList ? list : undefined;
  const current = list && list.key === key ? list : undefined;
  const more = (current?.items ?? []).filter((item) => !shown.has(item.slug));
  // Connected apps that are in neither list still deserve a row, so they can be disconnected.
  const known = new Set([...shown, ...more.map((item) => item.slug)]);
  const extra = [...connections.values()].filter(
    (c) => !known.has(c.toolkit) && (!words || c.name.toLowerCase().includes(words)),
  );

  const row = (item: AppItem | { slug: string; name: string; blurb: string; connectable: boolean; logo?: string }) => (
    <AppRow
      key={item.slug}
      item={item}
      connection={connections.get(item.slug)}
      busy={busy === item.slug}
      confirming={confirming === connections.get(item.slug)?.id}
      onConnect={() => void connect(item)}
      onAskDisconnect={(id) => setConfirming(id)}
      onKeep={() => setConfirming(undefined)}
      onDisconnect={(c) => void disconnect(c)}
    />
  );

  return (
    <View style={{ gap: spacing[3] }} accessibilityLabel="Connect your apps">
      <Text style={s.heading}>Connect your apps</Text>
      <Text style={s.muted}>
        Debo can use these apps for you. You sign in on the app’s own page, so Debo never sees your
        password. Looking things up is free. Anything that sends, posts or changes something waits
        for your yes.
      </Text>
      <ErrorNotice error={error} />
      <View style={{ gap: spacing[2] }}>
        {extra.map((c) =>
          row({
            slug: c.toolkit,
            name: c.name,
            blurb: "Connected. Debo can look things up here.",
            connectable: true,
          }),
        )}
        {curated.map((item) => row(item))}
      </View>
      {!searching && !browsing && (
        <Button icon={Search} onPress={() => setBrowsing(true)}>
          Show more apps
        </Button>
      )}
      {active && (
        <View style={{ gap: spacing[2] }} accessibilityLabel="All apps">
          <View style={[s.row, { gap: spacing[2] }]}>
            <Search size={16} color={colors.muted} />
            <Text style={s.small}>
              {loadingList && !current
                ? searching
                  ? "Searching every app…"
                  : "Loading apps…"
                : current
                  ? `${current.page.total} ${current.page.total === 1 ? "app" : "apps"}${searching ? ` match “${text}”` : " you can look through"}${category ? ` in ${category}` : ""}`
                  : ""}
            </Text>
          </View>
          {!!current?.page.categories?.length && (
            <View
              style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}
              accessibilityLabel="Categories"
            >
              <Button small selected={!category} onPress={() => setCategory(undefined)}>
                All
              </Button>
              {current.page.categories.map((c) => (
                <Button
                  key={c.name}
                  small
                  selected={category?.toLowerCase() === c.name.toLowerCase()}
                  onPress={() => setCategory(c.name)}
                >
                  {c.name}
                </Button>
              ))}
            </View>
          )}
          {loadingList && !current && !stale && (
            <Skeleton label={searching ? "Searching every app" : "Loading apps"} variant="apps" rows={3} />
          )}
          {stale ? (
            <View style={{ gap: spacing[2], opacity: 0.5 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {stale.items.filter((item) => !shown.has(item.slug)).map((item) => row(item))}
            </View>
          ) : (
            more.map((item) => row(item))
          )}
          {current && !more.length && !loadingList && !listError && (
            <Text style={s.muted}>
              {searching
                ? `No app matches “${text}”${category ? ` in ${category}` : ""}. Try fewer letters or another word.`
                : "No other apps to show."}
            </Text>
          )}
          {loadingList && current && (
            <View style={[s.row, { gap: spacing[3] }]} accessibilityLabel="Loading more apps">
              <ActivityIndicator size="small" color={colors.blueDark} />
              <Text style={s.muted}>Loading more apps…</Text>
            </View>
          )}
          {!!listError && (
            <View style={{ gap: spacing[2] }}>
              <ErrorNotice error={listError} />
              <Button small onPress={() => (current ? void showMore() : setAttempt(attempt + 1))}>
                Try again
              </Button>
            </View>
          )}
          {current && current.page.nextOffset !== null && !loadingList && !listError && (
            <Button onPress={() => void showMore()}>Show more apps</Button>
          )}
          {current && current.page.nextOffset === null && more.length > 0 && (
            <Text style={s.small}>That is every app that matches.</Text>
          )}
        </View>
      )}
    </View>
  );
}

/** The app's logo from the provider, or its first letter when there is none or it will not load. */
function AppLogo({ name, logo }: { name: string; logo?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[s.iconBox, { backgroundColor: colors.subtle }]}
    >
      {logo && !failed ? (
        <Image
          source={{ uri: logo }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          style={{ width: spacing[7], height: spacing[7] }}
          accessible={false}
        />
      ) : (
        <Text style={[s.heading, { color: colors.blueDark }]}>{name.slice(0, 1)}</Text>
      )}
    </View>
  );
}

function AppRow({
  item,
  connection,
  busy,
  confirming,
  onConnect,
  onAskDisconnect,
  onKeep,
  onDisconnect,
}: {
  item: { slug: string; name: string; blurb: string; connectable: boolean; logo?: string };
  connection?: AppConnection;
  busy: boolean;
  confirming: boolean;
  onConnect: () => void;
  onAskDisconnect: (id: string) => void;
  onKeep: () => void;
  onDisconnect: (connection: AppConnection) => void;
}) {
  const state = connection?.state;
  return (
    <Card style={{ gap: spacing[3], padding: spacing[4] }}>
      <View style={[s.row, { gap: spacing[3], alignItems: "flex-start" }]}>
        <AppLogo name={item.name} logo={item.logo} />
        <View style={{ flex: 1, gap: spacing[1] }}>
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Text style={[s.text, { fontWeight: "600" }]}>{item.name}</Text>
            {state === "connected" && <Chip tint={colors.green}>Connected</Chip>}
          </View>
          <Text style={s.small}>{item.blurb}</Text>
          {connection && state !== "connected" && (
            <Text
              style={[
                s.small,
                { color: state === "waiting" ? colors.muted : colors.danger, fontSize: fontSize.supporting },
              ]}
            >
              {connection.statusText}
            </Text>
          )}
          {!item.connectable && !connection && (
            <Text style={s.small}>
              Can’t be connected from Debo yet. This app needs its own sign-in set up first by
              whoever runs this Debo, so there is nothing to tap.
            </Text>
          )}
        </View>
      </View>
      {confirming && connection ? (
        <View accessibilityRole="alert" style={{ gap: spacing[2] }}>
          <Text style={s.text}>
            Disconnect {connection.name}? Debo will stop using it, and the sign-in held for Debo is
            deleted. You can connect it again any time.
          </Text>
          <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
            <Button danger busy={busy} onPress={() => onDisconnect(connection)}>
              {`Yes, disconnect ${connection.name}`}
            </Button>
            <Button disabled={busy} onPress={onKeep}>
              Keep it connected
            </Button>
          </View>
        </View>
      ) : (
        <View style={[s.row, { gap: spacing[2], flexWrap: "wrap" }]}>
          {state === "connected" && connection ? (
            <Button small danger disabled={busy} onPress={() => onAskDisconnect(connection.id)}>
              {`Disconnect ${item.name}`}
            </Button>
          ) : state === "waiting" && connection ? (
            <>
              <Button small primary icon={Link2} busy={busy} onPress={onConnect}>
                {`Open ${item.name} sign-in again`}
              </Button>
              <Button small disabled={busy} onPress={() => onDisconnect(connection)}>
                Cancel
              </Button>
            </>
          ) : item.connectable ? (
            <Button small primary icon={Link2} busy={busy} onPress={onConnect}>
              {state ? `Connect ${item.name} again` : `Connect ${item.name}`}
            </Button>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/**
 * The chat card for connected-app tools. It says which app was used, in plain words. A change
 * shows that it is waiting for the person's yes, with a button that opens the exact review.
 */
export function ConnectorToolCard({
  name,
  args,
  result,
  loading,
}: {
  name: "find_app_tools" | "use_app_tool";
  args: unknown;
  result: unknown;
  loading: boolean;
}) {
  const { workspace, open, refresh, notify } = useWorkspace();
  const view = loading ? undefined : readConnectorTool(name, result);
  const given = args as { tool?: unknown; server?: unknown } | undefined;
  const guess =
    (typeof given?.server === "string" ? given.server : appFromToolName(given?.tool)) ?? "your apps";
  const label = loading
    ? name === "find_app_tools"
      ? "Looking for the right tool…"
      : `Checking ${guess}…`
    : view?.kind === "found"
      ? `Looked for tools in ${view.apps.join(", ")}`
      : view?.kind === "read"
        ? `Looked in ${view.app}`
        : view?.kind === "review"
          ? `Asked to ${view.title.charAt(0).toLowerCase()}${view.title.slice(1)}: waiting for your yes`
          : view?.kind === "none"
            ? "No apps to use yet"
            : "Your apps";
  return (
    <Card
      style={{ padding: spacing[4], gap: spacing[3], backgroundColor: colors.subtle, maxWidth: 440, width: "100%" }}
    >
      <View style={[s.row, { gap: spacing[3] }]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.blueDark} />
        ) : view?.kind === "review" ? (
          <ShieldCheck size={18} color={colors.blueDark} />
        ) : (
          <Link2 size={18} color={colors.blueDark} />
        )}
        <Text style={[s.text, { flex: 1 }]}>{label}</Text>
      </View>
      {view?.kind === "error" && <ErrorNotice error={view.message} />}
      {view?.kind === "none" && <Text style={s.muted}>{view.message}</Text>}
      {view?.kind === "unreadable" && (
        <ErrorNotice error="I couldn't read that result. Ask again in a moment." />
      )}
      {view?.kind === "review" && (
        <>
          <Text style={s.muted}>Nothing has happened in {view.app} yet.</Text>
          <Button
            small
            primary
            onPress={() => {
              const action = workspace.actions.find((a) => a.id === view.actionId);
              if (action) return open({ type: "review", action });
              void refresh().then(() =>
                notify("It is ready. Open the bell at the top to review it."),
              );
            }}
          >
            {`Review before it goes to ${view.app}`}
          </Button>
        </>
      )}
    </Card>
  );
}

