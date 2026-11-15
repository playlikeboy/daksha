import { TOUCH } from "../touch";
import { HStack, LayoutHeader } from "@astryxdesign/core/Layout";
import { Center } from "@astryxdesign/core/Center";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { START_URL } from "../links";

// Open Debo is also the way to sign in: the app has its own sign-in page.
export function SiteHeader() {
  return (
    <LayoutHeader role="banner" padding={0}>
      <Center axis="horizontal" paddingInline={5} paddingBlock={3}>
        <HStack hAlign="between" vAlign="center" gap={3} width="100%" maxWidth={1120}>
          <HStack gap={2} vAlign="center">
            <img src="/debo.svg" alt="" width={40} height={40} />
            <Text type="large" weight="bold">
              Debo
            </Text>
          </HStack>
          <HStack gap={2} vAlign="center">
            <Button label="Get the app" variant="ghost" href="#get-app" style={TOUCH} />
            <Button label="Open Debo" variant="secondary" href={START_URL} style={TOUCH} />
          </HStack>
        </HStack>
      </Center>
    </LayoutHeader>
  );
}
