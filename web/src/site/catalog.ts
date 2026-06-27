export interface CatalogShow {
  id: string;
  title: string;
  blurb: string;
  img: string;
}

export const catalog: CatalogShow[] = [
  { id: "frieren", title: "Frieren: Beyond Journey's End", blurb: "An elf mage reflects on time and loss.", img: "linear-gradient(135deg,#3b82f6,#1e3a8a)" },
  { id: "jjk", title: "Jujutsu Kaisen", blurb: "Sorcerers battle curses in Shibuya.", img: "linear-gradient(135deg,#ef4444,#7f1d1d)" },
  { id: "ds", title: "Demon Slayer", blurb: "A boy hunts demons to cure his sister.", img: "linear-gradient(135deg,#10b981,#064e3b)" },
  { id: "csm", title: "Chainsaw Man", blurb: "A boy fused with a chainsaw devil.", img: "linear-gradient(135deg,#f59e0b,#7c2d12)" },
  { id: "spy", title: "Spy x Family", blurb: "A spy builds a fake family for a mission.", img: "linear-gradient(135deg,#8b5cf6,#4c1d95)" },
  { id: "vinland", title: "Vinland Saga", blurb: "A young Viking seeks revenge and meaning.", img: "linear-gradient(135deg,#64748b,#1e293b)" },
];

export function getShow(id: string): CatalogShow | undefined {
  return catalog.find((s) => s.id === id);
}