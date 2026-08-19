import { TRAININGS } from "@/lib/content/trainings";
import { PSYCH_TECHNIQUES } from "@/lib/content/psychTechniques";

export default function TrainPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl mb-2">Тренировки</h1>
      <p className="text-muted mb-12">10 навыков наблюдательности, памяти и счёта.</p>

      <div className="space-y-10">
        {TRAININGS.map((t) => (
          <article key={t.slug} id={t.slug} className="bg-panel border border-panel-border rounded-lg p-6">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2 className="font-display text-xl">{t.title}</h2>
              <span className="font-mono text-xs uppercase tracking-wide text-accent shrink-0">
                {t.category}
              </span>
            </div>
            <p className="text-sm text-muted mb-4">{t.tagline}</p>
            <p className="text-sm leading-relaxed mb-5">{t.description}</p>

            <ol className="space-y-3 mb-5">
              {t.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs uppercase text-accent shrink-0 w-24">
                    {step.phase}
                  </span>
                  <span className="text-foreground/90">{step.text}</span>
                </li>
              ))}
            </ol>

            {t.proof && (
              <details className="mb-5 text-sm">
                <summary className="cursor-pointer text-accent font-mono text-xs uppercase tracking-wide">
                  Доказательство
                </summary>
                <p className="mt-2 leading-relaxed text-muted">{t.proof}</p>
              </details>
            )}

            <p className="text-xs text-muted border-t border-panel-border pt-4">
              <span className="font-mono uppercase tracking-wide text-accent">Мастерство: </span>
              {t.masteryCriterion}
            </p>
          </article>
        ))}
      </div>

      <h1 className="font-display text-3xl mt-20 mb-2">Психологические приёмы</h1>
      <p className="text-muted mb-12">10 этичных техник — с чёткой границей, где начинается манипуляция.</p>

      <div className="space-y-6">
        {PSYCH_TECHNIQUES.map((p) => (
          <article key={p.slug} className="bg-panel border border-panel-border rounded-lg p-6">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2 className="font-display text-lg">{p.title}</h2>
              <span className="font-mono text-xs uppercase tracking-wide text-accent shrink-0">
                {p.category}
              </span>
            </div>
            <p className="text-sm text-muted mb-4">Когда применять: {p.whenToUse}</p>
            <ol className="list-decimal list-inside space-y-1.5 text-sm mb-4">
              {p.steps.map((step, i) => (
                <li key={i} className="text-foreground/90">
                  {step}
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted border-t border-panel-border pt-4">
              <span className="uppercase tracking-wide text-accent font-mono">Граница: </span>
              {p.ethicalBoundary}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
