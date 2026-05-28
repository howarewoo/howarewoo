import Link from "next/link";
import { Hero } from "@/components/hero";
import { ProjectGrid } from "@/components/project-grid";
import { getFeaturedProjects } from "@/lib/projects";
import { about } from "@/lib/about";

export default function Home() {
  const featured = getFeaturedProjects();
  return (
    <>
      <Hero />

      <section className="py-8">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Selected work</h2>
          <Link href="/projects" className="text-sm text-muted-foreground">
            All projects →
          </Link>
        </div>
        <ProjectGrid projects={featured} />
      </section>

      <section className="py-8">
        <h2 className="text-xl font-semibold">About</h2>
        <p className="mt-3 max-w-xl text-muted-foreground">{about.intro}</p>
        <Link
          href="/about"
          className="mt-3 inline-block text-sm text-muted-foreground"
        >
          More about me →
        </Link>
      </section>
    </>
  );
}
