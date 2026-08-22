import { getServerSupabase } from "@/lib/supabase/server";
import { labEnabled } from "./labAccess";

export type ManualAccess =
  | { status: "disabled" | "guest" | "denied"; ownerId: null }
  | { status: "admin"; ownerId: string };

export async function manualAccess(): Promise<ManualAccess> {
  if (!labEnabled()) return { status: "disabled", ownerId: null };
  const supabase = await getServerSupabase();
  if (!supabase) return { status: "disabled", ownerId: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "guest", ownerId: null };
  const { data } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return data
    ? { status: "admin", ownerId: user.id }
    : { status: "denied", ownerId: null };
}

export async function manualAdminId(): Promise<string | null> {
  return (await manualAccess()).ownerId;
}
