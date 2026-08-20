"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReplyBlock } from "@/lib/mentalist/blocks";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { GRADE_VAR, LiveTimerRing, Stamp, useReducedMotion } from "./primitives";

/**
 * Renders a structured reply.
 *
 * `crisis` is threaded through every block rather than handled by CSS alone.
 * The stylesheet kills animation under [data-crisis], and these props kill the
 * interactive furniture too — a checklist to tick or a sealed envelope to open
 * is the wrong object to put in front of someone who has just disclosed
 * something serious, animated or not.
 */
export default function ReplyBlocks({
  blocks,
  crisis = false,
}: {
  blocks: ReplyBlock[];
  crisis?: boolean;
}) {
  return (
    <div className="space-y-6">
      {blocks.map((b, i) => (
        <Block key={i} block={b} index={i} crisis={crisis} />
      ))}
    </div>
  );
}

function Block({
  block,
  index,
  crisis,
}: {
  block: ReplyBlock;
  index: number;
  crisis: boolean;
}) {
  const reduced = useReducedMotion();
  const stagger = crisis || reduced ? 0 : index * 70;

  const wrap = (children: React.ReactNode) => (
    <div
      className={crisis || reduced ? undefined : "ulika-reveal"}
      style={stagger ? { animationDelay: `${stagger}ms` } : undefined}
    >
      {children}
    </div>
  );

  switch (block.type) {
    case "observation":
      return wrap(<Observation lines={block.lines} crisis={crisis} />);
    case "questions":
      return wrap(<Questions items={block.items} />);
    case "prose":
      return wrap(
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.text}</p>
      );
    case "pattern":
      return wrap(<PatternCard block={block} />);
    case "source":
      return wrap(<SourceCard block={block} />);
    case "checklist":
      return wrap(<Checklist block={block} crisis={crisis} />);
    case "drill":
      return wrap(<Drill block={block} crisis={crisis} />);
    case "envelope":
      return wrap(<SealedEnvelope block={block} crisis={crisis} />);
    case "timeline":
      return wrap(<Timeline block={block} />);
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-3">{children}</p>
  );
}

