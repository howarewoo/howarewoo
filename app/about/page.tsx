import { about } from "@/lib/about";

export const metadata = { title: "About — Adam Woo" };

export default function AboutPage() {
  return (
    <section className="py-12">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">About</h1>
      <div className="max-w-xl space-y-4">
        {about.bio.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        {about.social.map((s) => (
          <a
            key={s.label}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {s.label}
          </a>
        ))}
      </div>
    </section>
  );
}
