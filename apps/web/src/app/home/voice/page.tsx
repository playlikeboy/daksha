import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TalkToDebo } from "@/components/voice/talk";
import { getAuth } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Talk to Daksha", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Talk to Daksha out loud. Same answers, same sources as chat. */
export default async function VoicePage() {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) redirect("/auth/sign-in");

  return (
    <main className="wrap max-w-[48rem] pb-16 pt-10">
      <h1 className="h-section">Talk to Daksha</h1>
      <p className="mt-4 text-[1.125rem] text-ink-soft">
        Ask out loud about anything you&rsquo;ve written, in English, Hindi or both. Daksha answers from your entries and
        shows where each answer came from. You can talk over Daksha to stop it, or type instead.
      </p>
      <TalkToDebo />
    </main>
  );
}
