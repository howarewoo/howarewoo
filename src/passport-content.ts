import content from "./passport-content.json";
import type { BookSpread } from "./book-content";

type TravelStamp = { country: string; place: string; date: string };
const stamps: TravelStamp[] = content.stamps;
export const passportSpreads: BookSpread[] = [
  {
    right: {
      title: "Adam’s passport",
      paragraphs: [
        `Name: ${content.name}. Gender: ${content.gender}.`,
        "Portrait from Adam’s public GitHub profile.",
        "Personal portfolio, not a travel document.",
      ],
    },
    left: { title: "Hello, I’m Adam.", paragraphs: content.biography },
  },
  ...Array.from(
    { length: Math.max(1, Math.ceil(stamps.length / 4)) },
    (_, spread) => {
      const page = (side: number) => {
        const entries = stamps.slice(
          spread * 4 + side * 2,
          spread * 4 + side * 2 + 2,
        );
        return {
          title: "Travel stamps",
          paragraphs: entries.length
            ? entries.map(
                (stamp) => `${stamp.country} — ${stamp.place}, ${stamp.date}`,
              )
            : ["No travel stamps added yet."],
        };
      };
      return { left: page(0), right: page(1) };
    },
  ),
];
export const passportPageImages = passportSpreads.flatMap((_, index) => [
  `/textures/passport/${index}-left.jpg`,
  `/textures/passport/${index}-right.jpg`,
]);
