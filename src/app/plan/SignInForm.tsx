"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    const supabase = getBrowserSupabase();
    if (!supabase || !email.trim()) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/plan" },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p className="text-sm text-muted">
        Ссылка для входа отправлена на {email} — открой её на этом устройстве.
      </p>
    );
  }

  return (
    <div className="flex gap-2 max-w-sm">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="почта"
        className="flex-1 bg-panel border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={send}
        disabled={status === "sending"}
        className="bg-accent text-background font-medium px-4 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        Войти
      </button>
      {status === "error" && (
        <p className="text-xs text-red-400 mt-2">Не получилось отправить ссылку — попробуй ещё раз.</p>
      )}
    </div>
  );
}
