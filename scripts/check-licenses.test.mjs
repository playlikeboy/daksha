// node --test scripts/check-licenses.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkFolder, copyleftIn } from "./check-licenses.mjs";

const SHA = "aeb5a071069dbd85d85f2c8d44337f16df29d475";
const source = (license, extra = "") =>
  `# Source\n\nRepository: https://example.com/x\nCommit: ${SHA}\nLicense: ${license}\n\n## Copied\n\n- a.ts\n\n## Changed\n\nSome.\n${extra}`;

test("a folder needs a LICENSE and a SOURCE.md", () => {
  assert.deepEqual(checkFolder("x", ["x/LICENSE", "x/SOURCE.md"], () => source("MIT")), []);
  assert.match(checkFolder("x", ["x/SOURCE.md"], () => source("MIT")).join(), /no LICENSE/);
  assert.match(checkFolder("x", ["x/LICENSE"], () => "").join(), /no SOURCE\.md/);
});

test("SOURCE.md needs the repository, a full SHA, the licence and both sections", () => {
  const bad = checkFolder("x", ["x/LICENSE", "x/SOURCE.md"], () => "Repository: r\nCommit: abc123\n").join("\n");
  assert.match(bad, /40-character SHA/);
  assert.match(bad, /License:/);
  assert.match(bad, /## Copied/);
  assert.match(bad, /## Changed/);
});

test("a changed Apache-2.0 file must say it was modified", () => {
  const files = ["x/LICENSE", "x/SOURCE.md", "x/a.ts"];
  const listed = source("Apache-2.0", "\n## Changed files\n\n- `a.ts`\n");
  const without = checkFolder("x", files, (f) => (f === "x/SOURCE.md" ? listed : "export const a = 1;\n"));
  assert.match(without.join(), /without the "Modified by Daksha" line/);
  const marked = checkFolder("x", files, (f) =>
    f === "x/SOURCE.md" ? listed : "// Modified by Daksha (Shaswat Raj): renamed. Original: a.ts.\n",
  );
  assert.deepEqual(marked, []);
  const missing = checkFolder("x", ["x/LICENSE", "x/SOURCE.md"], () => listed);
  assert.match(missing.join(), /not in the folder/);
  // MIT folders have no such duty.
  assert.deepEqual(checkFolder("x", files, (f) => (f === "x/SOURCE.md" ? source("MIT", "\n## Changed files\n\n- a.ts\n") : "")), []);
});

test("copyleft licence text is caught, a passing mention is not", () => {
  assert.ok(copyleftIn("                    GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007"));
  assert.ok(copyleftIn("// SPDX-License-Identifier: AGPL-3.0-only"));
  assert.ok(copyleftIn("This Source Code Form is subject to the terms of the Mozilla Public\n License, v. 2.0."));
  assert.equal(copyleftIn("- wger: https://wger.de/api/v2/ — AGPL-3.0, exercise data is CC-BY-SA 3.0"), undefined);
  assert.equal(copyleftIn("MIT License\n\nCopyright (c) 2025 Nous Research"), undefined);
});
