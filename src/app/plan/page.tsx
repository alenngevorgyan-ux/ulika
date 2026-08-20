import { getServerSupabase } from "@/lib/supabase/server";
import { TRAININGS } from "@/lib/content/trainings";
import PlanList from "./PlanList";
import SignInForm from "./SignInForm";
import SignOutButton from "./SignOutButton";

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

  const { data: plans } = await supabase
    .from("learning_plans")
    .select("id, goal, items, created_at")
    .order("created_at", { ascending: false });

  const trainingsBySlug = Object.fromEntries(TRAININGS.map((t) => [t.slug, t]));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="font-display text-3xl">My plan</h1>
        <SignOutButton />
      </div>
      <p className="text-muted mb-10">Plans built around goals you named.</p>

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
