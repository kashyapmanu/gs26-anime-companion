import { getShow } from "./catalog";

export function Show({ id, onBack }: { id: string; onBack: () => void }) {
  const s = getShow(id);
  if (!s) return <p>Show not found.</p>;
  return (
    <div className="show-detail">
      <div className="poster">
        <img src={s.img} alt={s.title} />
      </div>
      <div className="content">
        <h1>{s.title}</h1>
        <p>{s.blurb}</p>
        <p><a onClick={onBack} className="back-link">← Back to Home</a></p>
      </div>
    </div>
  );
}