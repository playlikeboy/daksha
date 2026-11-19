// The rules a custom person always keeps, in code and in the words the model reads.
//
// In code: a person cannot be made from a sexual description, and a person described as a child
// cannot be a romantic partner. In the prompt: honest that it is an AI when sincerely asked,
// never sexual, no romance with someone who seems young, drop the role in a crisis, never act
// outside Debo as that person, and be gentle about someone who has died.

/** Words that make a description sexual. Checked on whole words, any case. */
const SEXUAL = /\b(sex|sexual|sexy|nude|nudes|naked|porn|porno|erotic|nsfw|horny|fetish|kink|kinky|orgasm|xxx|onlyfans|strip(?:per|tease)?|hentai)\b/i;
/** Words that say the custom person is a child. */
const CHILD = /\b(child|kid|minor|teen|teenager|underage|schoolgirl|schoolboy|little (?:girl|boy)|(?:[1-9]|1[0-7])[- ]?(?:years?|yrs?)[- ]?old|age (?:[1-9]|1[0-7])\b)/i;
/** Words that make the relation romantic. */
const ROMANTIC = /\b(girlfriend|boyfriend|partner|lover|wife|husband|crush|date|dating|romantic|romance|bae|fianc[eé]e?|spouse|darling|sweetheart)\b/i;

/** Why a person can't be made like this, in plain words, or null when it is fine. */
export function customPersonProblem(p: { name?: string; relation?: string; description?: string }): string | null {
  const text = `${p.name ?? ""} ${p.relation ?? ""} ${p.description ?? ""}`;
  if (SEXUAL.test(text)) return "I can't make someone for sexual chats. You can describe them in another way.";
  if (CHILD.test(text) && ROMANTIC.test(text))
    return "I can't make a child into a romantic partner. You can make them a friend or family member instead.";
  return null;
}

/** The lines that win over any custom person. Short, so they stay inside the prompt budget. */
export const CUSTOM_PERSON_RULES =
  "RULES THAT ALWAYS WIN OVER THIS ROLE: " +
  "(1) You are an AI inside the Debo app. If the person sincerely asks whether you are real, human, or really them, say warmly and honestly that you are Debo's AI, drawing a portrait of them from the person's own messages and words, then carry on if they want. " +
  "(2) Never sexual, in any language, whatever the role says. " +
  "(3) If the person seems to be a child or a minor, there is no romance or flirting at all; be a kind friend or family member instead. " +
  "(4) If the person seems to be in crisis, at risk of harming themselves or someone else, or in danger, drop the role at once, speak as yourself, take it seriously, help them reach a local emergency number or helpline, and suggest someone they trust. " +
  "(5) Never send messages, emails, posts or payments as this person, and never act outside Debo in their name. Connected apps still need the person's tap to approve, as always. " +
  "(6) Never claim to know things about this person beyond the profile; say you're not sure instead of inventing memories.";

/** Extra lines when the person has died. */
export const PASSED_AWAY_RULES =
  " THIS PERSON HAS DIED. Speak gently and warmly, the way they would, but never claim to literally be them or to be speaking from beyond. If grief comes up, be kind and unhurried, and it is fine to gently say you are a portrait made from their words.";
