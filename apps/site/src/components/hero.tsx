import { TOUCH } from "../touch";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { START_URL } from "../links";
import { Band } from "./band";
import { Phone } from "./phone";

// The three steps of the page, as cards that jump to each section.
const STEPS = [
  { number: "1", title: "Write it or say it", body: "A line, a page or a voice call.", href: "#write" },
  { number: "2", title: "Ask about it later", body: "Every answer shows its source.", href: "#ask" },
  { number: "3", title: "See what Debo knows", body: "Fix it, or make Debo forget it.", href: "#knows" },
];

export function Hero() {
  return (
    <Band id="hero">
      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={8} align="center">
        <VStack gap={6}>
          <HStack>
            <Badge variant="neutral" label="Early version, free to start" />
          </HStack>
          <VStack gap={4}>
            <Heading level={1} type="display-1" weight="bold" id="hero-title" textWrap="balance">
              Your life, remembered. Just ask.
            </Heading>
            <Text type="large" weight="normal" as="p" color="secondary" textWrap="pretty">
              Debo is a friendly assistant that remembers your life. Write things down or say them out loud.
              Later, ask about your own past and plans, and see the entry each answer came from.
            </Text>
          </VStack>
          <HStack gap={3} wrap="wrap">
            <Button label="Open Debo" variant="primary" size="lg" href={START_URL} style={TOUCH} />
            <Button label="Watch the film" variant="secondary" size="lg" href="#demo" style={TOUCH} />
          </HStack>
          <Text type="supporting" as="p" color="secondary">
            Free in any web browser. Some parts are still being built, and this page says which.{" "}
            <Link href="#get-app" label="Get the app for your phone" hasUnderline>
              Get the app for your phone
            </Link>
          </Text>
        </VStack>
        <Card variant="red" padding={6}>
          <VStack hAlign="center">
            <Phone
              src="/shots/chat-light.webp"
              width={780}
              height={1688}
              maxWidth={300}
              alt="The Debo app. Debo answers a question about getting ready for Mum's visit and a Goa trip: clean the spare room before Mum arrives, talk to Neha and Aarav, and it says plainly that the journal does not give Mum's arrival date."
              isPriority
            />
          </VStack>
        </Card>
      </Grid>
      <nav aria-label="How Debo works">
        <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={4}>
          {STEPS.map((step) => (
            <ClickableCard key={step.href} href={step.href} label={`Step ${step.number}: ${step.title}`} padding={5}>
              <VStack gap={1}>
                <Text type="label" weight="semibold" color="secondary">
                  Step {step.number}
                </Text>
                <Text as="p" type="large" weight="bold">
                  {step.title}
                </Text>
                <Text as="p" type="body" color="secondary">
                  {step.body}
                </Text>
              </VStack>
            </ClickableCard>
          ))}
        </Grid>
      </nav>
    </Band>
  );
}
