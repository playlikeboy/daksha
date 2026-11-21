// "Speak instead of typing", shared by the journal's writing box and the chat's message box.
// Short clips go to Daksha's server, which writes them out (`/api/debo/transcribe`); nothing
// is kept. The first time, the person reads what happens and says yes; that yes is
// remembered on this device only.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deboApi, errorText } from "./debo-api";
import { type Dictation, recordingSupport, startDictation } from "./debo-capture";
import type { FuseApi } from "./api";

const CONSENT_KEY = "debo.dictation.ok.v1";

export function dictationConsentGiven(): boolean {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage?.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}
export function rememberDictationConsent() {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(CONSENT_KEY, "1");
  } catch {
    // Without storage the question is simply asked again next time.
  }
}

/** The words shown before the first "Speak". */
export const dictationPromise =
  "Speak sends short clips of your voice to Daksha, which uses Cloudflare's speech service to write them out as text. Nothing is kept. The microphone is only on while you see “Listening”.";

/**
 * Speak into a text box. `onWords` gets each piece of written-out text. `speaking` says
 * whether the server has speech turned on (from /api/debo/status); undefined while unknown.
 */
export function useDictation(api: FuseApi, onWords: (words: string) => void, speaking: boolean | undefined) {
  const debo = useMemo(() => deboApi(api), [api]);
  const dictation = useRef<Dictation | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [writing, setWriting] = useState(0);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const supported = recordingSupport().dictation;
  const words = useRef(onWords);
  words.current = onWords;

  // Leaving the screen always turns the microphone off.
  useEffect(
    () => () => {
      void dictation.current?.stop();
    },
    [],
  );

  const start = useCallback(async () => {
    setError("");
    if (speaking === false) {
      setError("Speaking into the text is not turned on yet. You can still type, or use the microphone on your keyboard.");
      return;
    }
    if (!supported) {
      setError("Use the microphone on your keyboard to speak into the text.");
      return;
    }
    if (!dictationConsentGiven()) {
      setAsking(true);
      return;
    }
    setAsking(false);
    try {
      dictation.current = await startDictation(async (clip) => {
        setWriting((n) => n + 1);
        try {
          const text = (await debo.dictate(clip)).trim();
          if (text) words.current(text);
        } catch (e) {
          setError(errorText(e));
        } finally {
          setWriting((n) => n - 1);
        }
      });
      setListening(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, [debo, speaking, supported]);

  const stop = useCallback(async () => {
    const active = dictation.current;
    dictation.current = undefined;
    setListening(false);
    await active?.stop();
  }, []);

  return {
    listening,
    writing: writing > 0,
    asking,
    error,
    start,
    stop,
    agree: () => {
      rememberDictationConsent();
      void start();
    },
    decline: () => setAsking(false),
    clearError: () => setError(""),
  };
}
