import content from "./creative-content.json";

export type CreativeWork = {
  title: string;
  description: string;
  image: string;
};
export type Photo = {
  id: string;
  image: string | null;
  caption: string;
  alt: string;
};

export const artWorks: CreativeWork[] = content.art;
export const fashionWorks: CreativeWork[] = content.fashion;
export const photos: Photo[] = content.photos;
