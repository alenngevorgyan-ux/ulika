"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/train", label: "Training" },
  { href: "/chat", label: "Mentalist" },
  { href: "/analyze", label: "Read a conversation" },
  { href: "/dossier", label: "Dossier" },
  { href: "/plan", label: "My plan" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="border-b border-panel-border relative">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl tracking-[0.15em] text-accent">
          ULIKA
        </Link>

        {/* Five items don't fit a phone. Below lg they collapse behind a toggle
            rather than overflowing off the right edge. */}
        <nav className="hidden lg:flex gap-6 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors ${
                pathname.startsWith(link.href)
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={() => setOpen((o) => !o)}
          className="lg:hidden text-muted hover:text-foreground transition-colors p-1 -mr-1"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          <span className="block w-5 h-px bg-current mb-1.5" />
          <span className="block w-5 h-px bg-current mb-1.5" />
          <span className="block w-5 h-px bg-current" />
        </button>
      </div>

      {open && (
        <nav className="lg:hidden border-t border-panel-border bg-background px-6 py-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`block py-2.5 text-sm transition-colors ${
                pathname.startsWith(link.href) ? "text-accent" : "text-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
