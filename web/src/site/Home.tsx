import { catalog } from "./catalog";

export function Home({ onOpenShow }: { onOpenShow: (id: string) => void }) {
  return (
    <>
      <div className="hero"><h1>Welcome</h1></div>
      <div className="row"><h2>Popular this season</h2>
        <div className="grid">
          {catalog.map((s) => (
            <div className="card" key={s.id} onClick={() => onOpenShow(s.id)}>
              <div className="poster" style={{ background: s.img }} />
              <div className="meta"><b>{s.title}</b><p>{s.blurb}</p></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}