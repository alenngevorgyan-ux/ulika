import { notFound } from "next/navigation";
import Link from "next/link";
import { getLesson } from "@/lib/content/lessons";
import { TRAININGS } from "@/lib/content/trainings";
import LessonPlayer from "@/components/LessonPlayer";

export function generateStaticParams() {
  return TRAININGS.map((t) => ({ slug: t.slug }));
}

export default async function TrainingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const lesson = getLesson(slug);
  if (lesson) return <LessonPlayer lesson={lesson} />;

  // No full lesson yet. Show the outline rather than a dead end — the material
  // is real, it just hasn't been built into the interactive format.
  const training = TRAININGS.find((t) => t.slug === slug);
  if (!training) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/train" className="text-xs text-muted hover:text-foreground transition-colors">
        ← All training
      </Link>

      <div className="mt-8 mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-3">Outline</p>
        <h1 className="font-display text-3xl leading-snug mb-3">{training.title}</h1>
        <p className="text-muted">{training.tagline}</p>
      </div>

      <div className="bg-panel border border-panel-border rounded-lg p-4 mb-8">
        <p className="text-xs text-muted leading-relaxed">
          This one is still an outline. The full interactive lesson, the kind that makes you build
          and test the skill inside the page, is written for the Memory Palace so far and the rest
          are being brought up to that standard.
        </p>
      </div>

      <p className="text-sm leading-relaxed mb-8">{training.description}</p>

      <ol className="space-y-3 mb-8">
        {training.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="font-mono text-xs uppercase text-accent shrink-0 w-20 pt-0.5">
              {step.phase}
            </span>
            <span className="text-foreground/90 leading-relaxed">{step.text}</span>
          </li>
        ))}
      </ol>

      {training.proof && (
        <details className="mb-8">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide text-accent">
            Why it always works
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-muted">{training.proof}</p>
        </details>
      )}

      <div className="border-t border-panel-border pt-5">
        <p className="font-mono text-xs uppercase tracking-wide text-accent mb-2">Mastery</p>
        <p className="text-sm text-muted leading-relaxed">{training.masteryCriterion}</p>
      </div>
    </div>
  );
}
