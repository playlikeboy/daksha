import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Band } from "./band";
import { Phone } from "./phone";
import { SectionHead } from "./section-head";

// The five characters from the app's "Choose who you talk to". Copies of docs/assets/avatar-*.svg.
const CHARACTERS = [
  { name: "Debo", src: "/characters/avatar-debo.svg", alt: "Debo, a small round blue creature" },
  { name: "Diya", src: "/characters/avatar-diya.svg", alt: "Diya, the red tomato" },
  { name: "Anaya", src: "/characters/avatar-anaya.svg", alt: "Anaya, a cartoon young woman in a teal kurta" },
  { name: "Mishti", src: "/characters/avatar-mishti.svg", alt: "Mishti, a small round orange cat" },
  { name: "Kabir", src: "/characters/avatar-kabir.svg", alt: "Kabir, a cartoon young man in a mustard hoodie" },
];

export function WriteOrSay() {
  return (
    <Band id="write" variant="muted">
      <SectionHead
        id="write"
        eyebrow="Step 1"
        title="Write it down, or say it out loud"
        lead="Keep a journal in your own words, a line or a page. Or press talk and speak to Debo, in English or Hindi. Nothing is saved until you press the button."
      />
      <Grid columns={{ minWidth: 280, repeat: "fit" }} gap={5} align="stretch">
        <Card padding={5}>
          <VStack gap={5} hAlign="center">
            <Phone
              src="/shots/journal-light.webp"
              width={780}
              height={1688}
              maxWidth={260}
              alt="The Debo journal. A large writing box asks: What happened today? Who did you see? Below it are the day, a Save entry button and a box to find an entry."
            />
            <VStack gap={2} width="100%">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Your journal</Heading>
                <Badge variant="success" label="Works today" />
              </HStack>
              <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
                Write, find, change or delete any entry. Only you can read them.
              </Text>
            </VStack>
          </VStack>
        </Card>
        <Card padding={5}>
          <VStack gap={5} hAlign="center">
            <Phone
              src="/shots/talk-light.webp"
              width={780}
              height={1688}
              maxWidth={260}
              alt="A voice call with Debo. The red tomato sits above the word Listening and Microphone on. Debo has said: Hey! I'm here. What's on your mind? Buttons below: Mic on, Stop Debo, Type and End."
            />
            <VStack gap={2} width="100%">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Talk to Debo</Heading>
                <Badge variant="success" label="Works today" />
              </HStack>
              <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
                Debo listens only while you talk, and the screen always says whether the microphone is on.
              </Text>
            </VStack>
          </VStack>
        </Card>
      </Grid>
      <Grid columns={{ minWidth: 280, repeat: "fit" }} gap={5} align="stretch">
        <Card padding={5}>
          <VStack gap={3} hAlign="start">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={3}>Voice and video journal</Heading>
              <Badge variant="info" label="New, early version" />
            </HStack>
            <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
              Record a voice or video note, or add one you already have. Debo keeps it as an entry and writes out
              the words, so you can search and ask about it. This part is new and has had little real-world
              testing.
            </Text>
          </VStack>
        </Card>
        <Card padding={5}>
          <VStack gap={4} hAlign="start">
            <VStack gap={3} hAlign="start">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Choose who you talk to</Heading>
                <Badge variant="info" label="New, early version" />
              </HStack>
              <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
                Pick one of five characters, and give it the name you like. Its face moves while you talk.
              </Text>
            </VStack>
            <HStack gap={3} wrap="wrap">
              {CHARACTERS.map((character) => (
                <VStack key={character.name} gap={1} hAlign="center">
                  <img src={character.src} alt={character.alt} width={56} height={56} loading="lazy" />
                  <Text type="supporting" color="secondary">
                    {character.name}
                  </Text>
                </VStack>
              ))}
            </HStack>
          </VStack>
        </Card>
      </Grid>
    </Band>
  );
}
