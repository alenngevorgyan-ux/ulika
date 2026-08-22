import { getServerSupabase } from "@/lib/supabase/server";
import { labEnabled } from "./labAccess";

export async function manualAdminId(): Promise<string | null> {
  if (!labEnabled()) return null;
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return data ? user.id : null;
}
