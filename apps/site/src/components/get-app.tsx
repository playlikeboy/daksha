import { TOUCH } from "../touch";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ANDROID_APK_URL, RELEASES_URL, START_URL } from "../links";
import { Band } from "./band";
import { SectionHead } from "./section-head";

export function GetApp() {
  return (
    <Band id="get-app">
      <SectionHead
        id="get-app"
        eyebrow="On your phone"
        title="Get the app"
        lead="Debo works in any web browser, on a computer or a phone. There is also an early app for Android phones."
        align="center"
      />
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={5}>
        <Card padding={6} elevation="low">
          <VStack gap={3} hAlign="start">
            <Badge variant="warning" label="Early test build" />
            <Heading level={3}>
              Android
            </Heading>
            <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
              Download the app file and open it on your phone. Android will ask you to allow installs from
              your browser. It is not on Google Play yet, and nobody has tried it on a real phone yet, so
              expect rough edges.
            </Text>
            <HStack gap={3} wrap="wrap">
              <Button label="Download for Android" variant="primary" size="lg" href={ANDROID_APK_URL} style={TOUCH} />
              <Button label="All versions" variant="secondary" size="lg" href={RELEASES_URL} style={TOUCH} />
            </HStack>
          </VStack>
        </Card>
        <Card padding={6} elevation="low">
          <VStack gap={3} hAlign="start">
            <Badge variant="neutral" label="Not available yet" />
            <Heading level={3}>
              iPhone
            </Heading>
            <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
              The iPhone app is not available yet. Debo works in your phone&apos;s browser at my.debo.life. In
              Safari, tap Share, then Add to Home Screen, and it sits on your home screen like an app.
            </Text>
            <HStack gap={3} wrap="wrap">
              <Button label="Open Debo in the browser" variant="secondary" size="lg" href={START_URL} style={TOUCH} />
            </HStack>
          </VStack>
        </Card>
      </Grid>
    </Band>
  );
}
