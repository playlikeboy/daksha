import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Band } from "./band";
import { Phone } from "./phone";

export function WriteOrSay() {
  return (
    <Band id="write">
      <VStack gap={3} maxWidth={640} hAlign="start">
        <Badge variant="neutral" label="Step 1" />
        <Heading level={2} type="display-2" weight="bold" id="write-title" textWrap="balance">
          Write it down, or say it out loud
        </Heading>
        <Text type="large" weight="normal" as="p" color="secondary" textWrap="pretty">
          Keep a journal in your own words, a line or a page. Or press talk and speak to Debo, in English or
          Hindi. Nothing is saved until you press the button.
        </Text>
      </VStack>
      <Grid columns={{ minWidth: 280, repeat: "fit" }} gap={8} align="start">
        <VStack gap={4} hAlign="center">
          <Phone
            src="/shots/journal-light.webp"
            width={780}
            height={1688}
            alt="The Debo journal. A large writing box asks: What happened today? Who did you see? Below it are the day, a Save entry button and a box to find an entry."
          />
          <VStack gap={1} hAlign="center">
            <HStack gap={2} vAlign="center">
              <Heading level={3}>Your journal</Heading>
              <Badge variant="success" label="Works today" />
            </HStack>
            <Text as="p" type="large" weight="normal" color="secondary" justify="center" textWrap="balance">
              Write, find, change or delete any entry. Only you can read them.
            </Text>
          </VStack>
        </VStack>
        <VStack gap={4} hAlign="center">
          <Phone
            src="/shots/talk-light.webp"
            width={780}
            height={1688}
            alt="A voice call with Debo. The red tomato sits above the word Listening and Microphone on. Debo has said: Hey! I'm here. What's on your mind? Buttons below: Mic on, Stop Debo, Type and End."
          />
          <VStack gap={1} hAlign="center">
            <HStack gap={2} vAlign="center">
              <Heading level={3}>Talk to Debo</Heading>
              <Badge variant="success" label="Works today" />
            </HStack>
            <Text as="p" type="large" weight="normal" color="secondary" justify="center" textWrap="balance">
              Debo listens only while you talk, and the screen always says whether the microphone is on.
            </Text>
          </VStack>
        </VStack>
        <VStack gap={3} paddingBlockStart={4} hAlign="start">
          <Heading level={3}>Voice and video journal</Heading>
          <Badge variant="info" label="New, early version" />
          <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
            Record a voice or video note, or add one you already have. Debo keeps it as an entry and writes out the words so you can search and ask about it. This part is new and has had little real-world testing.
          </Text>
        </VStack>
      </Grid>
    </Band>
  );
}
