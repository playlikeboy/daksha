// The small seam between voice copies and custom people (custom-people/).
//
// Custom people own the person records, the profile and the active person on the `persona`
// row (`customPersonId`). The voice copy code only needs the few calls below, so it can be
// tested with a fake, and it never writes custom people records itself.
import { activeCustomVoice } from "../custom-people/index.ts";
import type { CustomPeopleService, SpokenLine } from "../custom-people/service.ts";

export type { SpokenLine };

export interface CustomPeopleGlue {
  /** One of this owner's custom people, or null. Never another owner's. */
  person(owner: string, personId: string): Promise<{ id: string; name: string } | null>;
  /** Lines the chosen person really said, for their profile. */
  addSpokenLines(owner: string, personId: string, lines: SpokenLine[]): Promise<void>;
  /** The custom person Daksha is talking as right now, if their record says a voice copy was made. */
  activePersonId(owner: string): Promise<string | null>;
  /** Their spoken lines are no longer wanted. */
  forgetSpokenLines(owner: string, personId: string): Promise<void>;
  /** A voice copy was made (true) or removed (false), so the person record says so. */
  markVoiceCopy(owner: string, personId: string, copied: boolean): Promise<void>;
}

/** The glue the server uses: straight into the custom people service. */
export function customPeopleGlue(service: CustomPeopleService): CustomPeopleGlue {
  return {
    async person(owner, personId) {
      const person = await service.people.get(owner, personId);
      return person ? { id: person.id, name: person.name } : null;
    },
    addSpokenLines: (owner, personId, lines) => service.addSpokenLines(owner, personId, lines),
    async activePersonId(owner) {
      const active = await activeCustomVoice(service.db, owner);
      return active?.voiceCopy ? active.personId : null;
    },
    forgetSpokenLines: (owner, personId) => service.forgetSpokenLines(owner, personId),
    markVoiceCopy: (owner, personId, copied) => service.markVoiceCopy(owner, personId, copied),
  };
}
