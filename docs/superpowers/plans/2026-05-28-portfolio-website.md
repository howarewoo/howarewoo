# Portfolio Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a multi-page Next.js portfolio site (home, projects list, project detail, about) driven by typed TypeScript data, deployable to Vercel.

**Architecture:** Next.js App Router at the repo root. Project content lives in `lib/projects.ts` as typed data with pure helper functions; about content in `lib/about.ts`. Pages are server components that read this data. Presentational components (`Nav`, `Footer`, `Hero`, `ProjectCard`, `ProjectGrid`, `Tag`) carry only placeholder styling so a later editorial restyle touches tokens and components, not routing or data. shadcn/ui supplies theme tokens and `cn` utility.

**Tech Stack:** Next.js (latest, App Router) · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui · Vitest (data-layer tests) · deploy to Vercel.

**Spec:** `docs/superpowers/specs/2026-05-28-portfolio-website-design.md`

---

## File Structure

Created by this plan (at repo root):

```
app/layout.tsx              # root layout: metadata + Nav + main + Footer
app/page.tsx                # home: Hero + featured grid + about teaser
app/globals.css             # Tailwind + shadcn theme tokens (from create-next-app + shadcn init)
app/projects/page.tsx       # all projects grid
app/projects/[slug]/page.tsx# project detail (static-generated) + notFound
app/about/page.tsx          # about-me page
components/nav.tsx
components/footer.tsx
components/hero.tsx
components/project-card.tsx
components/project-grid.tsx
components/tag.tsx
components/ui/              # shadcn primitives (created on demand by shadcn)
lib/projects.ts             # Project type + data + getProject/getFeaturedProjects
lib/projects.test.ts        # Vitest unit tests for the data helpers
lib/about.ts                # bio + social links
lib/utils.ts                # cn() helper (created by shadcn init)
vitest.config.ts            # Vitest config with tsconfig path resolution
components.json             # shadcn config (created by shadcn init)
```

Preserved as-is: `README.md` (GitHub profile, gets dev/deploy notes appended), `.gitignore`, `docs/`, `.claude/`, `.agents/`, `skills-lock.json`, `.gitattributes`.

---

## Task 1: Scaffold Next.js app at repo root

`create-next-app` refuses to run in a non-empty directory, and this repo already contains `docs/`, `README.md`, etc. So scaffold into a temp subdirectory, discard its `.git`/`README`/`.gitignore`, then move the generated files up to the root.

**Files:**
- Create: `app/`, `public/`, `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `app/globals.css`, `next-env.d.ts` (all from create-next-app)

- [ ] **Step 1: Run create-next-app into a temp subdirectory**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo
npx create-next-app@latest portfolio-tmp \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-npm --turbopack --yes
```
Expected: completes with "Success! Created portfolio-tmp ..." and installs dependencies.

- [ ] **Step 2: Remove files we maintain ourselves and the temp git repo**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo/portfolio-tmp
rm -rf .git README.md .gitignore
```
Expected: no output. (We keep the repo's existing `README.md` and `.gitignore`.)

- [ ] **Step 3: Move generated files up to repo root, then remove temp dir**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo/portfolio-tmp
shopt -s dotglob
mv * /Users/adamwoo/Documents/GitHub/howarewoo/
cd /Users/adamwoo/Documents/GitHub/howarewoo
rmdir portfolio-tmp
```
Expected: `portfolio-tmp` is empty and removed. Root now has `app/`, `package.json`, `node_modules/`, etc.

- [ ] **Step 4: Verify the dev build compiles**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo
npm run build
```
Expected: "Compiled successfully" and a route table listing `/` as a static route. No type or lint errors.

- [ ] **Step 5: Confirm .gitignore already covers Next artifacts**

Run:
```bash
grep -E '\.next|node_modules|next-env' /Users/adamwoo/Documents/GitHub/howarewoo/.gitignore
```
Expected: matches for `/.next/`, `/node_modules`, and `next-env.d.ts` (the repo `.gitignore` already contains these). If any are missing, add them.

- [ ] **Step 6: Commit**

```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo
git add -A
git commit -m "Scaffold Next.js app at repo root"
```

---

## Task 2: Initialize shadcn/ui (theme tokens + cn helper)

shadcn init rewrites `app/globals.css` with theme tokens (CSS variables: `--background`, `--foreground`, `--muted-foreground`, `--border`, etc.) and creates `lib/utils.ts` with `cn()`. Components in later tasks use the `text-muted-foreground` and `border` token classes, so this must run before them.

**Files:**
- Create: `components.json`, `lib/utils.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Run shadcn init with defaults**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo
npx shadcn@latest init -d
```
Expected: "Success! Project initialization completed." Creates `components.json` and `lib/utils.ts`, updates `app/globals.css`.

- [ ] **Step 2: Verify theme tokens exist**

Run:
```bash
grep -E 'muted-foreground|--border' /Users/adamwoo/Documents/GitHub/howarewoo/app/globals.css
```
Expected: at least one match — the token variables are present.

- [ ] **Step 3: Verify build still passes**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run build
```
Expected: "Compiled successfully".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Initialize shadcn/ui theme tokens"
```

---

## Task 3: Data layer — Project type, data, and helpers (TDD)

**Files:**
- Create: `lib/projects.ts`
- Test: `lib/projects.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `test` script + devDeps)

