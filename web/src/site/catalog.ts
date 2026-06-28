export interface CatalogShow {
  id: string;
  title: string;
  blurb: string;
  img: string;
}

export const catalog: CatalogShow[] = [
  { id: "frieren", title: "Frieren: Beyond Journey's End", blurb: "An elf mage reflects on time and loss.", img: "/posters/frieren.jpg" },
  { id: "jjk", title: "Jujutsu Kaisen", blurb: "Sorcerers battle curses in Shibuya.", img: "/posters/jjk.jpg" },
  { id: "ds", title: "Demon Slayer", blurb: "A boy hunts demons to cure his sister.", img: "/posters/ds.jpg" },
  { id: "csm", title: "Chainsaw Man", blurb: "A boy fused with a chainsaw devil.", img: "/posters/csm.jpg" },
  { id: "spy", title: "Spy x Family", blurb: "A spy builds a fake family for a mission.", img: "/posters/spy.jpg" },
  { id: "vinland", title: "Vinland Saga", blurb: "A young Viking seeks revenge and meaning.", img: "/posters/vinland.jpg" },
];

export function getShow(id: string): CatalogShow | undefined {
  return catalog.find((s) => s.id === id);
}