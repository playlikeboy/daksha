#!/usr/bin/env node
// Checks the rules in third_party/README.md:
//   - every folder in third_party/ has a LICENSE and a SOURCE.md;
//   - SOURCE.md names the repository, a full 40-character commit SHA and a licence;
//   - for Apache-2.0 folders, every file listed under "## Changed files" carries the
//     "Modified by Daksha" line that Apache-2.0 section 4(b) asks for;
//   - no tracked file under third_party/ (or ported code in os/) contains copyleft licence text.
//
//   node scripts/check-licenses.mjs   (from anywhere inside the repo)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Licence text, not a mention: these phrases appear in the licences themselves. */
export const COPYLEFT = [
  /GNU GENERAL PUBLIC LICENSE\s+Version \d/i,
  /GNU LESSER GENERAL PUBLIC LICENSE/i,
  /GNU AFFERO GENERAL PUBLIC LICENSE/i,
  /\bunder the terms of the GNU (Affero |Lesser )?General Public License\b/i,
  /This program is free software(:|;) you can redistribute it and\/or modify/i,
  /Mozilla Public License,? (Version|v\.?) ?2\.0/i,
  /This Source Code Form is subject to the terms of the Mozilla Public/i,
  /European Union Public Licen[cs]e/i,
  /Server Side Public License/i,
  /COMMON DEVELOPMENT AND DISTRIBUTION LICENSE/i,
  /SPDX-License-Identifier:\s*\(?\s*(A|L)?GPL/i,
  /SPDX-License-Identifier:\s*\(?\s*(MPL|EUPL|SSPL|CDDL|OSL|EPL)/i,
];
export const MODIFIED = "Modified by Daksha";

/** Problems with one third_party folder, given its files. */
export function checkFolder(name, files, read) {
  const problems = [];
  const has = (file) => files.includes(`${name}/${file}`);
  if (!has("LICENSE")) problems.push(`third_party/${name} has no LICENSE (copy the upstream licence file)`);
  if (!has("SOURCE.md")) {
    problems.push(`third_party/${name} has no SOURCE.md (see third_party/README.md)`);
    return problems;
  }
  const source = read(`${name}/SOURCE.md`);
  if (!/^Repository:\s*\S+/m.test(source)) problems.push(`third_party/${name}/SOURCE.md has no "Repository:" line`);
  if (!/^Commit:\s*[0-9a-f]{40}\s*$/m.test(source))
    problems.push(`third_party/${name}/SOURCE.md has no "Commit:" line with a full 40-character SHA`);
  const license = /^License:\s*(\S.*)$/m.exec(source)?.[1]?.trim();
  if (!license) problems.push(`third_party/${name}/SOURCE.md has no "License:" line`);
  if (!/^## Copied/m.test(source)) problems.push(`third_party/${name}/SOURCE.md has no "## Copied" section`);
  if (!/^## Changed/m.test(source)) problems.push(`third_party/${name}/SOURCE.md has no "## Changed" section`);
  if (license && /Apache-2\.0/.test(license)) {
    const section = /^## Changed files\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(source)?.[1] ?? "";
    for (const line of section.split("\n")) {
      const listed = /^- `?([^`\s]+)`?/.exec(line.trim())?.[1];
      if (!listed) continue;
      const file = `${name}/${listed}`;
      if (!files.includes(file)) problems.push(`third_party/${name}/SOURCE.md lists ${listed}, which is not in the folder`);
      else if (!read(file).includes(MODIFIED))
        problems.push(`third_party/${file} is a changed Apache-2.0 file without the "${MODIFIED}" line`);
    }
  }
  return problems;
}

/** The copyleft pattern a text matches, if any. */
export function copyleftIn(text) {
  return COPYLEFT.find((pattern) => pattern.test(text));
}

function main() {
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) => file && existsSync(path.join(root, file)));
  const inThirdParty = tracked.filter((file) => file.startsWith("third_party/")).map((file) => file.slice(12));
  const folders = [...new Set(inThirdParty.filter((file) => file.includes("/")).map((file) => file.split("/")[0]))];
  const read = (file) => readFileSync(path.join(root, "third_party", file), "utf8");
  const problems = folders.flatMap((name) => checkFolder(name, inThirdParty, read));
  // Copied content, and the folders that hold code ported from other projects.
  const scanned = tracked.filter(
    (file) =>
      file.startsWith("third_party/") ||
      file.startsWith("os/packages/skills/") ||
      file.startsWith("os/apps/server/src/engine/"),
  );
  for (const file of scanned) {
    const full = path.join(root, file);
    if (statSync(full).size > 5_000_000) continue;
    const buffer = readFileSync(full);
    if (buffer.includes(0)) continue; // binary
    const hit = copyleftIn(buffer.toString("utf8"));
    if (hit) problems.push(`${file} contains copyleft licence text (${hit.source}). It cannot be copied into Daksha.`);
  }
  if (problems.length) {
    console.error(`Licence check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`Licence check passed: ${folders.length} third_party folders, ${scanned.length} files scanned.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
