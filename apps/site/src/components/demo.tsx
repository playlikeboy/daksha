import { VStack } from "@astryxdesign/core/Layout";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Band } from "./band";

// A short animated film: the app's cards are redrawn (not screen recordings), with words that build
// on screen (source in video/launch/film2). Below it, a walkthrough of one real recording with step captions.
// Both have music and sound effects made in video/launch/audio, and no speech.
// Astryx has no video component, so these are plain video elements inside a Card.
export function Demo() {
  return (
    <Band id="demo" variant="muted">
      <VStack gap={3} maxWidth={640} hAlign="start">
        <Badge variant="neutral" label="Watch it, about a minute" />
        <Heading level={2} type="display-2" weight="bold" id="demo-title" textWrap="balance">
          See what Debo does
        </Heading>
        <Text type="large" weight="normal" as="p" color="secondary" textWrap="pretty">
          A short animated film about what Debo does. You write down a day, ask about your own life and see the
          entries each answer came from. Then you fix what Debo knows, talk to it, keep track of the people in your
          life, and say yes before anything changes in your apps. It has music and sound effects but no speech.
        </Text>
      </VStack>
      <VStack hAlign="center" gap={3}>
        <Card padding={1.5} elevation="high" width="100%" maxWidth={960}>
          <AspectRatio ratio={16 / 9} fit="cover">
            <video
              controls
              playsInline
              preload="none"
              width={1920}
              height={1080}
              poster="/debo-launch-poster.webp"
              aria-label="A short animated film about Debo, with music and sound effects and no speech. Words build on a white screen: Meet Debo, a journal you can talk to. Between the cards, a line repeats: Debo remembers your days, Debo answers from your journal, Debo shows you what it knows, Debo talks with you, Debo remembers your people, Debo asks before it acts. The cards show a journal entry about lunch with Neha and a Goa trip being typed and saved, next to a voice note and a video. A question, what do I need to sort out before the Goa trip, gets an answer with three things to do and the three entries it came from. On What Debo knows, a memory is fixed and another is forgotten. Five characters appear and Debo, a blue blob, is picked for a voice call, where the person says Neha's birthday is on 21 November. People in your life shows Neha, Mum and Aarav, and Debo says Neha's birthday is on Saturday. Connected apps like Gmail and Calendar circle Debo. A card waiting for your yes asks to add the Goa trip to the calendar; Approve is pressed, the days flip over and the word Done appears with confetti. It ends on Debo keeps you in control, the Debo tomato and my.debo.life."
            >
              <source src="/debo-launch.mp4" type="video/mp4" />
              <source src="/debo-launch.webm" type="video/webm" />
              Your browser cannot play this video.
            </video>
          </AspectRatio>
        </Card>
        <Text type="supporting" as="p" color="secondary" justify="center" textWrap="balance">
          Drawn, not recorded: the cards are rebuilt from the app's own screens and words. All the names and entries are made-up sample text.
        </Text>
      </VStack>
      <VStack gap={3} hAlign="center">
        <Heading level={3}>The full walkthrough</Heading>
        <Card padding={1.5} elevation="high" width="100%" maxWidth={960}>
          <AspectRatio ratio={16 / 9} fit="cover">
            <video
              controls
              playsInline
              preload="none"
              width={1920}
              height={1080}
              poster="/debo-demo-poster.webp"
              aria-label="A walkthrough of one real screen recording of the Debo app, with music and sound effects and no speech. The phone screen sits on the right, and a caption on the left names each step: sign in, write a day, ask about your own life, see where each answer came from, talk to Debo, and connect your apps. A label by the phone shows when the recording is sped up or slowed down. A person signs in and writes a journal entry about lunch with Neha and a Goa trip. In a new chat they ask what to sort out before Mum visits and before the trip. Debo answers with a list of things to do and who to talk to, and shows three journal entries as sources. Then the person starts a voice call, types that they feel overwhelmed, and Debo answers kindly. Then the Apps screen, with Gmail connected. It ends on the Debo name and my.debo.life."
            >
              <source src="/debo-demo.mp4" type="video/mp4" />
              <source src="/debo-demo.webm" type="video/webm" />
              Your browser cannot play this video.
            </video>
          </AspectRatio>
        </Card>
        <Text type="supporting" as="p" color="secondary" justify="center" textWrap="balance">
          One real recording, a little over a minute. The waiting is sped up and the long pauses are cut.
        </Text>
      </VStack>
    </Band>
  );
}
