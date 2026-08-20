"use client";

import { useState } from "react";
import Link from "next/link";
import { ITEMS, FREQUENCY_OPTIONS, scoreScreening } from "@/lib/safety/screening";
import { RESOURCES, HANDOFF_NOTE } from "@/lib/safety/resources";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function IntakePage() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [done, setDone] = useState<ReturnType<typeof scoreScreening> | null>(null);

  const allAnswered = ITEMS.every((i) => answers[i.id] !== undefined);

  async function submit() {
    const outcome = scoreScreening(answers);
    setDone(outcome);

    const supabase = getBrowserSupabase();
    const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    if (supabase && data.user) {
      // Store the outcome, never the individual answers. A stored record of
      // exactly which distress items someone endorsed is a liability with no
      // corresponding benefit for this product.
      await supabase.from("intake_screening").upsert(
        {
          user_id: data.user.id,
          result: outcome.result,
          notes: { reason: outcome.reason, elevated: outcome.elevatedDistress },
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }
  }

  if (done) {
    const set = done.reason ? RESOURCES[done.reason] : null;

    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        {set ? (
          <>
            <h1 className="font-display text-2xl mb-5 leading-snug">
              This is past what this app should be handling.
            </h1>
            <p className="text-sm leading-relaxed mb-6">{HANDOFF_NOTE}</p>
            <div className="bg-panel border border-accent/40 rounded-lg p-5 mb-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-3">
                {set.heading}
              </p>
              <div className="space-y-1.5">
                {set.lines.map((l, i) => (
                  <p key={i} className="text-sm leading-relaxed">
                    {l}
                  </p>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              The training side of the app is still open to you — memory, observation, mental
              arithmetic. It&apos;s the personal-situation conversations that need someone real
              first.
            </p>
            <Link href="/train" className="inline-block mt-6 text-sm text-accent hover:opacity-80">
              Go to training →
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl mb-5">That&apos;s everything I needed.</h1>
            {done.elevatedDistress && (
              <p className="text-sm leading-relaxed mb-5">
                One thing worth saying plainly before we start. Your answers suggest a fairly heavy
                stretch at the moment. That doesn&apos;t block anything here, and I&apos;m not
                diagnosing you. It does mean a real professional would be worth having alongside
                this, not instead of it.
              </p>
            )}
            <p className="text-sm text-muted leading-relaxed mb-8">
              I&apos;m a good first place to think something through, especially the things that
              feel awkward to take to friends. I&apos;m not a therapist and I&apos;m not a
              substitute for one, and I&apos;ll say so when we hit that line.
            </p>
            <Link
              href="/chat"
              className="inline-block bg-accent text-background font-medium px-6 py-3 rounded-md text-sm hover:opacity-90 transition-opacity"
            >
              Start talking
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl mb-3">Before we start</h1>
      <p className="text-muted mb-3 leading-relaxed">
        Eight questions. They&apos;re the standard screening wordings, not something I made up, and
        they exist so I know whether I&apos;m the right thing for you at all right now.
      </p>
      <p className="text-xs text-muted mb-12">
        Only the outcome is stored, never your individual answers.
      </p>

      <div className="space-y-9">
        {ITEMS.map((item, idx) => (
          <div key={item.id}>
            <p className="text-sm leading-relaxed mb-3">
              <span className="font-mono text-xs text-accent mr-2">{idx + 1}</span>
              {item.text}
            </p>
            <div className="flex flex-wrap gap-2">
              {(item.scale === "frequency" ? FREQUENCY_OPTIONS : ["No", "Yes"]).map((label, v) => (
                <button
                  key={label}
                  onClick={() => setAnswers((a) => ({ ...a, [item.id]: v }))}
                  className={`text-sm px-4 py-2 rounded-md border transition-colors ${
                    answers[item.id] === v
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-panel-border bg-panel text-muted hover:border-accent/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={!allAnswered}
        className="mt-12 bg-accent text-background font-medium px-6 py-3 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        Done
      </button>
    </div>
  );
}
