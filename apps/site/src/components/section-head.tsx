import type { ReactNode } from "react";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";

type SectionHeadProps = {
  /** The band's id. The heading gets id={`${id}-title`}, which the Band uses as its name. */
  id: string;
  /** A short word or two above the heading, like "Step 1" or "Your data". */
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  /** A status badge, like "New, early version", shown beside the eyebrow. */
  badge?: ReactNode;
  align?: "start" | "center";
};

// The same header for every section, so the page reads in one rhythm:
// a small label, a big heading, then one or two plain sentences.
export function SectionHead({ id, eyebrow, title, lead, badge, align = "start" }: SectionHeadProps) {
  const isCentered = align === "center";
  return (
    <VStack gap={3} maxWidth={isCentered ? 640 : 600} hAlign={isCentered ? "center" : "start"}>
      <HStack gap={2} vAlign="center" wrap="wrap" hAlign={isCentered ? "center" : "start"}>
        <Text type="label" weight="semibold" color="secondary">
          {eyebrow}
        </Text>
        {badge}
      </HStack>
      <Heading
        level={2}
        type="display-2"
        weight="bold"
        id={`${id}-title`}
        justify={isCentered ? "center" : undefined}
        textWrap="balance"
      >
        {title}
      </Heading>
      {lead ? (
        <Text
          type="large"
          weight="normal"
          as="p"
          color="secondary"
          justify={isCentered ? "center" : undefined}
          textWrap={isCentered ? "balance" : "pretty"}
        >
          {lead}
        </Text>
      ) : null}
    </VStack>
  );
}
