// The app's frame: the slim see-through bar at the top and the tabs at the bottom.
// Screens read `top` so their first line starts below the bar while the rest scrolls
// under it. The chat reports its composer's height so the floating call bubble can sit
// above it instead of covering the send button.
import { createContext, useContext, useEffect, useRef } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { brandColors } from "./brand-tokens";

/**
 * The top bar's fill: the page colour (a brand token) with an alpha channel, so it is
 * still a theme colour. See-through enough on the web to show the blur; nearly solid on
 * phones, which have no blur here.
 */
export const frost = (() => {
  const alpha = Platform.OS === "web" ? 0.8 : 0.96;
  const byte = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${brandColors.paper}${byte}`;
})();

export interface Chrome {
  /** Height of the top bar, including the safe area. Content starts this far down. */
  top: number;
  /** The chat calls this with its composer's height (0 when it goes away). */
  setComposerHeight?: (height: number) => void;
}

export const ChromeContext = createContext<Chrome>({ top: 0 });

export function useChrome() {
  return useContext(ChromeContext);
}

/** Phone and desktop heights of the top bar, not counting the safe area. */
export const topBarHeight = { phone: 56, desktop: 64 } as const;

/**
 * A View that frosts what scrolls under it. On the web this is a real backdrop blur; on
 * phones (no blur library is installed) the surface is simply mostly opaque, so text
 * under it never shows through enough to be confusing.
 */
export function Frosted({ style, ...props }: ViewProps) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    // react-native-web hands back the DOM node. Its style types do not know backdrop-filter.
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.style) return;
    node.style.setProperty("backdrop-filter", "blur(16px)");
    node.style.setProperty("-webkit-backdrop-filter", "blur(16px)");
  }, []);
  return <View ref={ref} style={style} {...props} />;
}
