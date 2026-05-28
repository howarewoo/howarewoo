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
