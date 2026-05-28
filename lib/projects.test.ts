import { describe, it, expect } from "vitest";
import { getProject, getFeaturedProjects, projects } from "@/lib/projects";

describe("getProject", () => {
  it("returns the project matching the slug", () => {
    expect(getProject("woo-stack")?.title).toBe("Woo Stack");
  });

  it("returns undefined for an unknown slug", () => {
    expect(getProject("does-not-exist")).toBeUndefined();
  });
});

describe("getFeaturedProjects", () => {
  it("returns only featured projects", () => {
    const featured = getFeaturedProjects();
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((p) => p.featured)).toBe(true);
  });
});

describe("project data integrity", () => {
  it("every project has a unique slug", () => {
    const slugs = projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
