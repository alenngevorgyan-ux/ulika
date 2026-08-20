import Link from "next/link";

const LINKS = [
  { href: "/train", label: "Training" },
  { href: "/chat", label: "Mentalist" },
  { href: "/analyze", label: "Read a conversation" },
  { href: "/dossier", label: "Dossier" },
  { href: "/plan", label: "My plan" },
];

export default function Nav() {
  return (
    <header className="border-b border-panel-border">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl tracking-[0.15em] text-accent">
          ULIKA
        </Link>
        <nav className="flex gap-5 text-sm text-muted">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
