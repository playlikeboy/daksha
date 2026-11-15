// A picture Debo made (the make_image tool), shown in the chat. The tool result names the picture;
// a fresh short-lived link is asked for each time, so it shows again when the thread is opened later.
import { ImageIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { z } from "zod";
import { errorText } from "./debo-api";
import { Card, colors, ErrorNotice, radius, s } from "./ui";
import { useWorkspace } from "./workspace";

const Made = z.object({ status: z.literal("made"), imageId: z.string().uuid(), shape: z.enum(["square", "wide", "tall"]) });
const Failed = z.object({ status: z.literal("failed"), error: z.string() });
const Link = z.object({ url: z.string().url(), prompt: z.string() });

const RATIO = { square: 1, wide: 16 / 9, tall: 9 / 16 } as const;

export function ImageToolCard({ result, loading }: { result: unknown; loading: boolean }) {
  const { api } = useWorkspace();
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = undefined;
    }
  }
  const made = Made.safeParse(value);
  const failed = Failed.safeParse(value);
  const imageId = made.success ? made.data.imageId : undefined;
  const [link, setLink] = useState<z.infer<typeof Link>>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!imageId) return;
    let live = true;
    api
      .request<unknown>(`/api/images/${imageId}`)
      .then((answer) => {
        const parsed = Link.safeParse(answer);
        if (!live) return;
        if (parsed.success) setLink(parsed.data);
        else setError("I couldn't open this picture.");
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [api, imageId]);

  const title = loading
    ? "Making a picture…"
    : failed.success
      ? "Couldn't make the picture"
      : made.success
        ? "Picture"
        : "No picture came back";
  return (
    <Card style={{ padding: 14, gap: 10, backgroundColor: colors.subtle, maxWidth: 440, width: "100%" }}>
      <View style={[s.row, { gap: 10 }]}>
        {loading ? <ActivityIndicator size="small" color={colors.blueDark} /> : <ImageIcon size={18} color={colors.blueDark} />}
        <Text style={s.text}>{title}</Text>
      </View>
      {failed.success ? <Text style={s.muted}>{failed.data.error}</Text> : null}
      {link && made.success ? (
        <Image
          source={{ uri: link.url }}
          accessible
          accessibilityLabel={`Picture Debo made: ${link.prompt}`}
          resizeMode="cover"
          style={{ width: "100%", aspectRatio: RATIO[made.data.shape], borderRadius: radius.container, backgroundColor: colors.line }}
        />
      ) : made.success && !error ? (
        <ActivityIndicator size="small" color={colors.blueDark} />
      ) : null}
      <ErrorNotice error={error} />
    </Card>
  );
}
