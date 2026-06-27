import { catalog } from "./catalog";

export function Browse({ onOpenShow }: { onOpenShow: (id: string) => void }) {
  return (
    <div className="row"><h2>Browse all</h2>
      <div className="grid">
        {catalog.map((s) => (
          <div className="card" key={s.id} onClick={() => onOpenShow(s.id)}>
            <div className="poster" style={{ background: s.img }} />
            <div className="meta"><b>{s.title}</b><p>{s.blurb}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}