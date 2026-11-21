// Changed by Daksha (2026-11-21): copied from OpenMausBot packages/phone-protocol/src/app-triggers.ts at
// da592ee7251ae853e33f6d837433fd144ca3e333 (Apache-2.0, see ../LICENSE and ../SOURCE.md).
// Changes: only the plain filter, its limit and the Gmail search pieces are kept; the wire
// shapes for OpenMausBot's bots, routines and live frames are left out. "OpenMausBot" in a
// comment is now "Daksha".

/** Plain words a person or bot gives. Gmail turns them into its own search, so other mail never arrives at all; other
 * apps match them, case-insensitively, against the event's fields. */
export interface AppTriggerFilter {
  from?: string;
  /** The subject (or title) contains this. */
  subject?: string;
  label?: string;
  /** Anywhere in the event. */
  text?: string;
}

export const APP_FILTER_MAX = 200;
export const GMAIL_APP = "gmail";
export const GMAIL_NEW_MESSAGE = "GMAIL_NEW_GMAIL_MESSAGE";

const quoted = (value: string) => {
  const clean = value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  return /\s/.test(clean) ? `"${clean}"` : clean;
};

/** Gmail search syntax for a plain filter: from:, subject:, label: and free words, so filtering happens at the source. */
export function gmailSearchQuery(filter: AppTriggerFilter | undefined): string {
  if (!filter) return "";
  return [
    filter.from && `from:${quoted(filter.from)}`,
    filter.subject && `subject:(${filter.subject.replace(/[()\\]/g, " ").replace(/\s+/g, " ").trim()})`,
    filter.label && `label:${quoted(filter.label).replace(/\s+/g, "-")}`,
    filter.text && quoted(filter.text),
  ].filter(Boolean).join(" ");
}

/** Whether Composio filters this app's events itself from the plain filter (its config), or Daksha does on arrival. */
export function filtersAtSource(app: string): boolean {
  return app === GMAIL_APP;
}
