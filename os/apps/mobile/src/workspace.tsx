import { createContext, useContext } from "react";
import type {
  ActionProposal,
  Artifact,
  BrowserSession,
  CalendarEvent,
  EmailDraft,
  EventDraft,
  Mail,
  Section,
  Workspace,
} from "../../../packages/domain/src";
import type { CustomAvatar } from "../../../packages/domain/src/avatar";
import type { FuseApi } from "./api";
import type { Route, RouteParams } from "./routes";
export type Detail =
  | { type: "mail"; mail: Mail }
  | { type: "email"; draft?: Partial<EmailDraft> & { id?: string } }
  | { type: "event"; event?: CalendarEvent; draft?: EventDraft; neighbors?: CalendarEvent[] }
  | { type: "file"; file: Artifact }
  | { type: "browser"; browser: BrowserSession }
  | { type: "review"; action: ActionProposal }
  | { type: "task"; taskId: string }
  | { type: "delegate"; goalId?: string; milestoneId?: string }
  | { type: "notifications" }
  | { type: "computer" }
  | { type: "talk-settings" }
  /**
   * "Make your own" face, or edit a saved one. `onSaved` gets the saved face (a custom
   * person's card uses it to link the face by id). With `pickOnly`, saving never changes
   * who the person talks to.
   */
  | { type: "avatar-builder"; avatarId?: string; onSaved?: (avatar: CustomAvatar) => void; pickOnly?: boolean }
  | { type: "menu" };
export interface WorkspaceContextValue {
  workspace: Workspace;
  api: FuseApi;
  section: Section;
  /** Where we are, including a conversation or journal entry named in the address. */
  route: Route | null;
  navigate: (section: Section, params?: RouteParams) => void;
  refresh: () => Promise<void>;
  open: (detail: Detail) => void;
  close: () => void;
  notify: (message: string) => void;
  ask: (prompt: string) => void;
}
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace is unavailable");
  return context;
}
