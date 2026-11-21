// The brain's reply arrives in small pieces of text that may hold Markdown (a list, **bold**,
// a link, a code block). Read out as is, a voice says "asterisk asterisk". This collects the
// pieces into whole sentences or lines and passes each through speakable() from OpenMausBot
// (third_party/openmausbot/tts/speech-text.ts), so the voice hears plain words.
import { speakable } from "../third_party/openmausbot/tts/speech-text.ts";

/** A sentence end or a line end, outside a code block. */
const BREAK = /([.!?:;])\s+|\n/g;

export class SpeakableBuffer {
  #held = "";

  /** Add a piece; returns the plain text that is ready to say now (maybe empty). */
  push(piece: string): string {
    this.#held += piece;
    // An unfinished ``` block is held until it closes; only the text before it may be said.
    const fences = [...this.#held.matchAll(/```|~~~/g)];
    const open = fences.length % 2 === 1 ? (fences.at(-1)?.index ?? 0) : this.#held.length;
    let cut = -1;
    for (const match of this.#held.slice(0, open).matchAll(BREAK)) cut = (match.index ?? 0) + match[0].length;
    if (cut <= 0) return "";
    const ready = this.#held.slice(0, cut);
    this.#held = this.#held.slice(cut);
    return said(ready);
  }

  /** The rest, at the end of the reply. */
  flush(): string {
    const rest = this.#held;
    this.#held = "";
    return said(rest);
  }
}

/** speakable() trims its result: keep one space after it so the next sentence does not run on. */
function said(text: string): string {
  const plain = speakable(text);
  return plain ? `${plain} ` : "";
}
