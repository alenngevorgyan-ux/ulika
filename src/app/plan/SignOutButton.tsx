"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <button onClick={signOut} className="text-xs text-muted hover:text-foreground transition-colors">
      Sign out
    </button>
  );
}
