import { getServerSupabase } from "@/lib/supabase/server";
import SignInForm from "../plan/SignInForm";
import DossierList, { type DossierRow } from "./DossierList";

export default async function DossierPage() {
  const supabase = await getServerSupabase();

  if (!supabase) {
    return (
      <Shell>
        <p className="text-muted">Storage isn&apos;t configured in this environment yet.</p>
      </Shell>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <p className="text-muted mb-6">
          Sign in to see what he&apos;s keeping track of. Nothing is remembered for guests.
        </p>
        <SignInForm />
      </Shell>
    );
  }

  const { data, error } = await supabase
    .from("mentalist_memory")
    .select("id, kind, subject, detail, confidence, status, updated_at")
    .order("updated_at", { ascending: false });

  // The table only exists once the migration is applied. Say that plainly
  // rather than rendering a convincingly empty dossier.
  if (error) {
    return (
      <Shell>
        <p className="text-muted leading-relaxed">
          Memory isn&apos;t switched on yet — the database migration hasn&apos;t been applied. Until
          then he starts every conversation from scratch.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {!data || data.length === 0 ? (
        <p className="text-muted leading-relaxed">
          Nothing yet. He picks things up as you talk — people you mention, situations that are
          still open, patterns in how you handle things. It all shows up here, and you can delete
          any of it.
        </p>
      ) : (
        <DossierList rows={data as DossierRow[]} />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="font-display text-3xl mb-3">What he remembers</h1>
      <p className="text-muted mb-10 max-w-lg leading-relaxed">
        Everything the Mentalist is holding onto about you. Delete anything you&apos;d rather he
        forgot.
      </p>
      {children}
    </div>
  );
}
