// Custom people: someone the person made to talk to, from a description or their own files.
// See store.ts (the records), uploads.ts (consent, limits, sweep), service.ts (reading the
// files), profile.ts (the profile and the prompt), tools.ts (chat and calls).
import type { Store } from "../db.ts";
import { type Persona, PersonaStore, personaPrompt } from "../persona.ts";
import { customPersonPrompt } from "./profile.ts";
import { CustomPeopleStore } from "./store.ts";

export { llmPersonModel, personModelFor } from "./model.ts";
export { buildProfile, customPersonPrompt, type PersonModel, type ProfileSources } from "./profile.ts";
export { customPeopleRoutes } from "./routes.ts";
export { CustomPeopleService, type CustomPeopleDeps } from "./service.ts";
export { CustomPeopleStore, type CustomPerson } from "./store.ts";
export { customPeopleInstructions, customPeopleTools } from "./tools.ts";
export {
  CONSENT_TEXT,
  consentRecord,
  deleteSessionFiles,
  ownerPrefix,
  sessionPrefix,
  startSession,
  sweepUploads,
} from "./uploads.ts";

/**
 * The role part of the system prompt: a custom person's profile when one is active, otherwise
 * the plain role the person asked for. A deleted custom person falls back to the plain role.
 */
export async function rolePrompt(db: Store, owner: string, persona?: Persona | null): Promise<string> {
  const current = persona === undefined ? await new PersonaStore(db).get(owner).catch(() => null) : persona;
  if (!current) return "";
  if (current.customPersonId) {
    const person = await new CustomPeopleStore(db).get(owner, current.customPersonId).catch(() => null);
    if (person) return customPersonPrompt(person);
  }
  return personaPrompt(current);
}

/** The voice the active custom person was given, if any. Calls use it over the person's setting. */
export async function activeCustomVoice(db: Store, owner: string): Promise<string | undefined> {
  const persona = await new PersonaStore(db).get(owner).catch(() => null);
  if (!persona?.customPersonId) return undefined;
  return (await new CustomPeopleStore(db).get(owner, persona.customPersonId).catch(() => null))?.voice;
}
