// The one place Daksha places a real phone call: LiveKit SIP (livekit-server-sdk, Apache-2.0).
// It sends the "debo-voice" agent into a new room, then dials the number into the same room.
// Tests never use this file; they pass a fake Dialer.
import { AgentDispatchClient, SipClient } from "livekit-server-sdk";
import { VOICE_AGENT_NAME } from "../voice/config.ts";
import type { PhoneConfig } from "./config.ts";
import type { Dialer } from "./service.ts";

export function livekitDialer(config: PhoneConfig): Dialer {
  const host = config.voice.livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  return {
    async call({ number, metadata }) {
      if (!config.outboundTrunkId) throw new Error("No outbound trunk");
      const room = `debo-phone-${crypto.randomUUID()}`;
      // The agent's job metadata carries the signed call token; only this server can set it.
      await new AgentDispatchClient(host, config.voice.apiKey, config.voice.apiSecret).createDispatch(room, VOICE_AGENT_NAME, { metadata });
      await new SipClient(host, config.voice.apiKey, config.voice.apiSecret).createSipParticipant(config.outboundTrunkId, number, room, {
        participantIdentity: `phone-${crypto.randomUUID()}`,
        participantName: "Phone",
        ringingTimeout: 30,
        playDialtone: false,
      });
    },
  };
}
