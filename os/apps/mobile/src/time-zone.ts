/**
 * The device's time zone, sent with every request so Debo's "today" is the person's
 * today. The server keeps the last one for reminders (see apps/server/src/time-zone.ts).
 */
export const TIME_ZONE_HEADER = "X-Time-Zone";

/** The IANA zone the device is set to, such as "Asia/Kolkata", or "" when it cannot tell. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** The header to add to a request: empty when the zone is not known. */
export function timeZoneHeaders(zone = deviceTimeZone()): Record<string, string> {
  return zone ? { [TIME_ZONE_HEADER]: zone } : {};
}
