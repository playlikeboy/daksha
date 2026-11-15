import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { DEMO_VIDEO_MP4, DEMO_VIDEO_POSTER } from "../config";

// The demo video. With no link in config.ts it shows a plain note instead of a broken player.
export function DemoVideo() {
  if (!DEMO_VIDEO_MP4) {
    return (
      <Card variant="muted" padding={6}>
        <VStack gap={2}>
          <Heading level={3}>Demo video</Heading>
          <Text as="p" type="large" weight="normal" color="secondary">
            The demo video is being recorded. Ask us for a walkthrough, or try the app yourself on the Try it page.
          </Text>
        </VStack>
      </Card>
    );
  }
  return (
    <Card padding={2} elevation="high">
      <video
        controls
        preload="metadata"
        playsInline
        poster={DEMO_VIDEO_POSTER || undefined}
        width={1280}
        height={720}
        aria-label="The Debo launch film, an animation of what the app does: write a day, ask about it with sources, fix what Debo knows, talk by voice, people in your life, and a yes before anything changes in your apps. Music and sound effects, no speech."
      >
        <source src={DEMO_VIDEO_MP4} type="video/mp4" />
        Your browser cannot play this video. Open the app on the Try it page instead.
      </video>
    </Card>
  );
}
