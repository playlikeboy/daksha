// What happens when the person picks a character, as plain data so it can be tested.
//
// Picking saves the character at once, so every face changes everywhere. The assistant's
// name follows the pick only when it is safe: if the name is empty or is just another
// character's name, it changes to the new character's name. If the person typed a name of
// their own, it is never replaced without asking: the app saves the pick, keeps the name,
// and offers the character's name as a question.
//
// A face the person made counts the same way: its name is offered like a character's.
import type { AgentIdentity } from "../../../packages/domain/src/agent";
import { type CharacterId, characters, suggestedName } from "./debo-characters";

export interface PickPlan {
  /** The body to send to POST /api/agent/identity. */
  save: Pick<AgentIdentity, "name" | "tone" | "avatar" | "character" | "showChatUpdates" | "customAvatar">;
  /** Set when a name of the person's own is kept: the name we may offer instead. */
  offer?: { name: string; keep: string };
}

/** A face the person made: its saved id and the name they gave it. */
export interface PickedFace {
  id: string;
  name: string;
}

export function planPick(saved: AgentIdentity, picked: CharacterId, face?: PickedFace): PickPlan {
  const offered = picked === "custom" && face ? face.name.trim() : characters[picked].name;
  const { rename, ask } = suggestedName(saved.name, picked, offered);
  const name = rename ? offered : saved.name;
  return {
    save: {
      name,
      tone: saved.tone,
      avatar: saved.avatar ?? "sky",
      character: picked,
      ...(picked === "custom" && face ? { customAvatar: face.id } : {}),
      showChatUpdates: saved.showChatUpdates !== false,
    },
    offer: ask ? { name: offered, keep: saved.name } : undefined,
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
