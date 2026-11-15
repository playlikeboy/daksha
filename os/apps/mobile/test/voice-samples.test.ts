import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { VOICES } from "../../server/src/talk-settings.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/voice-samples.ts"), "utf8");

test("every voice on offer has its own sample file, and no voice shares one", () => {
  const files = new Set<string>();
  for (const voice of VOICES) {
    const line = source.split("\n").find((l) => l.includes(`"${voice.id}"`));
    assert.ok(line, `${voice.name} has no sample in voice-samples.ts`);
    const file = line.match(/require\("\.\.\/(assets\/voices\/[a-z]+\.mp3)"\)/)?.[1];
    assert.ok(file, `${voice.name}'s sample line has no mp3`);
    assert.ok(existsSync(path.join(root, file)), `${file} is missing`);
    assert.ok(!files.has(file), `${file} is used for two voices`);
    files.add(file);
  }
});
