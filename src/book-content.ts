export const projects = [
  {
    slug: "triosens",
    name: "TrioSens",
    type: "AI · ANALYTICS",
    description:
      "AI brand-visibility analytics across ChatGPT, Gemini, Claude, and other AI platforms.",
    url: "https://triosens.io",
    link: "Visit TrioSens",
  },
  {
    slug: "woostack",
    name: "woostack",
    type: "DEVELOPER TOOLS · OPEN SOURCE",
    description:
      "An installable collection of skills that encode my software-development process for AI agents — bootstrap, build, review, iterate — across new and existing codebases. Also runs PR review swarms in CI as a GitHub Action.",
    url: "https://github.com/howarewoo/woostack",
    link: "Explore on GitHub",
  },
  {
    slug: "omp-remote",
    name: "OMP Remote",
    type: "ARCHIVED · PWA",
    description:
      "An archived, phone-first PWA for supervising multiple Oh My Pi coding sessions from a private Tailnet.",
    url: "https://github.com/howarewoo/omp-remote",
    link: "View the archive on GitHub",
  },
];

export type BookPage = {
  title: string;
  paragraphs: string[];
  url?: string;
  link?: string;
};

export type BookSpread = {
  left: BookPage;
  right: BookPage;
};

export const bookSpreads: BookSpread[] = [
  {
    left: {
      title: "Selected work.",
      paragraphs: ["A few things I’ve been building."],
    },
    right: {
      title: "Hello, I’m Adam.",
      paragraphs: [
        "An engineer who likes making things.",
        "Former senior engineer at Meta Superintelligence Lab and Instagram.",
        "These days, my projects include TrioSens and woostack: tools for understanding AI brand visibility and working with AI coding agents.",
      ],
    },
  },
  {
    left: {
      title: projects[0].name,
      paragraphs: [projects[0].type],
      url: projects[0].url,
      link: projects[0].link,
    },
    right: {
      title: projects[0].name,
      paragraphs: [projects[0].type, projects[0].description],
      url: projects[0].url,
      link: projects[0].link,
    },
  },
  {
    left: {
      title: projects[1].name,
      paragraphs: [projects[1].type],
      url: projects[1].url,
      link: projects[1].link,
    },
    right: {
      title: projects[1].name,
      paragraphs: [projects[1].type, projects[1].description],
      url: projects[1].url,
      link: projects[1].link,
    },
  },
  {
    left: {
      title: projects[2].name,
      paragraphs: [projects[2].type],
      url: projects[2].url,
      link: projects[2].link,
    },
    right: {
      title: projects[2].name,
      paragraphs: [projects[2].type, projects[2].description],
      url: projects[2].url,
      link: projects[2].link,
    },
  },
];
