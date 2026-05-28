export type ProjectLink = { label: string; url: string };

export type Project = {
  slug: string; // URL segment, e.g. "woo-stack"
  title: string;
  tagline: string; // one-liner shown on cards
  description: string; // longer body; blank lines split into paragraphs
  tags: string[];
  links: ProjectLink[];
  coverImage?: string; // optional, for editorial restyle later
  featured?: boolean; // include on the home page grid
  year?: string;
};

export const projects: Project[] = [
  {
    slug: "woo-stack",
    title: "Woo Stack",
    tagline:
      "Tells AI agents how to start projects on current framework versions.",
    description:
      "Woo Stack tells AI agents how to start web, mobile, and API projects on current framework versions.\n\nIt is a spec, not a boilerplate — guidance the agent reads, not code it copies.",
    tags: ["AI", "tooling"],
    links: [{ label: "GitHub", url: "https://github.com/howarewoo/woo-stack" }],
    featured: true,
  },
  {
    slug: "woo-review",
    title: "Woo Review",
    tagline: "Portable AI pull-request reviews across multiple model providers.",
    description:
      "Woo Review is a portable AI skill and GitHub Action.\n\nIt runs pull request reviews in parallel across Anthropic, OpenAI, Google, and OpenRouter.",
    tags: ["AI", "GitHub Action"],
    links: [
      { label: "GitHub", url: "https://github.com/howarewoo/woo-review" },
    ],
    featured: true,
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getFeaturedProjects(): Project[] {
  return projects.filter((p) => p.featured);
}
