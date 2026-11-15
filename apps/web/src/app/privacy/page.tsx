import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How Debo handles your data",
  description: "What Debo stores, where it lives, who else sees it, and how you delete it. Plain words, true today.",
  alternates: { canonical: "/privacy" },
};

const REPO = "https://github.com/playlikeboy/debo.life";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12 border-t-2 border-ink pt-8">
      <h2 id={id} className="text-[1.75rem]">
        {title}
      </h2>
      <div className="mt-4 grid max-w-[40rem] gap-4">{children}</div>
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="grid list-disc gap-2 pl-6">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <main className="wrap max-w-[48rem] py-16">
      <a href="/" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
        Back to Debo
      </a>

      <h1 className="h-section mt-8">How Debo handles your data</h1>
      <p className="mt-4 text-[1.125rem] text-ink-soft">Last updated 15 November 2026.</p>

      <div className="mt-8 max-w-[40rem] rounded-[24px] border-2 border-ink bg-paper p-6">
        <p>
          This page explains how Debo works today. A full privacy policy, checked by someone qualified, comes
          before Debo opens fully.
        </p>
      </div>

      <Section id="stores" title="What Debo stores">
        <List
          items={[
            <>Your name, email and password. Your password passes through Debo on its way to our sign-in service, which stores only a hashed version. Debo never stores or logs it.</>,
            <>Your journal entries.</>,
            <>In the new app, the people in your life that you tell Debo about: name, who they are to you, birthdays and other special days, and a few notes. Described below.</>,
            <>
              Voice calls with Debo in the new app, written out as text: what you said and what Debo said, in order, with
              how far into the call each line was said. The sound of your voice is not kept.
            </>,
            <>Short pieces of each entry, made so Debo can search them.</>,
            <>
              Your chats with Debo: each question you ask in the chat and Debo&rsquo;s reply, with links to the entries
              it used, so you can come back to a chat later. They stay until you delete the chat or your account.
            </>,
            <>
              Memories: short facts Debo picks out of your entries, like &ldquo;Riya moved to Pune in March&rdquo;. Each
              one keeps a link to the entry it came from. Mem0 stores these, not our database.
            </>,
            <>A list of what Debo saved, deleted, forgot and answered for you (ids and times, not your words).</>,
            <>How many AI tokens your questions used each day (numbers only, never your words), so we can keep costs fair.</>,
          ]}
        />
      </Section>

      <Section id="where" title="Where it is stored">
        <p>
          Your account, your entries and any files live with Neon, which runs our database, sign-in and file
          storage. Neon keeps them in the United States (Amazon Web Services, us-east-2).
        </p>
        <p>
          Your memories live with Mem0 (Embedchain, Inc., doing business as Mem0). Mem0 says it stores data with
          hosting providers in the United States and other countries.
        </p>
        <p>Cloudflare runs the website. Your data travels between you, Cloudflare and Neon over HTTPS.</p>
      </Section>

      <Section id="who" title="Who else sees pieces of your data">
        <p>
          When you save or change an entry, its text goes to the Neon AI Gateway, whose models are run by
          Databricks, to turn it into numbers that let Debo search by meaning. Your questions go there too, for
          the same reason.
        </p>
        <p>
          When you ask a question, the pieces of your entries that match it go to Anthropic, which writes the
          answer. If Anthropic fails, they go to the Neon AI Gateway instead.
        </p>
        <p>
          Anthropic&rsquo;s business terms say it may not train its AI on what we send it. Anthropic deletes what
          we send within 30 days. It keeps things longer only if its safety checks flag a message as breaking its
          rules (up to 2 years), or if the law says it must.
        </p>
        <p>
          Neon says its AI gateway follows Databricks&rsquo; rules. Databricks says it does not use what paying
          customers send to train any AI. It may keep your text for up to 30 days, only to spot abuse.
        </p>
        <p>
          When you talk to Debo out loud, your voice goes to LiveKit (LiveKit, Inc.), which carries the call. LiveKit
          turns your speech into text with Deepgram and turns Debo&rsquo;s answer into speech with Cartesia. Only the
          text of your question reaches Debo&rsquo;s answer pipeline, the same as typing it. Debo does not record your
          voice.
        </p>
        <p>
          In the new app, a call works like chat. What you say, as text, goes to the same assistant that answers in
          chat, so it can use your journal, your tasks and the apps you connected, and the AI that writes the answer
          (Anthropic) receives it as it does for a typed question. Each call is saved as a chat that you can read in
          Chat, and also as a voice call in your journal, described below. Anything that sends, posts or changes something outside Debo, and anything that deletes your data, still waits for your yes on screen. Saving to your own journal does not: Debo does it at once and tells you, and you can delete it.
          If you ask Debo to act as someone, for example a friend, the role you asked for is saved with your account
          so she keeps it next time. You can see it, change it or stop it in the Apps screen, under &ldquo;A role for Debo&rdquo;, and it is removed when you
          delete your account.
        </p>
        <p>
          In the new app you can also choose a voice and speed for Debo and write a few notes about yourself (what to
          call you, your city, people, how you like things), under &ldquo;How she talks and what she knows&rdquo;. They
          are saved with your account. The notes are sent to the assistant model with your questions, as your own words,
          so she can be personal; the voice choice is sent to LiveKit with the call. Both are in &ldquo;Download my
          data&rdquo; and are deleted with your account.
        </p>
        <p>
          In the new app Debo also keeps &ldquo;People in your life&rdquo;: a short card for each person you tell her
          about, with their name, who they are to you, their birthday and other special days, and a few notes in your
          words (for example &ldquo;loves jasmine tea&rdquo;). She saves a card when you mention someone in chat or on a
          call, and tells you. You can see every card, fix it, add someone or remove them on the Apps screen, under
          &ldquo;People in your life&rdquo;. The cards are saved in Debo&rsquo;s database at Neon, with your other
          settings. Up to 40 of them (name, who they are, the start of the notes) and the birthdays coming up in the next
          week are sent to the assistant model (Anthropic) with your questions, so she can ask after people by name. They
          are in &ldquo;Download my data&rdquo; and are removed by &ldquo;Delete my data&rdquo; and when you delete your
          account. They are separate from memories: removing a card does not forget a memory, and forgetting a memory does
          not remove a card.
        </p>
        <p>
          When you say good morning, or ask how your day looks, Debo may put together a short check-in. It reads only what
          Debo already holds: the people cards, tasks waiting for you, your goals, and your journal entries from the last
          week. It goes to the assistant model like any other answer, and the check-in itself is not saved anywhere.
        </p>
        <p>
          We have not yet checked LiveKit&rsquo;s, Deepgram&rsquo;s or Cartesia&rsquo;s terms on training AI and on how
          long they keep audio. Until we do, assume they may keep it for a time. If that worries you, type instead.
        </p>
        <p className="text-ink-soft">
          We checked Anthropic&rsquo;s, Neon&rsquo;s and Databricks&rsquo; terms on 10 November 2026.
        </p>
        <p>
          When you save or change an entry, its text also goes to Mem0. Mem0 uses AI to pick out the facts worth
          remembering, and stores them as your memories. Mem0 says it uses AI providers such as OpenAI and Anthropic.
        </p>
        <p className="text-ink-soft">
          Mem0&rsquo;s privacy policy says it trains its AI models on data from its free plan users, and not on data
          from its paid plan users. We have not yet confirmed which of these covers Debo&rsquo;s Mem0 account. Until
          we do, assume Mem0 may train on what Debo sends it.
        </p>
        <p>We do not sell your data, share it, or show ads against it. We do not train AI on it ourselves.</p>
      </Section>

      <Section id="limits" title="Honest limits">
        <List
          items={[
            <>Debo is not end-to-end encrypted. Debo&rsquo;s servers have to read your notes to search them.</>,
            <>Our database provider may keep backups for a short time. We will state the exact period before Debo opens fully.</>,
            <>Sign-in emails (codes and links) are sent from mail.debo.life through Cloudflare&rsquo;s email service. Cloudflare sees your email address and the code or link, never your entries.</>,
            <>Mem0&rsquo;s privacy policy does not say how long it keeps data after it is deleted.</>,
          ]}
        />
      </Section>

      <Section id="control" title="What you control today">
        <List
          items={[
            <>Delete any entry. It is deleted right away, and the memories from it a few seconds later.</>,
            <>Delete any chat from the chat page. It and every message in it are deleted right away.</>,
            <>See every memory on the &ldquo;What Debo knows&rdquo; page, with the entry it came from. Fix it or forget it there.</>,
            <>
              Download everything from your home page. You get a zip with every entry and every chat as a plain text
              file and your activity record as a spreadsheet. It opens without Debo.
            </>,
            <>
              Delete your account from your home page. That deletes your memories in Mem0, your account, every entry,
              every piece, every chat and any files, right away.
            </>,
          ]}
        />
      </Section>

      <Section id="new-app" title="The new Debo app (early version)">
        <p>
          A new version of Debo is being tried at my.debo.life. You sign in with the same account, and it reads and
          writes the same journal entries and memories described on this page, with the same companies involved.
        </p>
        <List
          items={[
            <>Chats, tasks and settings you make in the new app are stored in the same Neon database, kept apart from the older app&rsquo;s chats.</>,
            <>
              The new app runs on Cloudflare, like this website. Your unsaved draft stays on your device (in the browser, or
              in a small file in the phone app) until you save it.
            </>,
            <>
              &ldquo;Delete my data&rdquo; in the new app deletes your journal entries, your memories and everything you made
              in the new app. It does not yet delete your account itself or your chats from this website. To delete
              everything, use &ldquo;Delete my account&rdquo; on your home page here.
            </>,
            <>
              &ldquo;Download my data&rdquo; in the new app gives you one file with your entries, memories and what you made
              there. For each voice note or video it lists the details and the words, and a link that downloads the
              recording itself. That link works for 24 hours, so keep the file private.
            </>,
          ]}
        />
        <h3 className="mt-6 font-semibold">Voice calls with Debo</h3>
        <p>
          Every call you make from the Talk screen is saved as text. There is no setting to turn this off. The Talk
          screen says so before the microphone starts.
        </p>
        <List
          items={[
            <>
              What is saved: your words and Debo&rsquo;s words, as text, in Debo&rsquo;s database at Neon (the same place
              as your journal entries). Never the sound. While a call is on, each line is saved as it is said. If you
              close the tab or lose the connection, the call is still saved.
            </>,
            <>
              Debo learns from it like from a journal entry. When the call ends (or, if it never says so, when it has been
              quiet for ten minutes), the text is cut into short pieces for search, and those pieces go to the Neon AI
              Gateway (run by Databricks) to be turned into numbers for searching by meaning. The text of the call also
              goes to Mem0, which picks out lasting facts. Only what you said can become a memory. Debo&rsquo;s own lines are
              sent along only so your short answers make sense, and Mem0 is told not to save them. A role Debo played is
              not a fact about you. When you later ask a question, matching pieces go to Anthropic, as for any entry.
            </>,
            <>
              Answers that used a call say &ldquo;Voice call&rdquo; and the date. Opening that source shows the call.
              Calls where you said almost nothing are deleted, not kept.
            </>,
            <>
              You can read every call in your journal in the new app, and it is part of &ldquo;Download my data&rdquo;. To
              delete one, delete it there: the call, its search pieces, the memories that came only from it, and its copy
              in Chat are deleted. &ldquo;Delete my data&rdquo; and deleting your account remove every call. Deleting only
              the Chat copy does not remove the call from your journal.
            </>,
            <>
              The call itself is carried by LiveKit, Deepgram and Cartesia, as described above in this page. Debo does not
              store the audio.
            </>,
            <>
              You can minimise a call to a small bar and use the rest of the app while you talk. The microphone stays on
              while the bar is there, and the bar always says whether it is on. On the web, the call keeps going if you
              switch tabs or minimise the window, and stops when you close the tab. On iPhone the call is allowed to
              continue when the app is in the background or the screen is locked, and iOS shows its orange microphone
              dot. Press End, or Mute, at any time.
            </>,
          ]}
        />
        <h3 className="mt-6 font-semibold">Voice notes, videos and speaking into the text</h3>
        <p>Once it is switched on, the new app lets you record a voice note or video, add a recording you already have, or speak into the text box. If you do not see these buttons, it is not on yet and none of the below applies.</p>
        <List
          items={[
            <>
              The recording is stored in Cloudflare R2, in a private bucket with no public address. Only Debo&rsquo;s
              server can reach it. Your phone or browser sends the recording to Debo&rsquo;s server, which passes it on
              to that bucket as it arrives and does not keep a copy of its own. When you play it, Debo gives you a link
              that stops working after an hour, and only you can get one. The sound comes through Debo&rsquo;s server
              too.
            </>,
            <>
              The words are written by Cloudflare Workers AI (a speech model called Whisper), so Cloudflare hears your
              audio. Only the sound is sent, not the picture. Cloudflare says it does not use content processed by
              Workers AI to train AI models, and does not keep it after the request is done. No other company hears your
              recordings.
            </>,
            <>
              The words are saved as an entry, so they are searched, used to answer your questions and sent to Mem0 and
              Anthropic exactly like a written entry, as described above. Answers that use them say &ldquo;Voice
              note&rdquo; or &ldquo;Video&rdquo; and the date.
            </>,
            <>
              While the words are written, a temporary copy of the sound sits on Debo&rsquo;s server. It is deleted when
              that work ends. The recording itself is kept until you delete it.
            </>,
            <>
              When you press &ldquo;Speak&rdquo;, short clips of your voice go to Debo&rsquo;s server and on to the same
              Cloudflare service. The clips are not saved. The microphone is on only while the screen says
              &ldquo;Listening&rdquo; or &ldquo;Recording&rdquo;.
            </>,
            <>
              Debo keeps, with each recording: its type, size, length, when you recorded it, the file name if you added a
              file, the words with their timing, the language, and a fingerprint of the file so the same file is not
              written out twice. It never keeps where you were.
            </>,
            <>
              To delete a recording, delete its entry: the file is removed from storage first, then the entry and what Debo
              learned from it. &ldquo;Delete my data&rdquo; removes every recording you have. A recording you started to
              add but never finished is removed within a day. We have not checked whether Cloudflare keeps any backup
              copy of a deleted file.
            </>,
            <>A recording can be up to 200 MB and 60 minutes. You can add up to 4 hours and 40 recordings a day.</>,
          ]}
        />
      </Section>

      <Section id="connected-apps" title="Connecting your apps (new app, optional)">
        <p>
          In the new app you can connect other apps, such as Gmail, Slack or Notion, so Debo can look things up in them
          and, when you say yes, make changes. This is off until you connect an app, and you choose each one.
        </p>
        <List
          items={[
            <>
              Composio (Sampark Inc, doing business as Composio) holds your sign-in to each app you connect and carries
              each request between Debo and that app. You sign in on the app&rsquo;s own page. Debo never sees your
              password.
            </>,
            <>
              What Debo sends Composio: your Debo account id, so it knows whose connection to use; which app you chose;
              and each request, such as the words to search for, or the text of a message you approved. What comes back
              is shown to you, and the parts needed are sent to the AI that writes Debo&rsquo;s answer (Anthropic).
            </>,
            <>
              Debo only looks things up on its own. Anything that sends, posts, creates, changes or deletes waits for
              your yes on screen. Voice can never give that yes.
            </>,
            <>
              Debo&rsquo;s own logs keep which app and tool were used and whether it worked, never your messages or
              results.
            </>,
            <>
              Composio&rsquo;s privacy policy says it keeps the inputs and results of requests in its logs and deletes
              them automatically one year after the request, and that it does not use them to train AI. We checked its
              policy on 14 November 2026.
            </>,
            <>
              To disconnect an app, use &ldquo;Disconnect&rdquo; on the Apps screen. That deletes the connection at
              Composio. &ldquo;Delete my data&rdquo; in the new app disconnects every app you connected. The new app
              does not hold your app passwords or tokens, so &ldquo;Download my data&rdquo; lists which apps you
              connected and when, and nothing more.
            </>,
          ]}
        />
      </Section>

      <Section id="tool-servers" title="Your own tool servers (new app, optional)">
        <p>
          In the new app you can also add a tool server of your own (an &ldquo;MCP&rdquo; server) by giving Debo its
          address. This is off until you add one. Debo does not run these servers, does not choose them and does not
          control them. Only add one you trust.
        </p>
        <List
          items={[
            <>
              A tool server you add receives what Debo sends it: the tool name and the values for the call, such as the
              words of a note. Debo only sends a call you asked for, and a call that changes something waits for your yes
              on screen. Debo never sends your journal or memories to it by itself. What the server does with what it
              receives is up to whoever runs it. Debo&rsquo;s people do not control it and cannot undo it.
            </>,
            <>
              What the server sends back is shown to you, and the parts needed are sent to the AI that writes
              Debo&rsquo;s answer (Anthropic). Debo treats it as plain data, never as instructions.
            </>,
            <>
              If you give a secret (a token or key), Debo saves it encrypted, never shows it again and never writes it to
              its logs. Debo&rsquo;s logs keep which server and tool were used and whether it worked, never the values or
              the results. Debo only connects to public https addresses.
            </>,
            <>
              If you choose to sign in to a server instead of giving a secret, you sign in on that server&rsquo;s own
              page, not in Debo. To set this up, Debo sends the server&rsquo;s sign-in service its name
              (&ldquo;Debo&rdquo;) and the address to send you back to. Debo then keeps the sign-in it gets back (its
              tokens) encrypted, never shows them and never writes them to its logs.
            </>,
            <>
              Your own Composio account works the same way. If you add it with &ldquo;Sign in with Composio&rdquo; or
              your own Composio API key, Debo saves the key or the sign-in encrypted, and the calls go to your Composio
              account with what each call needs: the tool name and its values. What Composio and the apps you connected
              there do with it is set by your Composio account, not by Debo.
            </>,
            <>
              &ldquo;Remove&rdquo; on the Apps screen deletes the server and its secret or sign-in. &ldquo;Sign
              out&rdquo; deletes the sign-in and keeps the server. Both only make Debo forget it: to cut off access on
              the other side too, do that in the server&rsquo;s own settings (Composio offers no way for Debo to do it).
              &ldquo;Delete my data&rdquo; removes every server you added. &ldquo;Download my data&rdquo; lists each
              server&rsquo;s name, address and tools, never its secret or sign-in.
            </>,
          ]}
        />
      </Section>

      <Section id="cookies" title="Cookies and your browser">
        <p>Debo only uses the sign-in cookies it needs to keep you signed in. No ads, no tracking, no analytics.</p>
        <p>
          While you write a journal entry, Debo keeps your unsaved draft only in this browser, so you don&rsquo;t lose
          it if the page closes. It is not sent to Debo until you save it. Saving, signing out or deleting your
          account removes the draft from the browser.
        </p>
      </Section>

      <Section id="questions" title="Questions">
        <p>
          Ask on{" "}
          <a href={`${REPO}/issues`} className="font-semibold underline underline-offset-4">
            Debo&rsquo;s GitHub issues page
          </a>
          . Please do not post anything private there, since it is public.
        </p>
      </Section>
    </main>
  );
}
