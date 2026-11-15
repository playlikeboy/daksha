import { VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { Band } from "./band";
import { Phone } from "./phone";
import { SectionHead } from "./section-head";

export function Apps() {
  return (
    <Band id="apps">
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={8} align="center">
        <VStack hAlign="center">
          <Phone
            src="/shots/apps-light.webp"
            width={780}
            height={1688}
            maxWidth={320}
            alt="The Apps screen in Debo. A search box sits above Debo's computer under Connected. Below, under Connect your apps, a list of apps starts with Gmail, marked Connected."
          />
        </VStack>
        <VStack gap={5} hAlign="start">
          <SectionHead
            id="apps"
            eyebrow="Connect"
            badge={<Badge variant="info" label="New, early version" />}
            title="Connect your apps"
            lead="Connect places like your mail and calendar, so Debo can answer from more than your journal. You sign in on the app's own page, and Debo never sees your password. This part is new and has had little real-world testing."
          />
          <Text as="p" type="large" weight="normal" color="secondary" textWrap="pretty">
            Once you connect an app, Debo can look things up in it when you ask. Before it sends, posts, pays,
            deletes or changes anything outside Debo, it waits for a clear yes from you on the screen.
          </Text>
        </VStack>
      </Grid>
    </Band>
  );
}
