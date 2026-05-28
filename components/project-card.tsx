import Link from "next/link";
import type { Project } from "@/lib/projects";
import { Tag } from "@/components/tag";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="block rounded-lg border p-5 transition hover:shadow-sm"
    >
      <h3 className="text-lg font-semibold">{project.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{project.tagline}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {project.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
    </Link>
  );
}