- [ ] **Step 1: Install Vitest and tsconfig path resolver**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo
npm install -D vitest vite-tsconfig-paths
```
Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add the `test` script to package.json**

In `package.json`, add to the `"scripts"` object:
```json
"test": "vitest run"
```
The scripts block should look like (alongside the existing dev/build/start/lint entries):
```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run"
}
```
(Keep whatever `dev`/`build`/`start`/`lint` values create-next-app generated — only add the `test` line.)

- [ ] **Step 4: Write the failing test**

Create `lib/projects.test.ts`:
```ts
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
```

- [ ] **Step 5: Run the test to verify it fails**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm test
```
Expected: FAIL — cannot resolve `@/lib/projects` (file does not exist yet).

- [ ] **Step 6: Implement the data layer**

Create `lib/projects.ts`:
```ts
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm test
```
Expected: PASS — all 4 tests green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add typed project data layer with tests"
```

---

## Task 4: About content

**Files:**
- Create: `lib/about.ts`

- [ ] **Step 1: Create the about data module**

Create `lib/about.ts`:
```ts
export type SocialLink = { label: string; url: string };

export const about = {
  name: "Adam Woo",
  role: "Engineer & founder",
  // Short line for the hero and home-page teaser.
  intro:
    "Technical co-founder at TrioSens. Previously engineer at Meta Superintelligence Lab and Instagram.",
  // Full bio, one entry per paragraph, for the /about page.
  bio: [
    "I'm Adam Woo, an engineer and technical co-founder at TrioSens. I spend most of my time on AI developer tools — software that makes coding agents genuinely useful inside real projects.",
    "Before TrioSens I was an engineer at Meta Superintelligence Lab and at Instagram.",
  ],
  social: [
    { label: "LinkedIn", url: "https://linkedin.com/in/adam-woo-11733ba4/" },
    { label: "GitHub", url: "https://github.com/howarewoo" },
    { label: "Email", url: "mailto:adam.nathaniel.woo@gmail.com" },
  ] as SocialLink[],
};
```
Note: the `mailto:` email is editable — remove or change it if you'd rather not publish it.

- [ ] **Step 2: Type-check by building**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add about content module"
```

---

## Task 5: Shared layout components — Tag, Nav, Footer

**Files:**
- Create: `components/tag.tsx`, `components/nav.tsx`, `components/footer.tsx`

- [ ] **Step 1: Create the Tag component**

