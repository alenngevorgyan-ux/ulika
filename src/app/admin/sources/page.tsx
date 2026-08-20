import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { WHITELIST, REJECTED_DOMAINS } from "@/lib/knowledge/whitelist";
import SourceManager, { type SourceRow } from "./SourceManager";

export default async function AdminSourcesPage() {
  const supabase = await getServerSupabase();
  if (!supabase) redirect("/");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/plan");

  // Owner-only. is_admin() is SECURITY DEFINER over app_admins, so this cannot
  // be spoofed from the client the way a profile flag could.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-2xl mb-3">Not for you</h1>
        <p className="text-sm text-muted leading-relaxed">
          This page manages the knowledge library and is restricted to the owner.
        </p>
      </div>
    );
  }

  const { data: sources } = await supabase
    .from("knowledge_sources")
    .select("id, title, author, type, category_id, evidence_grade, acquisition_method, licence, source_url, licence_note")
    .order("category_id");

  const { data: counts } = await supabase.from("knowledge_chunks").select("source_id");
  const chunkCounts: Record<string, number> = {};
  for (const row of counts ?? []) {
    chunkCounts[row.source_id] = (chunkCounts[row.source_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <h1 className="font-display text-3xl mb-3">Sources</h1>
      <p className="text-muted mb-10 max-w-2xl leading-relaxed">
        Everything in the library, and where it legitimately came from.
      </p>

      <section className="bg-panel border border-panel-border rounded-lg p-6 mb-10">
        <h2 className="font-display text-lg mb-3">The rule this page enforces</h2>
        <p className="text-sm text-muted leading-relaxed mb-4">
          Free to read and free to redistribute are different things. A Gottman Institute article is
          free to open and still copyrighted — copying its text into our database and serving it to
          users is redistribution, which being free to read does not license.
        </p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-accent mb-1.5">
              Redistributable
            </p>
            <p className="text-muted leading-relaxed">
              Public domain or an explicit open licence. Source text may be stored.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-accent mb-1.5">
              Reference only
            </p>
            <p className="text-muted leading-relaxed">
              Freely readable but copyrighted. We store our own notes, a citation and a link. Never
              their text.
            </p>
          </div>
        </div>
      </section>

      <SourceManager
        initial={(sources ?? []) as SourceRow[]}
        chunkCounts={chunkCounts}
        userId={user.id}
      />

      <section className="mt-14">
        <h2 className="font-display text-lg mb-4">Allowed domains</h2>
        <div className="space-y-2">
          {WHITELIST.map((w) => (
            <div key={w.domain} className="bg-panel border border-panel-border rounded-lg p-4">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-medium">{w.domain}</span>
                <span
                  className={`font-mono text-[10px] uppercase tracking-wider ${
                    w.licence === "redistributable" ? "text-accent" : "text-muted"
                  }`}
                >
                  {w.licence === "redistributable" ? "text storable" : "notes only"}
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{w.basis}</p>
            </div>
          ))}
        </div>

        <h3 className="font-display text-base mt-8 mb-3">Deliberately excluded</h3>
        {Object.entries(REJECTED_DOMAINS).map(([domain, reason]) => (
          <div key={domain} className="border border-dashed border-panel-border rounded-lg p-4">
            <p className="text-sm font-medium mb-1">{domain}</p>
            <p className="text-xs text-muted leading-relaxed">{reason}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
