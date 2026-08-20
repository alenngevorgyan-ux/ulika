import Link from "next/link";
import { TRACKS } from "@/lib/content/types";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <section className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent mb-5">
          Attention · Memory · Reading people
        </p>
        <h1 className="font-display text-4xl sm:text-5xl leading-[1.15] mb-6">
          Everything that looks like mind reading is a learnable skill.
        </h1>
        <p className="text-muted text-lg leading-relaxed mb-9">
          Interactive training in observation, memory and mental calculation, built around a mentor
          who spent twenty years doing this for money and then decided teaching it was the better
          use.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/train/memory-palace"
            className="bg-accent text-background font-medium px-6 py-3 rounded-md hover:opacity-90 transition-opacity"
          >
            Start the first lesson
          </Link>
          <Link
            href="/chat"
            className="border border-panel-border px-6 py-3 rounded-md hover:border-accent transition-colors"
          >
            Talk to the Mentalist
          </Link>
        </div>
      </section>

      <section className="mt-24">
        <h2 className="font-display text-2xl mb-8">Four tracks</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {TRACKS.map((track) => (
            <Link
              key={track.id}
              href="/train"
              className="bg-panel border border-panel-border rounded-lg p-6 hover:border-accent transition-colors"
            >
              <h3 className="font-display text-lg mb-2">{track.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{track.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
