import { about } from "@/lib/about";

export function Hero() {
  return (
    <section className="py-16">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">
        {about.name}
      </p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">{about.role}</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">{about.intro}</p>
    </section>
  );
}
