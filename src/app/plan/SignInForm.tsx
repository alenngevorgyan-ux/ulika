"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function SignInForm({ returnTo = "/plan", compact = false }: { returnTo?: string; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    const supabase = getBrowserSupabase();
    if (!supabase || !email.trim()) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + returnTo },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-muted">
        Sign-in link sent to {email}. Open it on this device.
      </p>
    );
  }

  return (
    <div className={`flex gap-2 ${compact ? "w-full" : "max-w-sm"}`}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="Founder email"
        aria-label="Founder email"
        className="min-w-0 flex-1 bg-panel border border-panel-border rounded-md px-3 sm:px-4 py-2.5 text-base md:text-sm outline-none focus:border-accent"
      />
      <button
        onClick={send}
        disabled={status === "sending"}
        className="bg-accent text-background font-medium px-4 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Sign in
      </button>
      {status === "error" && (
        <p className="text-xs text-red-400 mt-2">Couldn&apos;t send the link. Try again.</p>
      )}
    </div>
  );
}
