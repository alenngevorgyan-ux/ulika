import Link from "next/link";
import { TRAININGS } from "@/lib/content/trainings";
import { PSYCH_TECHNIQUES } from "@/lib/content/psychTechniques";
import { TRACKS } from "@/lib/content/types";
import { hasLesson } from "@/lib/content/lessons";

export default function TrainPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-display text-3xl mb-3">Training</h1>
      <p className="text-muted mb-14 max-w-xl leading-relaxed">
        Four tracks. Start anywhere, but the first lesson in a track usually earns its place at the
        front.
      </p>

      <div className="space-y-16">
        {TRACKS.map((track) => {
          const trainings = TRAININGS.filter((t) => t.track === track.id);
          const techniques = PSYCH_TECHNIQUES.filter((p) => p.track === track.id);

          return (
            <section key={track.id}>
              <h2 className="font-display text-xl mb-1.5">{track.title}</h2>
              <p className="text-sm text-muted mb-6 max-w-lg">{track.blurb}</p>

              <div className="grid sm:grid-cols-2 gap-3">
                {trainings.map((t) => {
                  const ready = hasLesson(t.slug);
                  const card = (
                    <div
                      className={`h-full bg-panel border rounded-lg p-5 transition-colors ${
                        ready ? "border-accent/40 hover:border-accent" : "border-panel-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-display text-base leading-snug">{t.title}</h3>
                        {ready ? (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-accent shrink-0 pt-1">
                            Lesson
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted shrink-0 pt-1">
                            Outline
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted leading-relaxed">{t.tagline}</p>
                    </div>
                  );

                  return (
                    <Link key={t.slug} href={`/train/${t.slug}`} className="block">
                      {card}
                    </Link>
                  );
                })}

                {techniques.map((p) => (
                  <div
                    key={p.slug}
                    className="h-full bg-panel/50 border border-panel-border rounded-lg p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="font-display text-base leading-snug">{p.title}</h3>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted shrink-0 pt-1">
                        Method
                      </span>
                    </div>
                    <p className="text-sm text-muted leading-relaxed">Use when {p.whenToUse}.</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
