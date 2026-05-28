import { ProjectGrid } from "@/components/project-grid";
import { projects } from "@/lib/projects";

export const metadata = { title: "Projects — Adam Woo" };

export default function ProjectsPage() {
  return (
    <section className="py-12">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Projects</h1>
      <ProjectGrid projects={projects} />
    </section>
  );
}
