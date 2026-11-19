// Text and TextInput with Debo's body font (Figtree) already set, so every line in the app
// uses the brand font without each screen remembering to. Headings set the heading font
// through their style (s.title, s.heading, s.pageTitle in ui.tsx), which wins over this.
// Import Text and TextInput from here, not from "react-native" (a test checks).
import { type ComponentRef, createContext, forwardRef, useContext } from "react";
import {
  Platform,
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
  StyleSheet,
} from "react-native";
import { fonts, webFontStack } from "./brand-tokens";

/** The family name to use in a style: a CSS stack on the web, one family on phones. */
export const fontFace = {
  body: Platform.OS === "web" ? webFontStack.body : fonts.body,
  heading: Platform.OS === "web" ? webFontStack.heading : fonts.heading,
} as const;

const base = StyleSheet.create({ body: { fontFamily: fontFace.body } });

// Text inside Text inherits its parent's font, so only the outer one sets the default.
// Without this, a bold word inside a heading would switch back to the body font.
const InsideText = createContext(false);

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function Text(props, ref) {
  const nested = useContext(InsideText);
  if (nested) return <NativeText ref={ref} {...props} />;
  return (
    <InsideText.Provider value>
      <NativeText ref={ref} {...props} style={[base.body, props.style]} />
    </InsideText.Provider>
  );
});

export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(
  function TextInput(props, ref) {
    return <NativeTextInput ref={ref} {...props} style={[base.body, props.style]} />;
  },
);
