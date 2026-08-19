"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Training } from "@/lib/content/types";

interface PlanItem {
  slug: string;
  rationale: string;
  order: number;
  completed: boolean;
}

interface PlanRow {
  id: string;
  goal: string;
  items: PlanItem[];
  created_at: string;
}

export default function PlanList({
  plans,
  trainingsBySlug,
}: {
  plans: PlanRow[];
  trainingsBySlug: Record<string, Training>;
}) {
  const [state, setState] = useState(plans);

  async function toggle(planId: string, slug: string) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const plan = state.find((p) => p.id === planId);
    if (!plan) return;

    const updatedItems = plan.items.map((item) =>
      item.slug === slug ? { ...item, completed: !item.completed } : item
    );

    setState((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, items: updatedItems } : p))
    );

    await supabase.from("learning_plans").update({ items: updatedItems }).eq("id", planId);
  }

  return (
    <div className="space-y-8">
      {state.map((plan) => (
        <div key={plan.id} className="bg-panel border border-panel-border rounded-lg p-6">
          <h2 className="font-display text-lg mb-1">{plan.goal}</h2>
          <p className="text-xs text-muted mb-4">
            {new Date(plan.created_at).toLocaleDateString("ru-RU")}
          </p>
          <ol className="space-y-3">
            {[...plan.items]
              .sort((a, b) => a.order - b.order)
              .map((item) => {
                const training = trainingsBySlug[item.slug];
                return (
                  <li key={item.slug} className="flex gap-3 items-start text-sm">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggle(plan.id, item.slug)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <div className={item.completed ? "opacity-50 line-through" : ""}>
                      <span className="font-medium">{training?.title ?? item.slug}</span>
                      <p className="text-muted text-xs mt-0.5">{item.rationale}</p>
                    </div>
                  </li>
                );
              })}
          </ol>
        </div>
      ))}
    </div>
  );
}
