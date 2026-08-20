"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Lesson, LessonBlock } from "@/lib/content/lessonTypes";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ILLUSTRATIONS } from "@/components/lesson/Illustrations";
import FeedbackPrompt from "@/components/FeedbackPrompt";

/** Learner-supplied answers, keyed by storeAs. Persisted per lesson. */
type Store = Record<string, string>;

function useStore(lessonSlug: string) {
  const key = `ulika-lesson-${lessonSlug}`;
  const [store, setStore] = useState<Store>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // localStorage is an external system and this is a one-shot hydration on
      // mount, not a render-driven cascade. Lazy useState would desync SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setStore(JSON.parse(raw));
    } catch {
      /* corrupted or unavailable storage — start fresh rather than crash */
    }
  }, [key]);

  function set(k: string, v: string) {
    setStore((prev) => {
      const next = { ...prev, [k]: v };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage full or blocked — the lesson still works in-session */
      }
      return next;
    });
  }

  return { store, set };
}

/**
 * Persist a written answer. Fire-and-forget is acceptable here (unlike memory
 * extraction in the API route) because this runs in the browser, not in a
 * serverless container that can freeze the moment a response ships.
 */
async function saveResponse(skillId: string, prompt: string, response: string) {
  const text = response.trim();
  if (!text) return;
  const supabase = getBrowserSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("training_responses").insert({
    user_id: data.user.id,
    skill_id: skillId,
    prompt,
    response: text,
  });
}

export default function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const [index, setIndex] = useState(0);
  const { store, set } = useStore(lesson.slug);
  const block = lesson.blocks[index];
  const isLast = index === lesson.blocks.length - 1;

  // The one place progress is blocked. Everything else is skippable by design;
  // retrieval practice is the mechanism, so skipping it is skipping the lesson.
  const responseKey = block.kind === "response" ? `response-${index}` : null;
  const written = responseKey ? (store[responseKey] ?? "").trim().split(/\s+/).filter(Boolean).length : 0;
  const gated = block.kind === "response" && written < block.minWords;
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [index]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div ref={topRef} />

      <div className="flex items-center justify-between mb-2">
        <Link href="/train" className="text-xs text-muted hover:text-foreground transition-colors">
          ← All training
        </Link>
        <span className="font-mono text-xs text-muted">
          {index + 1} / {lesson.blocks.length}
        </span>
      </div>

      <div className="h-0.5 bg-panel-border rounded-full mb-10 overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${((index + 1) / lesson.blocks.length) * 100}%` }}
        />
      </div>

      <BlockView key={index} block={block} store={store} set={set} storeKey={`response-${index}`} />

      {/* Only on the last screen — asking mid-lesson interrupts the thing we
          are asking about. */}
      {isLast && <FeedbackPrompt page={`lesson:${lesson.slug}`} />}

      <div className="flex gap-3 mt-10 pt-6 border-t border-panel-border">
        {index > 0 && (
          <button
            onClick={() => setIndex((i) => i - 1)}
            className="border border-panel-border px-5 py-2.5 rounded-md text-sm hover:border-accent transition-colors"
          >
            Back
          </button>
        )}
        {!isLast ? (
          <button
            onClick={() => {
              if (responseKey) {
                void saveResponse(lesson.trainingSlug, (block as { prompt: string }).prompt, store[responseKey] ?? "");
              }
              setIndex((i) => i + 1);
            }}
            disabled={gated}
            className="bg-accent text-background font-medium px-6 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <Link
            href="/train"
            className="bg-accent text-background font-medium px-6 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity"
          >
            Finish
          </Link>
        )}
      </div>
    </div>
  );
}

