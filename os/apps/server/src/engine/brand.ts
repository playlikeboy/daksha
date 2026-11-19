/** The product's name, and the assistant's name when the person has not chosen one. */
export const BRAND = "Daksha";

/**
 * The assistant's default name before the rename (docs/RENAME.md). Accounts made then have it
 * saved as their assistant's name. Nothing in the database is rewritten: it is read as BRAND.
 */
export const OLD_DEFAULT_NAME = "Debo"; // brand-check: keep

/** The name to show and speak. A saved old default reads as the new name; any other name stays. */
export function assistantNameOf(saved: string | undefined): string {
  const name = saved?.trim();
  if (!name || name === OLD_DEFAULT_NAME) return BRAND;
  return saved as string;
}
