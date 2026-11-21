// Settings card: "Phone" (GET /api/phone and friends, docs/PHONE.md). Add your own number, link
// it by calling Daksha from it and saying the code shown here, set the PIN every call asks for,
// turn reminder calls on or off, and ask for a test call. Without the server's phone trunks the
// card only says phone calls aren't set up yet.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { z } from "zod";
import { errorText } from "./debo-api";
import { Text } from "./text";
import { Button, Card, CheckRow, ErrorNotice, Field, s, SectionHeading, spacing } from "./ui";
import { useWorkspace } from "./workspace";

export const phoneStatus = z.object({
  setUp: z.object({ inbound: z.boolean(), outbound: z.boolean() }),
  callNumber: z.string().optional(),
  number: z.string().optional(),
  verified: z.boolean(),
  pinSet: z.boolean(),
  reminderCalls: z.boolean(),
  pending: z.object({ number: z.string(), code: z.string(), expiresAt: z.string() }).optional(),
  locked: z.boolean(),
});
export type PhoneStatus = z.infer<typeof phoneStatus>;

/** "123456" read as "123 456", so it is easy to say. */
export const spacedCode = (code: string) => code.replace(/^(\d{3})(\d{3})$/, "$1 $2");

export function PhoneSetting() {
  const { api } = useWorkspace();
  const [view, setView] = useState<PhoneStatus | null>();
  const [number, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setView(phoneStatus.parse(await api.request("/api/phone")));
      setError("");
    } catch (e) {
      // An older API without phone calls: nothing to show.
      if (e instanceof Error && /\(404\)|not found/i.test(e.message)) setView(null);
      else setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  if (view === null) return null;

  const act = async (path: string, body: unknown, method: string, done: string) => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const next = await api.request<unknown>(path, body, method);
      if (path === "/api/phone/call-me") await load();
      else setView(phoneStatus.parse(next));
      setStatus(done);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setUp = view && (view.setUp.inbound || view.setUp.outbound);

  return (
    <Card style={{ gap: spacing[3] }}>
      <SectionHeading title="Phone" />
      {!view ? (
        <Text style={s.muted}>{error ? "" : "Loading…"}</Text>
      ) : !setUp ? (
        <Text style={s.muted}>Phone calls aren't set up yet.</Text>
      ) : (
        <>
          <Text style={s.muted}>
            Talk to Daksha on a normal phone call. Calls are saved as text like your other calls. Daksha only calls your own
            number, and only when you ask.
          </Text>
          {view.pending ? (
            <View style={{ gap: spacing[2] }}>
              <Text style={s.text} accessibilityLiveRegion="polite">
                {view.callNumber
                  ? `From ${view.pending.number}, call ${view.callNumber} and say this code: ${spacedCode(view.pending.code)}.`
                  : `From ${view.pending.number}, call Daksha's number and say this code: ${spacedCode(view.pending.code)}.`}
              </Text>
              <Text style={s.small}>The code works for 15 minutes. Then come back here.</Text>
              <Button small disabled={busy} onPress={() => void load()}>
                I've called, check again
              </Button>
            </View>
          ) : view.verified && view.number ? (
            <Text style={s.text}>Your number: {view.number}</Text>
          ) : null}
          {!view.pending && view.setUp.inbound && (
            <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Field
                  label={view.verified ? "Change your number" : "Your phone number, with country code"}
                  value={number}
                  onChangeText={setNumber}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  placeholder="+1 415 555 0100"
                  maxLength={24}
                />
              </View>
              <Button
                small
                busy={busy}
                disabled={!number.trim()}
                onPress={() => void act("/api/phone/number", { number }, "POST", "Now call Daksha from that phone and say the code.").then((ok) => ok && setNumber(""))}
              >
                Get a code
              </Button>
            </View>
          )}
          {!view.setUp.inbound && !view.verified && (
            <Text style={s.small}>Linking a number needs calls to Daksha, which aren't set up yet.</Text>
          )}
          {view.verified && (
            <>
              <View style={{ flexDirection: "row", gap: spacing[2], alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={view.pinSet ? "Change your phone PIN (4 to 8 digits)" : "Set a phone PIN (4 to 8 digits)"}
                    value={pin}
                    onChangeText={(t) => setPin(t.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                  />
                </View>
                <Button
                  small
                  busy={busy}
                  disabled={pin.length < 4}
                  onPress={() => void act("/api/phone/pin", { pin }, "PUT", "PIN saved. Every call asks for it.").then((ok) => ok && setPin(""))}
                >
                  Save PIN
                </Button>
              </View>
              <Text style={s.small}>Caller ID can be faked, so every call asks for this PIN before Daksha says anything personal.</Text>
              {view.locked && <Text style={s.text}>Too many wrong PINs. Calls are paused for a while; you can set a new PIN here.</Text>}
              {view.setUp.outbound && (
                <>
                  <CheckRow
                    label="Call me for reminders, as well as the usual update"
                    checked={view.reminderCalls}
                    onPress={() =>
                      void act(
                        "/api/phone/settings",
                        { reminderCalls: !view.reminderCalls },
                        "PATCH",
                        view.reminderCalls ? "Reminder calls are off." : "Reminder calls are on.",
                      )
                    }
                  />
                  <Button small disabled={busy || !view.pinSet} onPress={() => void act("/api/phone/call-me", {}, "POST", "Calling you now.")}>
                    Call me now
                  </Button>
                </>
              )}
              <Button small disabled={busy} onPress={() => void act("/api/phone", undefined, "DELETE", "Your number and PIN are removed.")}>
                Remove my number
              </Button>
            </>
          )}
        </>
      )}
      <ErrorNotice error={error} />
      {!!status && (
        <Text style={s.muted} accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </Card>
  );
}
