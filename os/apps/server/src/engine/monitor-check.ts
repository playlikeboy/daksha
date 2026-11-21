/** One check of a watched page (a monitor task run), split out of service.ts. */
import { createHash } from "node:crypto";
import type { AgentTask, Monitor } from "../../../../packages/domain/src/agent.ts";
import { countPageDiff, describePageDiff, diffPage, pageLines, withoutRelativeTimes } from "./page-diff.ts";
import type { AgentService } from "./service.ts";
import { LostLeaseError, type TaskContext } from "./worker.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const date = () => new Date().toISOString();
/** A change watch's last saved page: its hash, relative-time-free fingerprint and lines. */
export type MonitorPage = { id: string; hash?: string; timelessHash?: string; lines: string[] };

export async function checkMonitor(
  service: AgentService,
  owner: string,
  task: AgentTask,
  ctx: TaskContext,
): Promise<Partial<AgentTask>> {
  const monitor = await service.db.get<Monitor>(owner, "monitors", String(task.input.monitorId));
  if (!monitor) throw new Error("Monitor not found");
  if (monitor.status !== "active")
    return { status: monitor.status === "paused" ? "paused" : "cancelled" };
  let observation: { url: string; title: string; text: string; sessionId?: string };
  if (monitor.url === "sample://availability") {
    if (service.config.mode !== "sample") throw new Error("Sample source unavailable");
    const page = await service.db.get<{ text: string }>(owner, "sample-pages", "availability");
    observation = {
      url: monitor.url,
      title: "Sample dinner availability",
      text: page?.text ?? "No tables available. Check again later.",
    };
  } else {
    await ctx.guard();
    observation = await service.browser.observe(
      owner,
      monitor.url,
      typeof task.state.sessionId === "string" ? task.state.sessionId : undefined,
      ctx.signal,
    );
  }
  const text = observation.text.replace(/\s+/g, " ").trim();
  const currentHash = hash(text);
  const previousHash =
    typeof task.state.lastHash === "string" ? task.state.lastHash : monitor.lastHash;
  // Collapse whitespace in the watched text the same way as in the page text, so a
  // trailing space from a phone keyboard or a line break in the value still matches.
  const wanted = monitor.value.replace(/\s+/g, " ").trim().toLowerCase();
  const matched =
    monitor.condition === "change"
      ? Boolean(previousHash && previousHash !== currentHash)
      : monitor.condition === "contains"
        ? text.toLowerCase().includes(wanted)
        : matchesPrice(text, Number(monitor.value));
  const previouslyMatched = Boolean(task.state.matched);
  // For change watches, keep the page lines and a relative-time-free fingerprint of the whole text.
  const change = monitor.condition === "change";
  const lines = change ? pageLines(observation.text) : [];
  const timelessHash = change ? hash(withoutRelativeTimes(text)) : undefined;
  const savedPage =
    matched && change
      ? await service.db.get<MonitorPage>(owner, "monitor-pages", monitor.id)
      : undefined;
  // Saved lines can run ahead of a lost task outcome; use them only for the committed baseline.
  const baseline = savedPage?.hash === previousHash ? savedPage : undefined;
  // Only relative times changed anywhere on the page ("3 minutes ago"): keep watching quietly.
  const quiet = Boolean(baseline?.timelessHash && baseline.timelessHash === timelessHash);
  const shouldNotify =
    matched && !quiet && (monitor.condition === "change" || !previouslyMatched);
  const diff = baseline && shouldNotify ? diffPage(baseline.lines, lines) : undefined;
  // Empty when the change is past the saved lines; the alert then quotes the page instead.
  const changes = diff ? describePageDiff(diff) : "";
  // A notification-worthy observation is a new event, even when the page text is
  // identical to an earlier one (a change back to a seen state, or a condition that
  // cleared and reappeared). Commit its sequence with the outcome so publication
  // retries still deduplicate on the same saved notice key.
  const alertSequence = Number(task.state.alertSequence ?? 0) + (shouldNotify ? 1 : 0);
  const nextCheckAt = new Date(Date.now() + monitor.intervalMinutes * 60000).toISOString();
  await ctx.guard();
  // Worker lease is checked before each publication; monitor control also invalidates that lease.
  const savedMonitor = await service.db.compareAndSwap(
    owner,
    "monitors",
    monitor.id,
    { status: "active", checks: monitor.checks },
    {
      checks: monitor.checks + 1,
      lastCheckedAt: date(),
      lastHash: currentHash,
      lastValue: text.slice(0, 1000),
      nextCheckAt,
      error: null,
    },
  );
  if (!savedMonitor) throw new LostLeaseError();
  if (change)
    await service.db.put(owner, "monitor-pages", {
      id: monitor.id,
      hash: currentHash,
      timelessHash,
      lines,
    });
  await ctx.event(
    "observation",
    previousHash ? "Checked for changes" : "Saved the first observation",
    text.slice(0, 1000),
  );
  if (shouldNotify) {
    await ctx.guard();
    await ctx.event("result", "A meaningful change was found", changes || text.slice(0, 500));
  }
  const count = diff ? countPageDiff(diff) : "";
  return {
    status: "scheduled",
    nextRunAt: nextCheckAt,
    result: shouldNotify
      ? count
        ? `Change found: ${count}. A notification is ready.`
        : "Change found. A notification is ready."
      : "Watching. I'll check again on schedule.",
    state: {
      ...task.state,
      sessionId: observation.sessionId,
      lastHash: currentHash,
      resumingMonitor: false,
      matched,
      alertSequence,
      failures: 0,
      notice: shouldNotify
        ? {
            title: monitor.title,
            body: changes
              ? `Changed at ${observation.url}\n${changes}`
              : `Condition met at ${observation.url}: ${text.slice(0, 240)}`,
            key: `monitor:${monitor.id}:${alertSequence}:${currentHash}`,
          }
        : null,
    },
    error: null,
    evidence: [
      {
        id: monitor.id,
        kind: "web",
        title: observation.title,
        url: observation.url,
        excerpt: text.slice(0, 600),
      },
    ],
    plan: task.plan.map((s) => ({ ...s, status: "succeeded" })),
  };
}

export function matchesPrice(text: string, threshold: number) {
  const matches = [...text.matchAll(/(?:\$|USD)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/g)];
  return matches.some((m) => Number(m[1].replace(/,/g, "")) < threshold);
}
