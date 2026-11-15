// Short samples of each voice on offer, so a person can hear a voice before picking it.
// Each one is the voice itself, made by the same model calls use (Cartesia Sonic-3
// through LiveKit Inference) with apps/voice-agent/scripts/make-voice-samples.mjs.
// They ship inside the app, so playing one needs no network and sends nothing anywhere.
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";

/** Voice id (VOICES in os/apps/server/src/talk-settings.ts) to its sample. */
const samples: Record<string, number> = {
  "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc": require("../assets/voices/jacqueline.mp3"),
  "f31cc6a7-c1e8-4764-980c-60a361443dd1": require("../assets/voices/robyn.mp3"),
  "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c": require("../assets/voices/daniela.mp3"),
  "a167e0f3-df7e-4d52-a9c3-f949145efdab": require("../assets/voices/blake.mp3"),
};

/** The words every sample says, for the screen reader label and the caption. */
export const SAMPLE_TEXT = "Hi, it's me. Tell me about your day, and I'll keep it safe for you.";

export function hasSample(voiceId: string) {
  return voiceId in samples;
}

/**
 * Plays one sample at a time. Pressing play on another voice stops the first; pressing
 * the playing one stops it. `playing` is the voice id being heard, if any.
 */
export function useVoiceSample() {
  const [playing, setPlaying] = useState<string>();
  const player = useRef<AudioPlayer | null>(null);

  const stop = useCallback(() => {
    player.current?.remove();
    player.current = null;
    setPlaying(undefined);
  }, []);

  const toggle = useCallback(
    (voiceId: string) => {
      const wasPlaying = player.current && playing === voiceId;
      stop();
      const source = samples[voiceId];
      if (wasPlaying || source === undefined) return;
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
      const next = createAudioPlayer(source);
      next.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish && player.current === next) stop();
      });
      player.current = next;
      setPlaying(voiceId);
      next.play();
    },
    [playing, stop],
  );

  useEffect(() => stop, [stop]);
  return { playing, toggle, stop };
}
