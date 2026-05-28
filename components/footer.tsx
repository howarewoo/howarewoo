import { about } from "@/lib/about";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
        <span>© {about.name}</span>
        <div className="flex gap-4">
          {about.social.map((s) => {
            const external = !s.url.startsWith("mailto:");
            return (
              <a
                key={s.label}
                href={s.url}
                {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {s.label}
              </a>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
