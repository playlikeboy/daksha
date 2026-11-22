import { BRAND } from "../brand";
import { Badge, Section, SectionHead, stagger } from "./section";

// The five characters from the app's "Choose who you talk to". Copies of
// docs/assets/avatar-*.svg. These are the choice inside the app, not the brand.
const CHARACTERS = [
  { name: "Daksha", src: "/characters/avatar-debo.svg", alt: "Daksha, a small round blue creature" },
  { name: "Diya", src: "/characters/avatar-diya.svg", alt: "Diya, the red tomato" },
  { name: "Anaya", src: "/characters/avatar-anaya.svg", alt: "Anaya, a cartoon young woman in a teal kurta" },
  { name: "Mishti", src: "/characters/avatar-mishti.svg", alt: "Mishti, a small round orange cat" },
  { name: "Kabir", src: "/characters/avatar-kabir.svg", alt: "Kabir, a cartoon young man in a mustard hoodie" },
];

export function Characters() {
  return (
    <Section id="characters">
      <SectionHead
        id="characters"
        align="center"
        badge={<Badge tone="new">New, early version</Badge>}
        title="Choose who you talk to"
        lead={`Pick one of five friendly characters to be your ${BRAND}, or make your own, and call it whatever you like. Its face comes alive while you talk.`}
      />
      <ul className="cast" role="list">
        {CHARACTERS.map((character, index) => (
          <li key={character.name} data-reveal="pop" style={stagger(index)}>
            <div className="cast__face">
              <img src={character.src} alt={character.alt} width={128} height={128} loading="lazy" />
            </div>
            <span className="cast__name" aria-hidden="true">
              {character.name}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
