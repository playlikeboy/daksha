// The app's frame: the slim see-through bar at the top and the tabs at the bottom.
// Screens read `top` so their first line starts below the bar while the rest scrolls
// under it. The chat reports its composer's height so the floating call bubble can sit
// above it instead of covering the send button.
import { createContext, useContext, useEffect, useRef } from "react";
import { Platform, View, type ViewProps } from "react-native";
import { brandColors } from "./brand-tokens";

/**
 * The top bar's fill: the page colour (a brand token) with an alpha channel, so it is
 * still a theme colour. Clear on the web, where what scrolls under the bar fades out
 * instead (FadeTop); nearly solid on phones, which have no fade or blur here.
 */
export const frost = (() => {
  const alpha = Platform.OS === "web" ? 0 : 0.94;
  const byte = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${brandColors.paper}${byte}`;
})();

export interface Chrome {
  /** Height of the top bar, including the safe area. Content starts this far down. */
  top: number;
  /** Space the floating tab bar takes at the bottom of a phone (0 on a wide screen). */
  bottom?: number;
  /** The chat says whether it has no messages yet, so the bar can leave the face to it. */
  setChatEmpty?: (empty: boolean) => void;
  /** The chat says when its message box has the caret, so the phone's tabs can step aside. */
  setTyping?: (typing: boolean) => void;
  /** The chat calls this with its composer's height (0 when it goes away). */
  setComposerHeight?: (height: number) => void;
}

export const ChromeContext = createContext<Chrome>({ top: 0 });

export function useChrome() {
  return useContext(ChromeContext);
}

/** Phone and desktop heights of the top bar, not counting the safe area. */
export const topBarHeight = { phone: 64, desktop: 76, home: 80 } as const;

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
    node.style.setProperty("backdrop-filter", "blur(18px) saturate(1.4)");
    node.style.setProperty("-webkit-backdrop-filter", "blur(18px) saturate(1.4)");
  }, []);
  return <View ref={ref} style={style} {...props} />;
}

/**
 * On the web, what scrolls up under the see-through top bar fades out instead of sliding
 * behind it, so the bar needs no fill and the page's glows show all the way up. `top` is
 * the bar's height; 0 turns the fade off (a notice sits below the bar instead).
 */
export function FadeTop({ top, style, ...props }: ViewProps & { top: number }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node?.style) return;
    const mask = top
      ? `linear-gradient(to bottom, transparent 0, transparent ${Math.round(top * 0.6)}px, black ${top + 12}px)`
      : "none";
    node.style.setProperty("mask-image", mask);
    node.style.setProperty("-webkit-mask-image", mask);
  }, [top]);
  return <View ref={ref} style={style} {...props} />;
}
