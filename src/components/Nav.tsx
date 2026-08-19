import Link from "next/link";

const LINKS = [
  { href: "/", label: "Главная" },
  { href: "/train", label: "Тренировки" },
  { href: "/chat", label: "Марк" },
  { href: "/plan", label: "Мой план" },
];

export default function Nav() {
  return (
    <header className="border-b border-panel-border">
      <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-xl tracking-wide text-accent">
          УЛИКА
        </Link>
        <nav className="flex gap-6 text-sm text-muted">
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
