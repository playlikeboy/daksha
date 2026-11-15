import { VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Card } from "@astryxdesign/core/Card";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Band } from "./band";
import { Phone } from "./phone";
import { SectionHead } from "./section-head";

const STEPS = [
  { title: "Read it", body: "Every memory is one plain sentence, and it shows the entry it came from." },
  { title: "Fix it", body: "If Debo got something wrong, correct it." },
  { title: "Forget it", body: "If you do not want Debo to keep something, forget it." },
];

export function Knows() {
  return (
    <Band id="knows" variant="muted">
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={8} align="center">
        <VStack gap={6}>
          <SectionHead
            id="knows"
            eyebrow="Step 3"
            title="See what Debo knows. Fix it, or forget it."
            lead="After you save an entry, Debo picks out the lasting facts in it, like people, places and plans. They all live on one page that you can open any time."
          />
          <VStack gap={3}>
            {STEPS.map((step) => (
              <Card key={step.title} padding={5}>
                <VStack gap={1}>
                  <Heading level={3}>{step.title}</Heading>
                  <Text as="p" type="large" weight="normal" color="secondary">
                    {step.body}
                  </Text>
                </VStack>
              </Card>
            ))}
          </VStack>
        </VStack>
        <VStack hAlign="center">
          <Phone
            src="/shots/knows-light.webp"
            width={780}
            height={1688}
            maxWidth={320}
            alt="The What Debo knows page. A memory reads: You plan to water them every second morning while the weather stays warm. It shows the source chip Journal, 11 November and the buttons Fix this memory and Forget this memory."
          />
        </VStack>
      </Grid>
    </Band>
  );
}
