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
        <h1 className="font-display text-3xl mb-4">Мой план</h1>
        <p className="text-muted">
          Supabase ещё не подключён в этом окружении — планы, которые собирает Марк, пока не
          сохраняются между сессиями. Как только появятся ключи проекта, планы будут доступны здесь.
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
        <h1 className="font-display text-3xl mb-4">Мой план</h1>
        <p className="text-muted mb-6">
          Войди по почте, чтобы видеть планы, которые собирает Марк, и сохранять новые.
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
        <h1 className="font-display text-3xl">Мой план</h1>
        <SignOutButton />
      </div>
      <p className="text-muted mb-10">Планы, которые собрал Марк по твоим целям.</p>

      {!plans || plans.length === 0 ? (
        <p className="text-muted">
          Пока нет ни одного плана — иди поговори с Марком о цели, и он соберёт первый.
        </p>
      ) : (
        <PlanList plans={plans as PlanRow[]} trainingsBySlug={trainingsBySlug} />
      )}
    </div>
  );
}
