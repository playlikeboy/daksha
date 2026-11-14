import { VStack } from "@astryxdesign/core/Layout";
import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Band } from "./band";

// A short film cut from real screen recordings of the live app, made with the demo account
// (source in video/launch). Below it, the raw recording it was cut from.
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
          A short film made from the real app. You write down a day, ask a big question about your own life, and
          see the journal entries each answer came from. Then you talk to Debo, look at what it knows, and see the
          apps that are coming. There is no sound, and every step has words on screen.
        </Text>
      </VStack>
      <VStack hAlign="center" gap={3}>
        <Card padding={1.5} elevation="high" width="100%" maxWidth={960}>
          <AspectRatio ratio={16 / 9} fit="cover">
            <video
              controls
              playsInline
              preload="none"
              muted
              width={1920}
              height={1080}
              poster="/debo-launch-poster.webp"
              aria-label="A short film about Debo with no sound. It opens with the words You wrote it down somewhere, but where? The red tomato Debo appears. Then real screen recordings of the app: writing a journal entry, asking what to sort out before Mum visits and before a trip, an answer that lists the journal entries it came from, a voice call where Debo answers a tired message kindly, the What Debo knows page with Fix and Forget buttons, and the Apps screen, marked coming soon. It ends on the Debo name and my.debo.life."
            >
              <source src="/debo-launch.mp4" type="video/mp4" />
              <source src="/debo-launch.webm" type="video/webm" />
              Your browser cannot play this video.
            </video>
          </AspectRatio>
        </Card>
        <Text type="supporting" as="p" color="secondary" justify="center" textWrap="balance">
          Cut from recordings of the live app with a demo account. All the names and entries are made-up sample text.
        </Text>
      </VStack>
      <VStack gap={3} hAlign="center">
        <Heading level={3}>The full walkthrough, unedited</Heading>
        <Card padding={1.5} elevation="high" width="100%" maxWidth={360}>
          <AspectRatio ratio={468 / 1012} fit="cover">
            <video
              controls
              playsInline
              preload="none"
              muted
              width={468}
              height={1012}
              poster="/debo-demo-poster.webp"
              aria-label="The unedited screen recording of the Debo app. A person signs in and writes a journal entry about lunch with Neha and a Goa trip. In a new chat they ask what to sort out before Mum visits and before the trip. Debo answers with a list of things to do and who to talk to, and shows three journal entries as sources. Then the person starts a voice call, types that they feel overwhelmed, and Debo answers kindly. The video ends on the Apps screen. There is no sound."
            >
              <source src="/debo-demo.mp4" type="video/mp4" />
              <source src="/debo-demo.webm" type="video/webm" />
              Your browser cannot play this video.
            </video>
          </AspectRatio>
        </Card>
        <Text type="supporting" as="p" color="secondary" justify="center" textWrap="balance">
          The raw recording, under two minutes.
        </Text>
      </VStack>
    </Band>
  );
}
