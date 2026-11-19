import { CopilotKitProvider } from "@copilotkit/react-native/headless";
import { StatusBar } from "expo-status-bar";
import {
  BookOpen,
  Brain,
  Check,
  type LucideIcon,
  MessageCircle,
  PanelsTopLeft,
  Shapes,
  X,
} from "lucide-react-native";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Section, Workspace } from "../../packages/domain/src";
import {
  AgentActivityScreen,
  AgentStatus,
  AppsScreen,
  GoalsScreen,
  IdeasScreen,
} from "./src/agent-ui";
import { AgentWorkspaceProvider, useAgentWorkspace } from "./src/agent-workspace";
import { API_URL, createSession, FuseApi } from "./src/api";
import { ChatScreen, WorkspaceTools } from "./src/chat";
import { onCopilotError } from "./src/conversation-run";
import { timeZoneHeaders } from "./src/time-zone";
import { deboCharacter } from "./src/debo-character-store";
import { getAvatar } from "./src/debo-custom-avatars";
import { DeboFaceGallery } from "./src/debo-face-gallery";
import { useTaskMood } from "./src/debo-mood-hooks";
import { deboMood } from "./src/debo-mood-store";
import { PeopleSetting } from "./src/debo-people-setting";
import { PersonaSetting } from "./src/debo-persona-setting";
import { ReactionsSetting } from "./src/debo-reactions-setting";
import { ChatTitle } from "./src/chat-title";
import { TalkPopup } from "./src/debo-talk";
import { requestTalkAutoStart } from "./src/debo-talk-consent";
import { TalkPill } from "./src/debo-talk-pill";
import { reviewsWaiting } from "./src/debo-talk-call";
import { stateWords, TalkSessionProvider, useTalkState } from "./src/debo-talk-session";
import { ChromeContext, topBarHeight } from "./src/chrome";
import { TopBar } from "./src/top-bar";
import { Onboarding } from "./src/onboarding";
import { onboarding, type OnboardingReply, useOnboardingOpen } from "./src/onboarding-store";
import { ComputerDraftProvider } from "./src/computer-drafts";
import { JournalScreen } from "./src/debo-journal";
import { KnowsScreen } from "./src/debo-knows";
import { Details } from "./src/details";
import { BrowserScreen, CalendarScreen, FilesScreen, MailScreen } from "./src/screens";
import { AccountCard, NeonGate, useAuthInfo } from "./src/neon-gate";
import { ThreadsProvider, ThreadsSheet, useFuseThread } from "./src/threads";
import {
  avatarSize,
  bodyText,
  Button,
  Card,
  colors,
  ErrorNotice,
  Field,
  fontFamily,
  fontSize,
  Mascot,
  radius,
  s,
  screenGap,
  screenPadding,
  shadow,
  Skeleton,
  spacing,
} from "./src/ui";
import { entryFocus } from "./src/debo-data";
import { canonicalSection, parsePath, pathFor, pathFromUrl, type Route, type RouteParams, titleFor } from "./src/routes";
import { type Detail, useWorkspace, WorkspaceContext } from "./src/workspace";

/** `short` is the word under the icon; `label` is the full name read out by screen readers. */
const nav: { id: Section; label: string; short: string; icon: LucideIcon }[] = [
  { id: "chat", label: "Chat", short: "Chat", icon: MessageCircle },
  { id: "journal", label: "Journal", short: "Journal", icon: BookOpen },
  { id: "knows", label: "What Debo knows", short: "Memories", icon: Brain },
  { id: "activity", label: "Tasks", short: "Tasks", icon: PanelsTopLeft },
  { id: "apps", label: "Apps", short: "Apps", icon: Shapes },
];
const titles: Partial<Record<Section, { title: string; subtitle: string }>> = {
  talk: { title: "Talk to Debo", subtitle: "Say it out loud. Debo answers and shows where it came from." },
  activity: { title: "Tasks", subtitle: "Plans, progress, decisions and results." },
  ideas: { title: "Ideas", subtitle: "Useful next steps, grounded in your world." },
  goals: {
    title: "Goals",
    subtitle: "Longer-term goals and things to keep an eye on.",
  },
  apps: {
    title: "Apps",
    subtitle: "Connections, capabilities and what your agent remembers.",
  },
  connections: { title: "Apps", subtitle: "Connections and capabilities." },
  mail: { title: "Mail", subtitle: "The conversations behind your work." },
  calendar: { title: "Calendar", subtitle: "Time for what matters." },
  browser: { title: "Browser", subtitle: "Your connected browsing sessions." },
  files: { title: "Files", subtitle: "Documents, forms and filled copies." },
  journal: { title: "Your journal", subtitle: "Write about your day. Only you can read it." },
  knows: { title: "What Debo knows", subtitle: "Memories, each with its source." },
};
/** Shown when the address matches no screen. */
function NotFound() {
  const { navigate } = useWorkspace();
  return (
    <View style={{ gap: spacing[4], alignItems: "flex-start" }}>
      <Text accessibilityRole="header" style={[s.title, { fontSize: fontSize["2xl"] }]}>
        That page isn't here
      </Text>
      <Text style={s.muted}>The link may be old or mistyped. Your chat is one tap away.</Text>
      <Button primary onPress={() => navigate("chat")}>
        Go to Chat
      </Button>
    </View>
  );
}
/**
 * Asks the API how people sign in. Neon Auth (one account per person) shows email
 * sign-in. A local or demo install keeps the shared access key screen.
 */
