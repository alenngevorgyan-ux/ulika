import Link from "next/link";
import { TRAININGS } from "@/lib/content/trainings";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <section className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-4">
          Наблюдательность · Память · Ясность ума
        </p>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight mb-6">
          Тренируй внимание так же серьёзно, как тело.
        </h1>
        <p className="text-muted text-lg leading-relaxed mb-8">
          10 тренировок наблюдательности, памяти и устного счёта — и AI-наставник
          Марк Холодов, который соберёт из них персональный план под твою
          конкретную цель.
        </p>
        <div className="flex gap-4">
          <Link
            href="/chat"
            className="bg-accent text-background font-medium px-6 py-3 rounded-md hover:opacity-90 transition-opacity"
          >
            Поговорить с Марком
          </Link>
          <Link
            href="/train"
            className="border border-panel-border px-6 py-3 rounded-md hover:border-accent transition-colors"
          >
            Смотреть тренировки
          </Link>
        </div>
      </section>

      <section className="mt-20">
        <h2 className="font-display text-2xl mb-6">Каталог</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {TRAININGS.map((t) => (
            <div
              key={t.slug}
              className="bg-panel border border-panel-border rounded-lg p-5"
            >
              <p className="font-mono text-xs uppercase tracking-wide text-accent mb-2">
                {t.category}
              </p>
              <h3 className="font-display text-lg mb-1">{t.title}</h3>
              <p className="text-sm text-muted">{t.tagline}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
