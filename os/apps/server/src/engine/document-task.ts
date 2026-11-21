/** The "fill a PDF from an email and draft the reply" task, split out of service.ts. */
import { z } from "zod";
import type { AgentTask } from "../../../../packages/domain/src/agent.ts";
import type { Artifact, Mail, ProposalInput } from "../../../../packages/domain/src/index.ts";
import { AppError } from "../errors.ts";
import type { AgentService } from "./service.ts";
import type { TaskContext } from "./worker.ts";

export async function runDocumentTask(
  service: AgentService,
  owner: string,
  task: AgentTask,
  ctx: TaskContext,
): Promise<Partial<AgentTask>> {
  let source = task.state.source as { mail: Mail; fileId: string } | undefined;
  if (!source) {
    const w = await service.workspace.snapshot(owner);
    const mail = w.mail.find((m) => m.id === task.input.messageId);
    if (!mail) throw new Error("Choose a current email with a PDF attachment to start this task");
    const ref = mail.attachments[0];
    if (!ref) throw new Error("This email has no PDF attachment");
    await ctx.guard();
    let file: Artifact;
    try {
      file = await service.files.get(owner, ref);
    } catch (error) {
      if (!(error instanceof AppError && error.status === 404)) throw error;
      file = await service.workspace.importAttachment(owner, ref);
    }
    source = { mail, fileId: file.id };
    task = await ctx.checkpoint({
      state: { ...task.state, source },
      evidence: [service.mailEvidence(mail)],
      plan: task.plan.map((s, i) => ({ ...s, status: i === 0 ? "succeeded" : "pending" })),
    });
    await ctx.event("step", "Found the document", file.name);
  }
  const fields = z
    .record(z.string(), z.union([z.string(), z.boolean()]))
    .optional()
    .parse(task.input.fields);
  if (!fields || !Object.keys(fields).length) {
    const file = await service.files.get(owner, source.fileId);
    const names = file.fields
      ?.filter((f) => f.type !== "unsupported")
      .map((f) => f.name)
      .join(", ");
    if (!names)
      throw new Error(
        "This PDF has no supported fillable fields. Open it in Files to review it.",
      );
    return {
      status: "waiting_input",
      question: `Enter the form values you want to use. Supported fields: ${names}. The original PDF will stay intact.`,
      state: {
        ...task.state,
        source,
        missingFields: file.fields?.filter((f) => f.type !== "unsupported"),
      },
    };
  }
  let filledId = typeof task.state.filledId === "string" ? task.state.filledId : undefined;
  if (!filledId) {
    await ctx.guard();
    const filled = await service.files.fill(owner, source.fileId, fields, `document:${task.id}`);
    filledId = filled.id;
    task = await ctx.checkpoint({
      state: { ...task.state, source, filledId },
      artifactIds: [filledId],
      plan: task.plan.map((s, i) => ({ ...s, status: i <= 1 ? "succeeded" : "pending" })),
    });
    await ctx.event("step", "Saved a filled copy", filled.name);
  }
  const input: ProposalInput = {
    kind: "email.send",
    data: {
      to: [source.mail.from],
      cc: [],
      bcc: [],
      subject: /^re:/i.test(source.mail.subject)
        ? source.mail.subject
        : `Re: ${source.mail.subject}`,
      body:
        typeof task.input.reply === "string"
          ? task.input.reply
          : "Hello,\n\nPlease find the completed form attached.\n\nThank you.",
      attachmentIds: [filledId],
      threadId: source.mail.threadId,
      replyToMessageId: source.mail.id,
    },
  };
  const proposal = await service.prepare(owner, task, input, "document-reply", ctx);
  return {
    status: "waiting_approval",
    actionId: proposal.id,
    plan: task.plan.map((s, i) => ({
      ...s,
      status: i < 3 ? "succeeded" : i === 3 ? "waiting" : "pending",
    })),
  };
}
