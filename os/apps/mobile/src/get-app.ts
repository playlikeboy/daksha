// "Get the app": a quiet link to the download section of the landing page.
// Daksha shows no install pop-up or banner of its own. This link is shown only in a web browser,
// and never inside the installed app or the phone builds, where the person already has the app.
import { Linking, Platform } from "react-native";

export const GET_APP_URL = "https://about.daksha.life/#get-app";

/** True when Daksha runs as an installed app (its own window) or as a phone build. */
export function isInstalledApp(): boolean {
  if (Platform.OS !== "web") return true;
  if (typeof window === "undefined") return false;
  try {
    const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];
    if (modes.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)) return true;
    // iPhone and iPad, added to the home screen.
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function openGetApp() {
  void Linking.openURL(GET_APP_URL);
}
