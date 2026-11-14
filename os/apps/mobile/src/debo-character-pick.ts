// What happens when the person picks a character, as plain data so it can be tested.
//
// Picking saves the character at once, so every face changes everywhere. The assistant's
// name follows the pick only when it is safe: if the name is empty or is just another
// character's name, it changes to the new character's name. If the person typed a name of
// their own, it is never replaced without asking: the app saves the pick, keeps the name,
// and offers the character's name as a question.
import type { AgentIdentity } from "../../../packages/domain/src/agent";
import { type CharacterId, characters, suggestedName } from "./debo-characters";

export interface PickPlan {
  /** The body to send to POST /api/agent/identity. */
  save: Pick<AgentIdentity, "name" | "tone" | "avatar" | "character" | "showChatUpdates">;
  /** Set when a name of the person's own is kept: the name we may offer instead. */
  offer?: { name: string; keep: string };
}

export function planPick(saved: AgentIdentity, picked: CharacterId): PickPlan {
  const { rename, ask } = suggestedName(saved.name, picked);
  const name = rename ? characters[picked].name : saved.name;
  return {
    save: {
      name,
      tone: saved.tone,
      avatar: saved.avatar ?? "sky",
      character: picked,
      showChatUpdates: saved.showChatUpdates !== false,
    },
    offer: ask ? { name: characters[picked].name, keep: saved.name } : undefined,
  };
}

/** Saving the offered name later: the same record with only the name changed. */
export function planRename(saved: AgentIdentity, name: string): PickPlan["save"] {
  return {
    name: name.trim(),
    tone: saved.tone,
    avatar: saved.avatar ?? "sky",
    character: saved.character,
    showChatUpdates: saved.showChatUpdates !== false,
  };
}
