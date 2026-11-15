import { VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Band } from "./band";
import { SectionHead } from "./section-head";

// Custom people (decision 33). Every line here must stay true to the app:
// os/apps/server/src/custom-people/ and the privacy page. Change them together.
const WAYS = [
  {
    title: "From a few words, or from your chats",
    body: "Describe who they are. Or add your WhatsApp chats, photos, videos, voice notes and call recordings. Debo works out who is speaking and keeps only that person’s words.",
  },
  {
    title: "Their voice, if you choose",
    body: "Debo can copy their voice for calls. Only with their permission, or if you are close family and they have died. Never a public figure. For now this needs your own Cartesia key.",
  },
  {
    title: "Design their face",
    body: "Pick a shape, colours, hair and small extras. You see their face smile, blink and talk while you build it.",
  },
  {
    title: "Talk any time",
    body: "Chat or call whenever you like. To relax after a long day, or to share something that excites you.",
  },
];

const PROMISES = [
  "Debo reads your files once to learn how they talk, then deletes the files.",
  "The people you make are private to you. No one else can see them or talk to them.",
  "It is always honest that it is an AI, and never claims to be the real person.",
  "A copied voice is used only inside your own Debo. It never calls or messages anyone.",
  "You can delete a person at any time, and everything made from your files goes with them.",
];

export function YourPeople() {
  return (
    <Band id="your-people">
      <SectionHead
        id="your-people"
        eyebrow="Your own people"
        badge={<Badge variant="info" label="New, early version" />}
        title="Make your own people"
        lead="Make someone to talk to, in chat or on a call: a friend, someone in your family, someone you miss, or a character you invent. This part is new and has had little real-world testing."
      />
      <Grid columns={{ minWidth: 240, repeat: "fit" }} gap={4} align="stretch">
        {WAYS.map((way) => (
          <Card key={way.title} padding={5}>
            <VStack gap={2}>
              <Heading level={3}>{way.title}</Heading>
              <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
                {way.body}
              </Text>
            </VStack>
          </Card>
        ))}
      </Grid>
      <Card padding={6} elevation="low">
        <VStack gap={3} maxWidth={720}>
          <Heading level={3}>Private, and honest about what it is</Heading>
          <VStack gap={2}>
            {PROMISES.map((line) => (
              <Text key={line} as="p" type="large" weight="normal" textWrap="pretty">
                {line}
              </Text>
            ))}
          </VStack>
        </VStack>
      </Card>
    </Band>
  );
}
