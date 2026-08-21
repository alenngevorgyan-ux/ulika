import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { labEnabled, LAB_MODEL_CHOICES } from "@/lib/megabrain/labAccess";
import { MODES } from "@/lib/megabrain/analysisMode";
import { modeCost } from "@/lib/megabrain/costReport";
import LabClient from "./LabClient";

/**
 * The closed lab. Two gates, both server-side, both returning 404 rather than
 * 403: a surface that is off should not confirm it exists.
 *
 * There is no link to this page anywhere in the product.
 */
export default async function MegabrainLabPage() {
  if (!labEnabled()) notFound();

  const supabase = await getServerSupabase();
  if (!supabase) notFound();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: admin } = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!admin) notFound();

  // Costs computed on the server so the page cannot be talked into showing a
  // cheaper number than the run will actually reserve.
  const modes = (["light", "standard", "strong", "deep"] as const).map((id) => {
    const c = modeCost(id);
    return {
      id,
      label: MODES[id].label,
      capUsd: c.capUsd,
      expectedUsd: c.expectedUsd,
      reservedUsd: c.reservedUsd,
      maxModelCalls: c.maxModelCalls,
      available: c.available,
      unavailableReason: MODES[id].unavailableReason ?? null,
    };
  });

  const models = Object.entries(LAB_MODEL_CHOICES).map(([id, m]) => ({
    id,
    label: m.label,
    available: m.available,
    note: m.note,
  }));

  return <LabClient modes={modes} models={models} />;
}
