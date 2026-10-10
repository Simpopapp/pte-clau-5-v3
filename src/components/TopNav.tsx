import { Link } from "@tanstack/react-router";

const links = [
  { to: "/", label: "Início" },
  { to: "/speaking", label: "Falar" },
  { to: "/writing", label: "Escrever" },
  { to: "/reading", label: "Ler" },
  { to: "/listening", label: "Ouvir" },
  { to: "/session", label: "Sessão" },
  { to: "/exam", label: "Simulado" },
  { to: "/progress", label: "Progresso" },
  { to: "/settings", label: "Ajustes" },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex shrink-0 items-baseline gap-2">
          <span className="font-serif text-lg font-semibold tracking-tight">PTE Master Hub</span>
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-primary sm:inline">
            19 task types
          </span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-0.5 text-sm sm:gap-1">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{
                className: "!text-primary-foreground bg-secondary text-foreground font-medium",
              }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
