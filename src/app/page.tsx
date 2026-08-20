import Link from "next/link";
import { TRACKS } from "@/lib/content/types";

/**
 * The landing previously described the training and nothing else, which left
 * the three strongest things in the product invisible: he reads your actual
 * wording, he remembers across sessions, and he asks before advising.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
      <section className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent mb-5">
          Attention · Memory · Reading people
        </p>
        <h1 className="font-display text-3xl sm:text-5xl leading-[1.15] mb-6">
          Everything that looks like mind reading is a learnable skill.
        </h1>
        <p className="text-muted text-base sm:text-lg leading-relaxed mb-9">
          A mentor who spent twenty years reading people for money, and then decided teaching the
          method was the better use of it. Plus the training to actually build the skill yourself.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/chat"
            className="bg-accent text-background font-medium px-6 py-3 rounded-md text-center hover:opacity-90 transition-opacity"
          >
            Talk to the Mentalist
          </Link>
          <Link
            href="/train/memory-palace"
            className="border border-panel-border px-6 py-3 rounded-md text-center hover:border-accent transition-colors"
          >
            Start the first lesson
          </Link>
        </div>
      </section>

      {/* The actual differentiators, stated as behaviour rather than adjectives. */}
      <section className="mt-24 sm:mt-32 grid sm:grid-cols-3 gap-8">
        <Pillar
          label="He reads the wording"
          body="Not what you meant — what you actually wrote. Out of nowhere is a conclusion, not a fact, and he'll say so and ask which kind it is."
        />
        <Pillar
          label="He asks before advising"
          body="If you're still working out what you think, he won't hand you a plan. Advice arrives when you've decided, not while you're deciding."
        />
        <Pillar
          label="He remembers"
          body="Your sister's name, the job you were weighing up, the argument that never got resolved. Next time he asks how it went."
        />
      </section>

      <section className="mt-24 sm:mt-32">
        <h2 className="font-display text-2xl mb-8">Two things you can do right now</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card
            href="/analyze"
            title="Read a conversation"
            body="Paste a real exchange — messages, an email thread. You get the wording read back line by line, on both sides including yours, plus what's conspicuously missing from it."
          />
          <Card
            href="/chat"
            title="Talk something through"
            body="The thing that's awkward to take to friends and feels too small for a therapist. He'll ask the direct questions people are usually too polite to ask."
          />
        </div>
      </section>

      <section className="mt-24 sm:mt-32">
        <h2 className="font-display text-2xl mb-2">Four training tracks</h2>
        <p className="text-sm text-muted mb-8">
          Every method carries its real difficulty, how long until it works, and how good the
          evidence for it actually is. Including when that answer is not very.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {TRACKS.map((track) => (
            <Link
              key={track.id}
              href="/train"
              className="card-hover bg-panel border border-panel-border rounded-lg p-6"
            >
              <h3 className="font-display text-lg mb-2">{track.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{track.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-24 sm:mt-32 border-t border-panel-border pt-8">
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          He is not a therapist and not a replacement for one, and he says so rather than letting
          you find out the hard way. If something comes up that needs real help, he stops and points
          you at it instead of carrying on.
        </p>
        <Link
          href="/intake"
          className="inline-block mt-4 text-sm text-accent hover:opacity-80 transition-opacity"
        >
          Check whether this is the right thing for you →
        </Link>
      </section>
    </div>
  );
}

function Pillar({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-3">{label}</p>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  );
}

function Card({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      className="card-hover bg-panel border border-panel-border rounded-lg p-6"
    >
      <h3 className="font-display text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </Link>
  );
}