function Observation({
  lines,
  crisis,
}: {
  lines: { text: string; kind: "fact" | "inference" }[];
  crisis: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div>
      <Label>What I noticed</Label>
      <div className="space-y-2 border-l pl-4" style={{ borderColor: "var(--line)" }}>
        {lines.map((l, i) => (
          <p
            key={i}
            className={`text-sm leading-relaxed ${crisis || reduced ? "" : "ulika-reveal"}`}
            style={crisis || reduced ? undefined : { animationDelay: `${i * 320}ms` }}
          >
            {/* Solid underline = observed in their text. Dashed = concluded.
                Learned once, then readable without a legend. */}
            <span className={l.kind === "fact" ? "mark-fact" : "mark-inference"}>{l.text}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Questions carry their own answer field so a reply does not lose them upstream. */
function Questions({ items }: { items: string[] }) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div>
      <Label>What I need to know</Label>
      <ol className="space-y-3">
        {items.map((q, i) => (
          <li key={i}>
            <button
              onClick={() => setOpenIdx(openIdx === i ? null : i)}
              className="flex gap-3 text-left w-full group"
            >
              <span className="font-mono text-xs text-accent shrink-0 pt-0.5">{i + 1}</span>
              <span className="text-sm leading-relaxed group-hover:text-foreground transition-colors">
                {q}
              </span>
            </button>
            {openIdx === i && (
              <textarea
                autoFocus
                value={answers[i] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                rows={2}
                placeholder="Answer here, then send them all together."
                className="mt-2 ml-7 w-[calc(100%-1.75rem)] bg-panel border border-panel-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent resize-none"
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceCard({ block }: { block: Extract<ReplyBlock, { type: "source" }> }) {
  const colour = block.grade ? GRADE_VAR[block.grade] : "var(--muted)";
  return (
    <Link
      href={`/train/${block.slug}`}
      className="block rounded-lg border p-4 transition-colors hover:border-accent"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colour }} />
        <span className="text-sm font-medium">{block.title}</span>
        {block.grade && (
          <span
            className="font-mono text-[10px] uppercase tracking-wider"
            style={{ color: colour }}
          >
            grade {block.grade}
          </span>
        )}
      </div>
      <p className="text-xs text-muted leading-relaxed">{block.note}</p>
    </Link>
  );
}

/** Ties the present conversation to something already in the dossier. */
function PatternCard({ block }: { block: Extract<ReplyBlock, { type: "pattern" }> }) {
  return (
    <div
      className="rounded-lg border-l-2 pl-4 py-1"
      style={{ borderColor: "var(--accent-teal)" }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: "var(--accent-teal)" }}>
        This has come up before
      </p>
      <p className="text-sm leading-relaxed mb-1.5">{block.observation}</p>
      <p className="text-sm leading-relaxed text-muted italic mb-2">{block.thenWhat}</p>
      <Link href="/dossier" className="text-xs text-accent hover:opacity-80">
        {block.subject} in your dossier →
      </Link>
    </div>
  );
}

async function recordTick(skillId: string, item: string, checked: boolean) {
  const supabase = getBrowserSupabase();
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("training_responses").insert({
    user_id: data.user.id,
    skill_id: skillId,
    prompt: item,
    response: checked ? "done" : "unchecked",
    block_id: `checklist:${item.slice(0, 60)}`,
    checked,
  });
}

function Checklist({
  block,
  crisis,
}: {
  block: Extract<ReplyBlock, { type: "checklist" }>;
  crisis: boolean;
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});

  return (
    <div className="rounded-lg border p-5" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
      <Label>Away from this screen</Label>
      <p className="text-sm mb-4">{block.title}</p>
      <div className="space-y-2.5">
        {block.items.map((item, i) => (
          <label key={i} className="flex gap-3 items-start cursor-pointer">
            <Stamp trigger={done[i]} disabled={crisis}>
              <input
                type="checkbox"
                checked={Boolean(done[i])}
                onChange={(e) => {
                  setDone((d) => ({ ...d, [i]: e.target.checked }));
                  void recordTick(block.skillId, item, e.target.checked);
                }}
                className="mt-0.5 accent-[var(--accent-brass)]"
              />
            </Stamp>
            <span className={`text-sm leading-relaxed ${done[i] ? "text-muted line-through" : ""}`}>
              {item}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Drill({
  block,
  crisis,
}: {
  block: Extract<ReplyBlock, { type: "drill" }>;
  crisis: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);

  return (
    <div className="rounded-lg border p-5" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
      <Label>Drill</Label>
      <p className="text-sm mb-1">{block.title}</p>
      <p className="text-sm text-muted leading-relaxed mb-4">{block.instruction}</p>
      <div className="flex items-center gap-4">
        <LiveTimerRing
          durationSeconds={block.seconds}
          running={running && !crisis}
          onDone={() => setFinished(true)}
        />
        {!running ? (
          <button
            onClick={() => setRunning(true)}
            className="text-sm text-accent hover:opacity-80"
          >
            Start
          </button>
        ) : finished ? (
          <Stamp trigger={finished} disabled={crisis}>
            <span className="text-sm text-accent">Time.</span>
          </Stamp>
        ) : (
          <span className="text-sm text-muted">Running.</span>
        )}
      </div>
    </div>
  );
}

/**
 * A field assignment arrives sealed. You open it when you are ready to do the
 * thing, not while you are still reading — which is the actual behaviour the
 * envelope is trying to produce.
 */
function SealedEnvelope({
  block,
  crisis,
}: {
  block: Extract<ReplyBlock, { type: "envelope" }>;
  crisis: boolean;
}) {
  const [open, setOpen] = useState(crisis); // never sealed during a crisis
  const [answer, setAnswer] = useState("");
  const [saved, setSaved] = useState(false);
  const reduced = useReducedMotion();

  async function save() {
    const supabase = getBrowserSupabase();
    if (!supabase || !answer.trim()) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("training_responses").insert({
      user_id: data.user.id,
      skill_id: block.skillId,
      prompt: block.assignment,
      response: answer.trim(),
    });
    setSaved(true);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border p-6 text-left transition-colors hover:border-accent"
        style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
      >
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
            <rect x="2.5" y="6.5" width="23" height="15" rx="1.5" stroke="var(--accent-brass)" />
            <path d="M2.5 7.5 14 15 25.5 7.5" stroke="var(--accent-brass)" strokeWidth="1" />
            <circle cx="14" cy="16.5" r="3.5" fill="var(--accent-brass)" fillOpacity="0.18" stroke="var(--accent-brass)" />
          </svg>
          <div>
            <p className="text-sm font-medium">{block.title}</p>
            <p className="text-xs text-muted mt-0.5">Open it when you&apos;re ready to do it.</p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        background: "var(--panel-2)",
        borderColor: "var(--accent-brass)",
        animation:
          crisis || reduced ? undefined : "ulika-reveal 380ms var(--ease-expo-out) both",
      }}
    >
      <Label>{block.title}</Label>
      <p className="text-sm leading-relaxed mb-4">{block.assignment}</p>
      {saved ? (
        <Stamp trigger={saved} disabled={crisis}>
          <span className="text-sm text-accent">Recorded.</span>
        </Stamp>
      ) : (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            placeholder="What happened when you did it?"
            className="w-full bg-background border border-panel-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent resize-none mb-3"
          />
          <button
            onClick={save}
            disabled={!answer.trim()}
            className="text-sm text-accent hover:opacity-80 disabled:opacity-40"
          >
            Record it →
          </button>
        </>
      )}
    </div>
  );
}

function Timeline({ block }: { block: Extract<ReplyBlock, { type: "timeline" }> }) {
  return (
    <div>
      <Label>{block.title}</Label>
      <div className="space-y-0">
        {block.steps.map((s, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span
                className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                style={{ background: "var(--accent-brass)" }}
              />
              {i < block.steps.length - 1 && (
                <span className="w-px flex-1 my-1" style={{ background: "var(--line)" }} />
              )}
            </div>
            <div className="pb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{s.label}</p>
                {s.depth && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    {s.depth}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted leading-relaxed mt-1">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
