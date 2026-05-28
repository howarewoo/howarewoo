# Portfolio Website — Design Spec

**Date:** 2026-05-28
**Owner:** Adam Woo
**Status:** Approved, ready for implementation planning

## Summary

A personal portfolio website built with Next.js (App Router). It hosts
project showcases and an about-me section. This spec covers the scaffolding
and structure only. Visual design (a fashion-editorial-magazine aesthetic)
will be applied later with a separate styling pass; the scaffolding must leave
that restyle easy.

## Goals

- Multi-page site: home, projects list, per-project detail, about.
- Project content stored as typed data in a single TypeScript file.
- Clean, focused, presentational components that are easy to restyle later.
- Seeded with real content (bio + two projects) so the site is not empty.
- Deployable to Vercel with zero extra configuration.

## Non-Goals (YAGNI)

- MDX or a headless CMS.
- Blog or articles section.
- Contact form (contact is link-only in the footer).
- Analytics, newsletter, or comment system.
- Dark-mode toggle. (Theme tokens exist, but no toggle UI.)
- Final visual design — handled separately after scaffolding.

## Stack

- **Framework:** Next.js, latest version, App Router.
- **Language:** TypeScript, strict mode.
- **Styling:** Tailwind CSS plus shadcn/ui primitives.
- **Lint:** ESLint (Next.js default config).
- **Deploy:** Vercel (zero-config from repo root).

## Repository Layout

The app is scaffolded at the repository root. The existing `README.md` stays
in place as the GitHub profile README and coexists with the app. Vercel
deploys from the root.

```
app/
  layout.tsx              # root layout: Nav + Footer + theme
  page.tsx                # home
  projects/
    page.tsx              # projects list
    [slug]/
      page.tsx            # project detail (static-generated)
  about/
    page.tsx              # about-me page
components/
  nav.tsx
  footer.tsx
  hero.tsx
  project-card.tsx
  project-grid.tsx
  tag.tsx
  ui/                     # shadcn primitives
lib/
  projects.ts             # Project type + data + helpers
  about.ts                # bio + social links
app/globals.css           # Tailwind + theme tokens (CSS variables)
```

## Routes

| Route                 | Purpose                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| `/`                   | Hero/intro, featured projects grid, about teaser, footer contact links. |
| `/projects`           | All projects as a card grid.                                            |
| `/projects/[slug]`    | Single project detail page. Static-generated.                           |
| `/about`              | Full about-me page.                                                     |

A 404 is shown for unknown project slugs via `notFound()`.

## Data Layer

All project content lives in `lib/projects.ts`.

```ts
export type ProjectLink = { label: string; url: string };

export type Project = {
  slug: string;            // URL segment, e.g. "woo-stack"
  title: string;
  tagline: string;         // one-liner shown on cards
  description: string;     // longer body; rendered as paragraphs on detail page
  tags: string[];          // e.g. ["AI", "tooling"]
  links: ProjectLink[];    // GitHub, live demo, etc.
  coverImage?: string;     // optional image path for editorial restyle later
  featured?: boolean;      // include in the home page grid
  year?: string;
};

export const projects: Project[];

export function getProject(slug: string): Project | undefined;
export function getFeaturedProjects(): Project[];
```

- The detail page renders `description` as multiple paragraphs by splitting on
  blank lines. No Markdown parsing.
- `generateStaticParams` iterates `projects` to pre-render every detail page.

About content lives in `lib/about.ts` (bio text plus social links), seeded
from the README.

## Components

Each component is presentational and single-purpose so the later editorial
restyle touches tokens and components, not page logic.

- `Nav` — site header with links to Home, Projects, About.
- `Footer` — contact links: LinkedIn, GitHub, email.
- `Hero` — name, role, short intro on the home page.
- `ProjectCard` — title, tagline, tags, link; used in grids.
- `ProjectGrid` — lays out a list of `ProjectCard`s.
- `Tag` — small pill for a single tag.
- shadcn primitives under `components/ui/` as needed (button, card, etc.).

## Styling Posture

- Minimal, neutral placeholder styling for the scaffolding phase.
- Theme tokens (colors, spacing, fonts) centralized as CSS variables in
  `globals.css` and wired through the Tailwind config, so the editorial
  redesign changes tokens and component styles rather than structure.
- No bespoke visual polish now; the goal is correct structure and clean
  separation.

## Seed Content

Pulled from the existing README:

- **About:** Technical co-founder at TrioSens; previously engineer at Meta
  Superintelligence Lab and Instagram.
- **Projects:**
  - **Woo Stack** — tells AI agents how to start web, mobile, and API projects
    on current framework versions. A spec, not a boilerplate.
    (https://github.com/howarewoo/woo-stack)
  - **Woo Review** — portable AI skill and GitHub Action. Runs PR reviews in
    parallel across Anthropic, OpenAI, Google, and OpenRouter.
    (https://github.com/howarewoo/woo-review)
- **Social links:** LinkedIn (https://linkedin.com/in/adam-woo-11733ba4/),
  GitHub, email.

## Configuration

- TypeScript strict mode.
- ESLint with the Next.js config.
- `.gitignore` covers Node, Next (`.next/`), and `.superpowers/`.
- Vercel: no special config required; root-directory deploy. README gains a
  short "Local development" and "Deploy" note.

## Deployment

Deploy to Vercel from the repository root. Production build is `next build`;
Vercel auto-detects the Next.js framework. No environment variables are
required for the scaffolding.

## Success Criteria

- `next build` succeeds with no type or lint errors.
- All four route types render with seeded content.
- Each project in `lib/projects.ts` produces a working detail page.
- The site deploys to Vercel without manual configuration.
- Restyling into the editorial look later requires changes to tokens and
  components only, not to routing or data code.
