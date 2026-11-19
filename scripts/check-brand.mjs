#!/usr/bin/env node
// Fails if the old brand is still in the repo: the word "Debo" (or "DEBO" on its own) or a
// debo.life address, in any tracked text file. Debo was renamed Daksha; see docs/RENAME.md.
//
//   node scripts/check-brand.mjs        (from anywhere inside the repo)
//
// Some places must keep the old name, for example the old web addresses that still work.
// They are listed in the `brand-allowlist` block in docs/RENAME.md, one per line:
//   path                 every line in that file (or folder, when the path ends in "/") is allowed
//   path | expression    only lines matching the regular expression are allowed there
// A line that contains "brand-check: keep" is always allowed.
//
// Code names like DeboService, @debo/db, DEBO_OS_* and the "debo" character id are not the
// whole word "Debo", so this check does not see them. They are kept on purpose (docs/RENAME.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const KEEP = "brand-check: keep";
const OLD = [/\bDebo\b/, /\bDEBO\b/, /debo\.life/];

/** The allowlist from docs/RENAME.md: [{ path, folder, match }]. */
export function readAllowlist(markdown) {
  const block = /```brand-allowlist\n([\s\S]*?)```/.exec(markdown);
  if (!block) throw new Error("docs/RENAME.md has no ```brand-allowlist block.");
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [file, ...rest] = line.split(" | ");
      const expression = rest.join(" | ").trim();
      return { path: file.trim(), folder: file.trim().endsWith("/"), match: expression ? new RegExp(expression) : null };
    });
}

/** The lines in one file that still carry the old brand and are not allowed. */
export function findOldBrand(file, text, allowlist) {
  const rules = allowlist.filter((rule) => (rule.folder ? file.startsWith(rule.path) : file === rule.path));
  if (rules.some((rule) => !rule.match)) return [];
  const found = [];
  text.split("\n").forEach((line, index) => {
    if (!OLD.some((pattern) => pattern.test(line))) return;
    if (line.includes(KEEP)) return;
    if (rules.some((rule) => rule.match.test(line))) return;
    found.push({ file, line: index + 1, text: line.trim().slice(0, 160) });
  });
  return found;
}

function main() {
  const allowlist = readAllowlist(readFileSync(path.join(root, "docs/RENAME.md"), "utf8"));
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const found = [];
  for (const file of files) {
    let buffer;
    try {
      buffer = readFileSync(path.join(root, file));
    } catch {
      continue; // deleted in the working tree, or a folder link
    }
    if (buffer.includes(0)) continue; // binary
    found.push(...findOldBrand(file, buffer.toString("utf8"), allowlist));
  }
  if (found.length === 0) {
    console.log(`Brand check passed: no "Debo" text outside the allowlist in ${files.length} files.`);
    return;
  }
  for (const hit of found) console.log(`${hit.file}:${hit.line}: ${hit.text}`);
  console.error(
    `\nBrand check failed: ${found.length} line(s) still say Debo or debo.life.` +
      `\nRename them to Daksha (docs/RENAME.md has a recipe), or, if a line must keep the old name,` +
      `\nadd "${KEEP}" to it or an entry to the brand-allowlist block in docs/RENAME.md.`,
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