export default function App() {
  const info = useAuthInfo();
  if (!info)
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: "center" }}>
          <ActivityIndicator color={colors.blueDark} accessibilityLabel="Opening Debo" />
        </View>
      </SafeAreaProvider>
    );
  if (info.mode === "neon" && info.neonAuthUrl)
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <NeonGate baseUrl={info.neonAuthUrl}>
          {(token, sessionKey) => (
            <CopilotKitProvider
              runtimeUrl={`${API_URL}/api/copilotkit`}
              headers={{ Authorization: `Bearer ${token}`, ...timeZoneHeaders() }}
              onError={onCopilotError}
            >
              <WorkspaceApp token={token} sessionKey={sessionKey} />
            </CopilotKitProvider>
          )}
        </NeonGate>
      </SafeAreaProvider>
    );
  return <AccessKeyApp />;
}
function AccessKeyApp() {
  // A developer gallery of Debo's face, on a local sample install only: /?face=gallery
  const gallery = Platform.OS === "web" && globalThis.location?.search.includes("face=gallery");
  const [token, setToken] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const connect = useCallback(async (key?: string) => {
    setBusy(true);
    setError("");
    try {
      const session = await createSession(key);
      setToken(session.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (!gallery) void connect();
  }, [connect, gallery]);
  if (gallery)
    return (
      <SafeAreaProvider>
        <DeboFaceGallery />
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {token ? (
        <CopilotKitProvider
          runtimeUrl={`${API_URL}/api/copilotkit`}
          headers={{ Authorization: `Bearer ${token}`, ...timeZoneHeaders() }}
          onError={onCopilotError}
        >
          <WorkspaceApp token={token} />
        </CopilotKitProvider>
      ) : (
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: colors.canvas,
            justifyContent: "center",
            alignItems: "center",
            padding: spacing[6],
          }}
        >
          <View style={{ width: "100%", maxWidth: 420, gap: spacing[5], alignItems: "center" }}>
            <Mascot size={avatarSize.lg} />
            <Text
              style={{
                fontSize: fontSize["3xl"],
                color: colors.text,
                letterSpacing: -1,
                fontWeight: "500",
              }}
            >
              Welcome to Debo.
            </Text>
            <Text style={[s.muted, { textAlign: "center" }]}>A little room for your day.</Text>
            {busy ? (
              <ActivityIndicator color={colors.blueDark} />
            ) : (
              <Card style={{ width: "100%" }}>
                <ErrorNotice error={error} />
                <Field
                  label="Workspace access key"
                  value={accessKey}
                  onChangeText={setAccessKey}
                  secureTextEntry
                  placeholder="Required for a live workspace"
                />
                <Button primary onPress={() => void connect(accessKey || undefined)}>
                  Open workspace
                </Button>
                <Text style={[s.small, { marginTop: spacing[4] }]}>
                  Local workspaces open without a key. Make sure your Debo server is running at{" "}
                  {API_URL}.
                </Text>
              </Card>
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}
const onWeb = Platform.OS === "web";
/**
 * What to say when the workspace does not load. A plain sentence with a next step, and the
 * server's own words only when it sent a readable message (not "TypeError: Failed to fetch").
 */
function workspaceError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  const plain = /^[A-Z][^{}<>]*[.!?]$/.test(message) && !/^(TypeError|Error|Request failed)/.test(message);
  return plain
    ? message
    : "I couldn't open your workspace. Check your internet connection, then press Try again.";
}
/**
 * Where the person is. On the web the address bar is the truth: each move adds a
 * browser history entry, so back, forward and reload work. On the phone the route
 * lives in memory and debo:// links move it. null means "no screen at this address".
 */
function useRouter() {
  const [route, setRoute] = useState<Route | null>(() =>
    onWeb ? parsePath(window.location.pathname) : { section: "chat" },
  );
  useEffect(() => {
    if (onWeb) document.title = titleFor(route);
    if (onWeb && route && window.location.pathname !== pathFor(route.section, route))
      window.history.replaceState(null, "", pathFor(route.section, route));
  }, [route]);
  useEffect(() => {
    if (onWeb) {
      const listener = () => setRoute(parsePath(window.location.pathname));
      window.addEventListener("popstate", listener);
      return () => window.removeEventListener("popstate", listener);
    }
    const apply = (url: string | null) => {
      const next = url ? parsePath(pathFromUrl(url)) : null;
      if (next) setRoute(next);
    };
    void Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener("url", (event) => apply(event.url));
    return () => subscription.remove();
  }, []);
  const go = useCallback((section: Section, params?: RouteParams) => {
    const next: Route = { section: canonicalSection(section), ...params };
    const path = pathFor(next.section, params);
    if (onWeb && window.location.pathname !== path) window.history.pushState(null, "", path);
    setRoute(next);
  }, []);
  return { route, go };
}
function WorkspaceApp({ token, sessionKey }: { token: string; sessionKey?: string }) {
  const api = useMemo(() => new FuseApi(token), [token]);
  const [workspace, setWorkspace] = useState<Workspace>();
  const { route, go } = useRouter();
  const section: Section = route?.section ?? "chat";
  const [detail, setDetail] = useState<Detail>();
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState<{ id: number; text: string }>();
  const refresh = useCallback(async () => {
    const snapshot = await api.request<Workspace>("/api/workspace");
    setWorkspace(snapshot);
    setError("");
  }, [api]);
  useEffect(() => {
    void refresh().catch((e) => setError(workspaceError(e)));
  }, [refresh]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh().catch((e) => setError(workspaceError(e)));
    });
    return () => listener.remove();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = go;
  // /journal/<entry> opens that entry. Other addresses clear the choice.
  const wantedEntry = route?.section === "journal" ? route.entryId : undefined;
  useEffect(() => {
    if (wantedEntry || entryFocus.get()) entryFocus.set(wantedEntry);
  }, [wantedEntry]);
  const open = useCallback((next: Detail) => setDetail(next), []);
  const close = useCallback(() => setDetail(undefined), []);
  const ask = useCallback((text: string) => {
    setPrompt({ id: Date.now(), text });
    go("chat");
  }, [go]);
  if (!workspace)
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.canvas,
          alignItems: "center",
          justifyContent: "center",
          padding: spacing[6],
          gap: spacing[4],
        }}
      >
        <Mascot size={avatarSize.lg} />
        {error ? (
          <>
            <ErrorNotice error={error} onRetry={() => void refresh().catch((e) => setError(workspaceError(e)))} />
          </>
        ) : (
          // The face is already moving, so it is the loading sign; no spinner needed.
          <Text accessibilityRole="progressbar" accessibilityLiveRegion="polite" style={s.muted}>
            Opening your workspace…
          </Text>
        )}
      </SafeAreaView>
    );
  return (
    <WorkspaceContext.Provider
      value={{ workspace, api, section, route, navigate, refresh, open, close, notify: setToast, ask }}
    >
      <AgentWorkspaceProvider>
        <ComputerDraftProvider key={sessionKey ?? token}>
          {/* The live call sits above every screen, so moving between screens never drops it. */}
          <TalkSessionProvider>
            <ThreadsProvider>
              <WorkspaceShell
                detail={detail}
                notFound={route === null}
                toast={toast}
                clearToast={() => setToast("")}
                error={error}
                prompt={prompt}
              />
            </ThreadsProvider>
          </TalkSessionProvider>
        </ComputerDraftProvider>
      </AgentWorkspaceProvider>
    </WorkspaceContext.Provider>
  );
}
function WorkspaceShell({
  detail,
  notFound,
  toast,
  clearToast,
  error,
  prompt,
}: {
  detail?: Detail;
  notFound: boolean;
  toast: string;
  clearToast: () => void;
  error: string;
  prompt?: { id: number; text: string };
}) {
  const { workspace, api, section: current, navigate, open } = useWorkspace();
  const agentData = useAgentWorkspace();
  const { data } = agentData;
  const talkState = useTalkState();
  useTaskMood(data?.tasks);
  // Talk is a popup over the last screen, so the screen underneath is the last one that was not Talk.
  const lastScreen = useRef<Section>("chat");
  if (current !== "talk") lastScreen.current = current;
  /** The screen underneath; "none" while the address matches no screen. */
  const section: Section | "none" = notFound
    ? "none"
    : current === "talk"
      ? lastScreen.current
      : current;
  const {
    selection,
    visited,
    mainId,
    loading: threadsLoading,
    error: threadsError,
    retry: retryThreads,
    enabled: richThreads,
  } = useFuseThread();
  const [threadsOpen, setThreadsOpen] = useState(false);
  const welcomeOpen = useOnboardingOpen();
  // The welcome shows once per person. Whether it was seen is saved in their account, so a
  // second phone or browser does not show it again. An older server without the route: no welcome.
  useEffect(() => {
    let live = true;
    void api
      .request<OnboardingReply>("/api/onboarding")
      .then((reply) => {
        if (live && reply.onboarding === null) onboarding.open();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  // A minimised call: a small bar above the tabs, on every screen except the full-screen Talk popup.
  const talkBarShown = talkState.active && current !== "talk";
  const waitingReviews = reviewsWaiting(workspace.actions);
  const pending =
    (data?.notifications.filter((n) => !n.read).length || 0) +
    workspace.actions.filter((a) => a.status === "awaiting_review").length;
  const activeTask =
    data?.tasks.find(
      (task) => task.status === "waiting_approval" || task.status === "waiting_input",
    ) || data?.tasks.find((task) => task.status === "running");
  const agentName = data?.identity.name || "Debo";
  // Every face in the app follows the character saved in the account.
  const savedCharacter = data?.identity.character;
  useEffect(() => {
    if (!data) return;
    deboCharacter.set(savedCharacter);
    deboCharacter.setName(agentName);
  }, [data, savedCharacter, agentName]);
  // A face the person made: load its drawing once per face, not on every refresh.
  const savedFace = savedCharacter === "custom" ? data?.identity.customAvatar : undefined;
  useEffect(() => {
    if (!savedFace) return;
    let live = true;
    void getAvatar(api, savedFace)
      .then((face) => live && deboCharacter.setCustom(face))
      // The copy on this device keeps showing; the next start tries again.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, savedFace]);
  // The line under the name shows only when something is happening: the call, or a task.
  const callWords = talkState.active
    ? stateWords({ ...talkState, name: agentName })
    : undefined;
  const status = callWords
    ? callWords
    : activeTask
      ? activeTask.status === "waiting_approval"
        ? `Ready to review · ${activeTask.title}`
        : activeTask.status === "waiting_input"
          ? `Needs your input · ${activeTask.title}`
          : activeTask.plan.find((step) => step.status === "running")?.title || activeTask.title
      : data?.tasks.some((task) => task.status === "queued")
        ? "Picking up your next task…"
        : undefined;
  const insets = useSafeAreaInsets();
  const barHeight = desktop ? topBarHeight.desktop : topBarHeight.phone;
  // Something shows above the chat (agent offline, a side chat's title, loading or an error),
  // so the chat column starts below the bar instead of scrolling under it.
  const chatNotice =
    (!!agentData.data && !agentData.data.worker.running) ||
    !!agentData.error ||
    (richThreads && (threadsLoading || !!threadsError || selection.id !== mainId));
  const [composerHeight, setComposerHeight] = useState(0);
  const [tabHeight, setTabHeight] = useState(desktop ? 84 : 72);
  const chrome = useMemo(
    () => ({ top: chatNotice ? 0 : barHeight, setComposerHeight }),
    [chatNotice, barHeight],
  );
  // The floating call bubble sits above the tabs, and above the chat's composer on Chat.
  const bubbleBottom =
    insets.bottom + tabHeight + (section === "chat" ? composerHeight : 0) + spacing[3];
  const title = section === "none" ? undefined : titles[section] || titles.apps;
  const Screen =
    section === "none"
      ? NotFound
      : section === "mail"
      ? MailScreen
      : section === "calendar"
        ? CalendarScreen
        : section === "browser"
          ? BrowserScreen
          : section === "files"
            ? FilesScreen
            : section === "journal"
              ? JournalScreen
              : section === "knows"
                ? KnowsScreen
                : section === "activity"
              ? AgentActivityScreen
              : section === "ideas"
                ? IdeasScreen
                : section === "goals"
                  ? GoalsScreen
                  : AppsScreen;
  const utility = ["mail", "calendar", "browser", "files", "ideas", "goals"].includes(section);
  return (
    <>
      <WorkspaceTools />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }} edges={["top", "bottom"]}>
        <View style={{ flex: 1, width: "100%", maxWidth: 760, alignSelf: "center" }}>
          <View style={{ flex: 1, minHeight: 0 }}>
            <ChromeContext.Provider value={chrome}>
            {section !== "chat" && (
              <ScrollView
                key={section}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: desktop ? screenPadding.desktop : screenPadding.phone,
                  // The first line starts below the see-through bar; the rest scrolls under it.
                  paddingTop: barHeight + spacing[3],
                  // Room at the end so the floating call bubble never hides the last row.
                  paddingBottom: talkBarShown ? spacing[12] + spacing[12] : spacing[8],
                }}
                keyboardShouldPersistTaps="handled"
              >
                {utility && (
                  <Button
                    small
                    style={{ alignSelf: "flex-start", marginBottom: spacing[4] }}
                    onPress={() => navigate("apps")}
                  >
                    Back to Apps
                  </Button>
                )}
                {title && (
                  <Text
                    accessibilityRole="header"
                    style={[s.title, { fontSize: fontSize["2xl"], marginBottom: screenGap }]}
                  >
                    {title.title}
                  </Text>
                )}
                <ErrorNotice error={error} />
                <Screen />
                {section === "apps" && <AccountCard />}
                {section === "apps" && <ReactionsSetting />}
                {section === "apps" && <PersonaSetting />}
                {section === "apps" && <PeopleSetting />}
              </ScrollView>
            )}
            <View
              style={{
                display: section === "chat" ? "flex" : "none",
                flex: 1,
                paddingHorizontal: desktop ? screenPadding.desktop : screenPadding.phone,
                // When a notice sits above the chat, it starts below the bar. Otherwise the
                // chat itself scrolls under the bar (it reads `top` from ChromeContext).
                paddingTop: chatNotice ? barHeight : 0,
              }}
            >
              <AgentStatus />
              {richThreads ? (
                <>
                  <ErrorNotice error={threadsError} />
                  {threadsError ? (
                    <Button onPress={retryThreads}>Retry main chat</Button>
                  ) : threadsLoading ? (
                    <View style={{ paddingTop: spacing[4] }}>
                      <Skeleton label="Loading your conversation" variant="chat" rows={4} />
                    </View>
                  ) : null}
                  {!threadsLoading && selection.id !== mainId && (
                    <ChatTitle id={selection.id} />
                  )}
                  {visited.map((thread) => (
                    <View
                      key={thread.id}
                      style={{ display: selection.id === thread.id ? "flex" : "none", flex: 1 }}
                    >
                      <ChatScreen
                        thread={thread}
                        active={section === "chat" && selection.id === thread.id}
                        prompt={selection.id === thread.id ? prompt : undefined}
                      />
                    </View>
                  ))}
                </>
              ) : (
                <ChatScreen prompt={prompt} active={section === "chat"} />
              )}
            </View>
            </ChromeContext.Provider>
            <TopBar
              height={barHeight}
              name={agentName}
              status={status}
              showFace={!talkBarShown}
              avatar={data?.identity.avatar}
              callOn={talkState.active}
              chat={section === "chat"}
              pending={pending}
              onMenu={() => setThreadsOpen(true)}
              onTalk={() => {
                deboMood.tap();
                // A call that is already going (minimised) is just opened again. Otherwise the
                // popup opens and starts the call, if this device has already seen the consent text.
                if (!talkState.active) requestTalkAutoStart();
                navigate("talk");
              }}
              onBell={() => open({ type: "notifications" })}
            />
          </View>
          <View
            onLayout={(event) => setTabHeight(event.nativeEvent.layout.height)}
            style={{
              paddingHorizontal: screenPadding.phone,
              paddingTop: spacing[2],
              paddingBottom: desktop ? spacing[5] : spacing[2],
              alignItems: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                width: "100%",
                maxWidth: 420,
                padding: spacing[1],
                backgroundColor: colors.card,
                borderRadius: radius.full,
                boxShadow: shadow.low,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              {nav.map((item) => {
                // Talk is not a tab: it is a popup over the screen underneath.
                const active = section === item.id || (item.id === "apps" && utility);
                const tabStyle = {
                  flex: 1,
                  minWidth: 0,
                  height: spacing[12] + spacing[1],
                  gap: spacing[0.5],
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? colors.subtle : "transparent",
                  borderRadius: radius.chat,
                } as const;
                // A visible word under each icon, so no one has to guess what a shape means.
                const icon = (
                  <>
                    <item.icon size={22} strokeWidth={active ? 2.2 : 1.8} color={colors.text} />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily,
                        fontSize: fontSize.sm,
                        lineHeight: spacing[4],
                        fontWeight: active ? "600" : "500",
                        color: active ? colors.text : colors.muted,
                      }}
                    >
                      {item.short}
                    </Text>
                  </>
                );
                // On the web a tab is a real link, so middle-click and "open in new tab" work.
                if (onWeb)
                  return createElement(
                    "a",
                    {
                      key: item.id,
                      href: pathFor(item.id),
                      "aria-label": item.label,
                      "aria-current": active ? "page" : undefined,
                      onClick: (event: MouseEvent) => {
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                          return;
                        event.preventDefault();
                        navigate(item.id);
                      },
                      style: { ...tabStyle, display: "flex", textDecoration: "none" },
                    },
                    icon,
                  );
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    onPress={() => navigate(item.id)}
                    style={tabStyle}
                  >
                    {icon}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        {!!toast && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              // Above the tabs, and above the composer on Chat, so it never covers the message box.
              bottom: insets.bottom + tabHeight + (section === "chat" ? composerHeight : 0) + spacing[3],
              left: spacing[5],
              // Leave the floating call bubble's corner free.
              right: talkBarShown ? spacing[12] + spacing[12] : spacing[5],
              alignItems: "center",
            }}
          >
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                s.row,
                {
                  gap: spacing[2],
                  paddingVertical: spacing[1],
                  paddingLeft: spacing[4],
                  paddingRight: spacing[1],
                  backgroundColor: colors.ink,
                  borderRadius: radius.page,
                  maxWidth: 560,
                },
              ]}
            >
              <Check size={16} color={colors.blue} />
              <Text style={{ fontFamily, color: colors.onInk, ...bodyText, flexShrink: 1, paddingVertical: spacing[2] }}>
                {toast}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close this message"
                onPress={clearToast}
                style={{ width: spacing[11], height: spacing[11], alignItems: "center", justifyContent: "center" }}
              >
                <X size={16} color={colors.onInk} />
              </Pressable>
            </View>
          </View>
        )}
        {threadsOpen && <ThreadsSheet onClose={() => setThreadsOpen(false)} />}
        {welcomeOpen && <Onboarding />}
        {current === "talk" && <TalkPopup onClose={() => navigate(lastScreen.current)} />}
        {talkBarShown && (
          <TalkPill
            bottom={bubbleBottom}
            right={Math.max(spacing[4], (width - 760) / 2 + spacing[4])}
            onExpand={() => navigate("talk")}
            reviews={waitingReviews.length}
            onReview={() => {
              const first = waitingReviews[0];
              if (first) open({ type: "review", action: first });
            }}
          />
        )}
        {detail && (
          <Details
            key={
              detail.type === "task"
                ? detail.taskId
                : detail.type === "file"
                  ? detail.file.id
                  : detail.type === "browser"
                    ? detail.browser.id
                    : detail.type === "mail"
                      ? detail.mail.id
                      : detail.type === "review"
                        ? detail.action.id
                        : detail.type === "email"
                          ? JSON.stringify(detail.draft)
                          : detail.type === "event"
                            ? detail.event?.id || "event-new"
                            : detail.type
            }
            detail={detail}
          />
        )}
      </SafeAreaView>
    </>
  );
}
