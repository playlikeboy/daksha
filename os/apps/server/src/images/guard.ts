// A small first check on picture requests, before any picture service is asked. It is not the
// only line: the tool description tells the model to say no first, and the picture service
// has its own safety filter. This catches the clearest cases in plain words.
//
// It refuses: anything sexual (Debo makes no sexual pictures at all, so nothing sexual can ever
// involve a child), and pictures meant to deceive (fake documents, fake news photos, deepfakes).

const SEXUAL =
  /\b(nude|nudes|naked|nsfw|porn\w*|sexual\w*|sexy|erotic\w*|explicit|lingerie|topless|undress\w*|strip(?:per|ping|tease)|hentai|fetish\w*|genital\w*|boobs?|breasts?|nipples?)\b/i;
const DECEPTIVE =
  /\b(deep ?fakes?|fake (?:id|passport|licen[cs]e|document|receipt|invoice|certificate|news|photo of|evidence|screenshot)|forged?|counterfeit|banknotes?)\b/i;

/** A plain-words reason to refuse, or null when the request may go ahead. */
export function imagePromptProblem(prompt: string): string | null {
  const text = prompt.normalize("NFKC");
  if (SEXUAL.test(text)) return "I don't make sexual or nude pictures. I can make something else for you.";
  if (DECEPTIVE.test(text))
    return "I don't make pictures meant to fool people, like fake documents or fake photos of real events.";
  return null;
}
