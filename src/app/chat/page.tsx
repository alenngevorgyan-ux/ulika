"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Я Марк. Расскажи, что у тебя сейчас происходит, или скажи, чего хочешь добиться — соберём план под конкретную цель.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply ?? "Марк не ответил." }]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Не получилось связаться с Марком — проверь соединение." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 flex flex-col h-[calc(100vh-73px)]">
      <h1 className="font-display text-2xl mb-6">Марк Холодов</h1>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-accent text-background"
                : "bg-panel border border-panel-border"
            }`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="bg-panel border border-panel-border rounded-lg px-4 py-3 text-sm text-muted max-w-[85%]">
            Марк думает…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Напиши Марку..."
          className="flex-1 bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={send}
          disabled={loading}
          className="bg-accent text-background font-medium px-5 py-3 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