function BlockView({
  block,
  store,
  set,
  storeKey,
}: {
  block: LessonBlock;
  store: Store;
  set: (k: string, v: string) => void;
  storeKey: string;
}) {
  switch (block.kind) {
    case "concept":
      return (
        <section>
          <Label>Concept</Label>
          <H>{block.title}</H>
          <Body paragraphs={block.body} />
          {block.illustration && <Illustration spec={block.illustration} />}
        </section>
      );

    case "demo":
      return (
        <section>
          <Label>Worked example</Label>
          <H>{block.title}</H>
          <Body paragraphs={block.body} />
          <div className="space-y-2 my-6">
            {block.example.map((row, i) => (
              <div key={i} className="flex gap-4 bg-panel border border-panel-border rounded-lg p-4">
                <span className="font-mono text-xs text-accent shrink-0 w-6 pt-0.5">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium">{row.at}</p>
                  <p className="text-sm text-muted mt-1">{row.image}</p>
                </div>
              </div>
            ))}
          </div>
          {block.illustration && <Illustration spec={block.illustration} />}
        </section>
      );

    case "guided":
      return <GuidedBlock block={block} store={store} set={set} />;

    case "input":
      return (
        <section>
          <Label>Your turn</Label>
          <H>{block.title}</H>
          <Body paragraphs={block.body} />
          <div className="space-y-4 mt-6">
            {block.fields.map((f) => (
              <div key={f.storeAs}>
                <label className="block text-xs text-muted mb-1.5">{f.label}</label>
                <input
                  value={store[f.storeAs] ?? ""}
                  onChange={(e) => set(f.storeAs, e.target.value)}
                  placeholder={f.placeholder}
                  className="w-full bg-panel border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
        </section>
      );

    case "recall":
      return <RecallBlock block={block} store={store} />;

    case "quiz":
      return <QuizBlock block={block} />;

    case "timer":
      return <TimerBlock block={block} />;

    case "response":
      return (
        <section>
          <Label>Write it down</Label>
          <H>{block.title}</H>
          <Body paragraphs={block.body} />
          <p className="text-sm leading-relaxed mt-6 mb-3">{block.prompt}</p>
          <textarea
            value={store[storeKey] ?? ""}
            onChange={(e) => set(storeKey, e.target.value)}
            rows={5}
            placeholder="In your own words. Nobody else reads this."
            className="w-full bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent resize-none"
          />
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Writing this from memory does more than re-reading the lesson would. It is also what
            decides whether the next step goes deeper or repeats this one differently.
          </p>
        </section>
      );

    case "field":
      return (
        <section>
          <Label>Field test</Label>
          <H>{block.title}</H>
          <Body paragraphs={block.body} />
          <div className="bg-panel border border-accent/40 rounded-lg p-5 my-6">
            <p className="font-mono text-xs uppercase tracking-wide text-accent mb-2">Assignment</p>
            <p className="text-sm leading-relaxed">{block.assignment}</p>
          </div>
          <div className="border-t border-panel-border pt-4">
            <p className="font-mono text-xs uppercase tracking-wide text-accent mb-2">Mastery</p>
            <p className="text-sm text-muted leading-relaxed">{block.masteryCheck}</p>
          </div>
        </section>
      );
  }
}

function GuidedBlock({
  block,
  store,
  set,
}: {
  block: Extract<LessonBlock, { kind: "guided" }>;
  store: Store;
  set: (k: string, v: string) => void;
}) {
  const [done, setDone] = useState(false);

  return (
    <section>
      <Label>Do this now</Label>
      <H>{block.title}</H>
      <ol className="space-y-3 my-6">
        {block.instruction.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="font-mono text-xs text-accent shrink-0 pt-0.5">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="bg-panel border border-panel-border rounded-lg p-5 mb-6">
        <p className="font-mono text-xs uppercase tracking-wide text-accent mb-2">Notice</p>
        <p className="text-sm text-muted leading-relaxed">{block.noticePrompt}</p>
      </div>

      {!done ? (
        <button
          onClick={() => setDone(true)}
          className="border border-accent text-accent px-5 py-2.5 rounded-md text-sm hover:bg-accent hover:text-background transition-colors"
        >
          Done — I actually did it
        </button>
      ) : (
        <div>
          <label className="block text-sm mb-2">{block.reflection}</label>
          <textarea
            value={block.storeAs ? (store[block.storeAs] ?? "") : ""}
            onChange={(e) => block.storeAs && set(block.storeAs, e.target.value)}
            rows={3}
            className="w-full bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent resize-none"
          />
        </div>
      )}
    </section>
  );
}

function RecallBlock({
  block,
  store,
}: {
  block: Extract<LessonBlock, { kind: "recall" }>;
  store: Store;
}) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);

  return (
    <section>
      <Label>From memory</Label>
      <H>{block.title}</H>
      <Body paragraphs={block.body} />

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={5}
        placeholder="One per line, in order"
        className="w-full bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent resize-none my-6"
      />

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          disabled={!answer.trim()}
          className="bg-accent text-background font-medium px-5 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Check against what I stored
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bg-panel border border-panel-border rounded-lg p-5">
            <p className="font-mono text-xs uppercase tracking-wide text-accent mb-3">What you stored</p>
            <ol className="space-y-2">
              {block.recallKeys.map((k, i) => (
                <li key={k} className="text-sm text-muted">
                  <span className="font-mono text-xs text-accent mr-2">{i + 1}</span>
                  {store[k] || <span className="italic opacity-60">nothing saved for this stop</span>}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-sm text-muted leading-relaxed">{block.afterword}</p>
        </div>
      )}
    </section>
  );
}

function QuizBlock({ block }: { block: Extract<LessonBlock, { kind: "quiz" }> }) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <section>
      <Label>Check</Label>
      <H>{block.title}</H>
      <p className="text-sm leading-relaxed mb-6">{block.question}</p>

      <div className="space-y-2">
        {block.options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = i === block.correctIndex;
          const show = picked !== null;
          return (
            <button
              key={i}
              onClick={() => picked === null && setPicked(i)}
              disabled={picked !== null}
              className={`w-full text-left text-sm px-4 py-3 rounded-lg border transition-colors ${
                show && isCorrect
                  ? "border-accent bg-accent/10"
                  : show && isPicked
                    ? "border-red-500/50 bg-red-500/5"
                    : "border-panel-border bg-panel hover:border-accent/50"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <p className="text-sm text-muted leading-relaxed mt-5 pt-5 border-t border-panel-border">
          {block.explanation}
        </p>
      )}
    </section>
  );
}

function TimerBlock({ block }: { block: Extract<LessonBlock, { kind: "timer" }> }) {
  const [left, setLeft] = useState(block.seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, left]);

  const finished = running && left <= 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <section>
      <Label>Drill</Label>
      <H>{block.title}</H>
      <ol className="space-y-3 my-6">
        {block.instruction.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className="font-mono text-xs text-accent shrink-0 pt-0.5">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="bg-panel border border-panel-border rounded-lg p-8 text-center">
        <p className="font-mono text-5xl tracking-widest mb-5">
          {mm}:{ss}
        </p>
        {!running ? (
          <button
            onClick={() => setRunning(true)}
            className="bg-accent text-background font-medium px-6 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity"
          >
            Start
          </button>
        ) : finished ? (
          <p className="text-sm text-accent">Time.</p>
        ) : (
          <p className="text-sm text-muted">Eyes closed. Walk it.</p>
        )}
      </div>

      {finished && <p className="text-sm text-muted leading-relaxed mt-5">{block.afterword}</p>}
    </section>
  );
}

function Illustration({ spec }: { spec: { key: string; alt: string; caption?: string } }) {
  const Drawn = ILLUSTRATIONS[spec.key];

  // An unknown key states what is missing rather than rendering a broken box.
  if (!Drawn) {
    return (
      <figure className="my-6">
        <div className="border border-dashed border-panel-border rounded-lg p-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-wider text-accent mb-2">
            Illustration pending
          </p>
          <p className="text-xs text-muted leading-relaxed max-w-sm mx-auto">{spec.alt}</p>
        </div>
      </figure>
    );
  }

  return (
    <figure className="my-6">
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <Drawn />
      </div>
      {spec.caption && <figcaption className="text-xs text-muted mt-2">{spec.caption}</figcaption>}
    </figure>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent mb-3">{children}</p>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h1 className="font-display text-2xl leading-snug mb-5">{children}</h1>;
}

function Body({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed text-foreground/90">
          {p}
        </p>
      ))}
    </div>
  );
}
