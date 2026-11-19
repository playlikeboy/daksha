import { useAssistantName, useCustomAvatar, useDeboCharacter } from "./debo-character-store";

/**
 * How labels talk about the character the person picked: "How fast she speaks",
 * "How fast they speak". Daksha the creature has no gender (DESIGN.md), so it is "they".
 * A character missing from the table is "they" too, so a new one never reads wrong.
 */
export interface Pronouns {
  /** she, he, they */
  they: string;
  /** her, his, their */
  their: string;
  /** her, him, them */
  them: string;
  /** herself, himself, themself */
  themself: string;
  /** Adds the verb ending: "she knows", "they know". */
  verb: (plain: string) => string;
}

const they: Pronouns = {
  they: "they",
  their: "their",
  them: "them",
  themself: "themself",
  verb: (plain) => plain,
};
const she: Pronouns = {
  they: "she",
  their: "her",
  them: "her",
  themself: "herself",
  verb: (plain) => (plain === "have" ? "has" : `${plain}s`),
};
export const he: Pronouns = {
  they: "he",
  their: "his",
  them: "him",
  themself: "himself",
  verb: she.verb,
};

/** Keyed by character id. Add a new character here when it is added to debo-characters.ts. */
const byCharacter: Record<string, Pronouns> = {
  debo: they,
  diya: she,
  anaya: she,
  mishti: she,
  kabir: he,
};

/**
 * A face the person made ("custom") uses the pronoun they picked for it in the avatar
 * builder, `customPronoun`. Anything else, or nothing, is "they".
 */
export function pronounsFor(character: string, customPronoun?: string): Pronouns {
  if (character === "custom") return customPronoun === "she" ? she : customPronoun === "he" ? he : they;
  return byCharacter[character] ?? they;
}

/** The pronouns of the character the person chose. */
export function usePronouns(): Pronouns {
  const custom = useCustomAvatar();
  return pronounsFor(useDeboCharacter(), custom.pronoun);
}

/** "How Nova talks and what she knows": the name of the talk settings, wherever it is linked. */
export function useTalkSettingsName(): string {
  const name = useAssistantName();
  const p = usePronouns();
  return `How ${name} talks and what ${p.they} ${p.verb("know")}`;
}

/** "she" to "She", for the start of a sentence. */
export function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
