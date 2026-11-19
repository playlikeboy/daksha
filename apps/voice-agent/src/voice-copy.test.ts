import { describe, expect, it } from "vitest";
import { chooseTts, fetchVoiceCopy, greeting, type VoiceCopy } from "./voice-copy.ts";

const copy: VoiceCopy = {
  voiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
  apiKey: "sk_car_TESTKEY0123456789abcdef",
  personName: "Asha",
  language: "hi",
  opening: "Hi, it's Daksha. I'm speaking as an AI version of Asha, in a copied voice. I'm not really Asha.",
};

const config = { deboUrl: "https://api.example.test", secret: "s".repeat(40) };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; auth: string | null; body: string }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), auth: new Headers(init?.headers).get("authorization"), body: String(init?.body) });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetcher };
}

describe("chooseTts", () => {
  it("uses the Cartesia plugin only when there is a voice copy", () => {
    const made: string[] = [];
    const makers = {
      inference: () => (made.push("inference"), "inference-tts"),
      cartesia: (c: VoiceCopy) => (made.push(`cartesia:${c.voiceId}`), "cartesia-tts"),
    };
    expect(chooseTts(null, makers)).toEqual({ tts: "inference-tts", copied: false });
    expect(chooseTts(copy, makers)).toEqual({ tts: "cartesia-tts", copied: true });
    expect(made).toEqual(["inference", `cartesia:${copy.voiceId}`]);
  });
});

describe("fetchVoiceCopy", () => {
  it("asks the server over the agent secret and reads the voice copy", async () => {
    const f = fakeFetch(200, { voiceCopy: copy });
    expect(await fetchVoiceCopy(config, "user-1", f.fetcher)).toEqual(copy);
    expect(f.calls[0]?.url).toBe("https://api.example.test/api/voice/session");
    expect(f.calls[0]?.auth).toBe(`Bearer ${config.secret}`);
    expect(JSON.parse(f.calls[0]?.body ?? "{}")).toEqual({ userId: "user-1" });
  });

  it("falls back to Daksha's voice on no copy, a refusal, or a bad answer", async () => {
    expect(await fetchVoiceCopy(config, "u", fakeFetch(200, { voiceCopy: null }).fetcher)).toBeNull();
    expect(await fetchVoiceCopy(config, "u", fakeFetch(401, { error: "no" }).fetcher)).toBeNull();
    expect(await fetchVoiceCopy(config, "u", fakeFetch(200, { voiceCopy: { voiceId: "x" } }).fetcher)).toBeNull();
    const broken = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await fetchVoiceCopy(config, "u", broken)).toBeNull();
  });
});

describe("greeting", () => {
  it("always starts a copied-voice call by saying it is Daksha's AI version", () => {
    expect(greeting(copy)).toMatch(/^Hi, it's Daksha\. I'm speaking as an AI version of Asha/);
    expect(greeting(null)).toBe("Hey! I'm here. What's on your mind?");
  });
});