Create `components/tag.tsx`:
```tsx
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border px-2 py-0.5 text-xs">
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create the Nav component**

Create `components/nav.tsx`:
```tsx
import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold">
          Adam Woo
        </Link>
        <div className="flex gap-6 text-sm">
          <Link href="/projects">Projects</Link>
          <Link href="/about">About</Link>
        </div>
      </nav>
    </header>
  );
}
```

- [ ] **Step 3: Create the Footer component**

Create `components/footer.tsx`:
```tsx
import { about } from "@/lib/about";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
        <span>© {about.name}</span>
        <div className="flex gap-4">
          {about.social.map((s) => (
            <a key={s.label} href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Type-check**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Tag, Nav, and Footer components"
```

---

## Task 6: Project presentation components — ProjectCard, ProjectGrid, Hero

**Files:**
- Create: `components/project-card.tsx`, `components/project-grid.tsx`, `components/hero.tsx`

- [ ] **Step 1: Create the ProjectCard component**

Create `components/project-card.tsx`:
```tsx
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
```

- [ ] **Step 2: Create the ProjectGrid component**

Create `components/project-grid.tsx`:
```tsx
import type { Project } from "@/lib/projects";
import { ProjectCard } from "@/components/project-card";

export function ProjectGrid({ projects }: { projects: Project[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {projects.map((p) => (
        <ProjectCard key={p.slug} project={p} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the Hero component**

Create `components/hero.tsx`:
```tsx
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
```

- [ ] **Step 4: Type-check**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add ProjectCard, ProjectGrid, and Hero components"
```

---

## Task 7: Root layout — wire Nav, main container, Footer

The create-next-app root layout renders fonts and `{children}` only. Replace it so every page gets the Nav, a centered `main`, and the Footer.

**Files:**
- Modify: `app/layout.tsx` (replace entire file)

- [ ] **Step 1: Replace the root layout**

Replace the entire contents of `app/layout.tsx` with:
```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: "Adam Woo",
  description: "Engineer & founder. Building AI developer tools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-3xl px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run build
```
Expected: "Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Wire Nav and Footer into root layout"
```

---

## Task 8: Home page

**Files:**
- Modify: `app/page.tsx` (replace entire file)

- [ ] **Step 1: Replace the home page**

Replace the entire contents of `app/page.tsx` with:
```tsx
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
```

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run build
```
Expected: "Compiled successfully", `/` listed as static.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Build home page"
```

---

## Task 9: Projects list page

**Files:**
- Create: `app/projects/page.tsx`

- [ ] **Step 1: Create the projects list page**

Create `app/projects/page.tsx`:
```tsx
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
```

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run build
```
Expected: "Compiled successfully", `/projects` listed as static.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add projects list page"
```

---

## Task 10: Project detail page (static-generated)

**Files:**
- Create: `app/projects/[slug]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `app/projects/[slug]/page.tsx`. Note `params` is a Promise in the current Next.js App Router and must be awaited:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject, projects } from "@/lib/projects";
import { Tag } from "@/components/tag";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  return {
    title: project ? `${project.title} — Adam Woo` : "Project — Adam Woo",
  };
}

export default async function ProjectDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const paragraphs = project.description
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <article className="py-12">
      <Link href="/projects" className="text-sm text-muted-foreground">
        ← Projects
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">
        {project.title}
      </h1>
      <p className="mt-2 text-lg text-muted-foreground">{project.tagline}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {project.tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
      <div className="mt-8 space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        {project.links.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {l.label}
          </a>
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Build and confirm both detail pages prerender**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run build
```
Expected: "Compiled successfully". The route output lists `/projects/[slug]` as SSG with 2 prerendered paths (`/projects/woo-stack`, `/projects/woo-review`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add static-generated project detail page"
```

---

## Task 11: About page

**Files:**
- Create: `app/about/page.tsx`

- [ ] **Step 1: Create the about page**

Create `app/about/page.tsx`:
```tsx
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
```

- [ ] **Step 2: Build**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run build
```
Expected: "Compiled successfully", `/about` listed as static.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add about page"
```

---

## Task 12: README notes + full verification

**Files:**
- Modify: `README.md` (append a section; do not touch the existing profile content above it)

- [ ] **Step 1: Append development/deploy notes to README**

Append to the end of `README.md`:
```markdown

---

## Portfolio site

This repo also contains the source for my portfolio website (Next.js, App Router).

**Local development:**

```bash
npm install
npm run dev      # http://localhost:3000
```

**Other commands:**

```bash
npm run build    # production build
npm test         # run data-layer unit tests
```

**Deploy:** hosted on Vercel. Pushing to the default branch triggers a production deploy; Vercel auto-detects Next.js with zero configuration. Project content lives in `lib/projects.ts`; add a new object to the `projects` array to add a project.
```

- [ ] **Step 2: Run the full verification suite**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo
npm test && npm run lint && npm run build
```
Expected: tests PASS, lint clean, build "Compiled successfully" with the route table showing `/`, `/about`, `/projects`, and `/projects/[slug]` (2 prerendered paths).

- [ ] **Step 3: Manually verify routes in the dev server**

Run:
```bash
cd /Users/adamwoo/Documents/GitHub/howarewoo && npm run dev
```
Then load each URL and confirm it renders with seeded content, then stop the server (Ctrl-C):
- http://localhost:3000/ — hero, two featured cards, about teaser, footer links
- http://localhost:3000/projects — both project cards
- http://localhost:3000/projects/woo-stack — detail with paragraphs + GitHub link
- http://localhost:3000/projects/woo-review — detail page
- http://localhost:3000/about — bio paragraphs + social links
- http://localhost:3000/projects/nonexistent — Next.js 404 page

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add portfolio dev/deploy notes to README"
```

---

## Self-Review Notes

**Spec coverage:**
- Stack (Next.js App Router, TS, Tailwind+shadcn, Vercel) → Tasks 1, 2, 12.
- Routes `/`, `/projects`, `/projects/[slug]`, `/about` → Tasks 8, 9, 10, 11.
- 404 on unknown slug via `notFound()` → Task 10.
- `Project` type + `getProject`/`getFeaturedProjects` + `generateStaticParams` → Tasks 3, 10.
- `description` rendered as paragraphs split on blank lines → Task 10.
- `lib/about.ts` seeded from README → Task 4.
- Components (Nav, Footer, Hero, ProjectCard, ProjectGrid, Tag) → Tasks 5, 6.
- Centralized theme tokens for later editorial restyle → Task 2 (shadcn tokens in `globals.css`).
- Seed content (Woo Stack, Woo Review, bio, social) → Tasks 3, 4.
- `.gitignore` covers `.next/`, `node_modules`, `.superpowers/` → already in repo (verified Task 1 Step 5; `.superpowers/` added during spec commit).
- Vercel zero-config + README notes → Task 12.
- Success criteria (build clean, routes render, each project → detail page, deploy-ready) → Task 12.

**Out of scope (confirmed absent):** no MDX, CMS, blog, contact form, analytics, dark-mode toggle.

**Type consistency:** `Project`/`ProjectLink` defined in Task 3 and imported (type-only) in Tasks 6, 10. `about` shape defined in Task 4, consumed in Tasks 5, 6, 8, 11. Helper names `getProject`/`getFeaturedProjects` consistent across Tasks 3, 8, 10. `params: Promise<{ slug: string }>` awaited in both functions in Task 10.
