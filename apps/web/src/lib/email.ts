import "server-only";
import { z } from "zod";

// Sends email through Cloudflare's Email Sending API from mail.daksha.life.
// Today only sign-in emails (codes and links) use it. Never log the
// recipient, the subject or the body: log ids only.

const EmailEnv = z.object({
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_API_TOKEN: z.string().min(1),
});

const SendResult = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ message: z.string().optional() }).passthrough()).default([]),
  result: z
    .object({ message_id: z.string().optional(), permanent_bounces: z.array(z.string()).default([]) })
    .passthrough()
    .nullish(),
});

export type Email = { to: string; subject: string; html: string; text: string };

export const SENDER = { address: "signin@mail.daksha.life", name: "Daksha" };

/** The sender. DAKSHA_EMAIL_FROM can set another address, for example while mail.daksha.life is not verified yet. */
export function senderFrom(env: Record<string, string | undefined>): { address: string; name: string } {
  const address = z.string().email().safeParse(env.DAKSHA_EMAIL_FROM?.trim());
  return address.success ? { ...SENDER, address: address.data } : SENDER;
}

/** Send one email. Throws with a short reason if Cloudflare does not accept it. */
export async function sendEmail(email: Email, env: Record<string, string | undefined>): Promise<{ messageId: string }> {
  const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = EmailEnv.parse(env);
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/email/sending/send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: senderFrom(env), to: email.to, subject: email.subject, html: email.html, text: email.text }),
    },
  );
  const body = SendResult.safeParse(await response.json().catch(() => null));
  if (!response.ok || !body.success || !body.data.success) {
    const reason = body.success ? body.data.errors.map((e) => e.message).join("; ") : "unreadable reply";
    throw new Error(`Cloudflare email failed (${response.status}): ${reason.slice(0, 160)}`);
  }
  if (body.data.result?.permanent_bounces.length) throw new Error("Cloudflare email bounced permanently.");
  return { messageId: body.data.result?.message_id ?? "unknown" };
}
