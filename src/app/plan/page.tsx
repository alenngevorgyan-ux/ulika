import { getServerSupabase } from "@/lib/supabase/server";
import { TRAININGS } from "@/lib/content/trainings";
import PlanList from "./PlanList";
import SignInForm from "./SignInForm";
import SignOutButton from "./SignOutButton";
import TracksPanel from "./TracksPanel";
import PlanBuilder from "./PlanBuilder";
import type { Track } from "@/lib/tracks";

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

export default async function PlanPage() {
  const supabase = await getServerSupabase();

  if (!supabase) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-3xl mb-4">My plan</h1>
        <p className="text-muted">
          Storage isn&apos;t configured in this environment, so plans won&apos;t persist between sessions yet.
        </p>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-3xl mb-4">My plan</h1>
        <p className="text-muted mb-6">
          Sign in by email to keep the plans the Mentalist builds for you.
        </p>
        <SignInForm />
      </div>
    );
  }

  const [{ data: plans }, { data: tracks }] = await Promise.all([
    supabase
      .from("learning_plans")
      .select("id, goal, items, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("user_tracks")
      .select("id, track_id, label, started_at, target_pace, current_stage, last_reviewed_at")
      .order("started_at", { ascending: true }),
  ]);

  const trainingsBySlug = Object.fromEntries(TRAININGS.map((t) => [t.slug, t]));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="font-display text-3xl">My plan</h1>
        <SignOutButton />
      </div>
      <p className="text-muted mb-12">What you&apos;re running, and the plans built around it.</p>

      <PlanBuilder userId={user.id} />

      <TracksPanel initial={(tracks ?? []) as Track[]} userId={user.id} />

      <h2 className="font-display text-xl mb-2">Plans from the Mentalist</h2>
      <p className="text-sm text-muted mb-6">Built around goals you named in conversation.</p>

      {!plans || plans.length === 0 ? (
        <p className="text-muted">
          Nothing here yet. Tell the Mentalist what you&apos;re after and he&apos;ll build the first one.
        </p>
      ) : (
        <PlanList plans={plans as PlanRow[]} trainingsBySlug={trainingsBySlug} />
      )}
    </div>
  );
}
