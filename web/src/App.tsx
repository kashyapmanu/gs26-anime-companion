import { useState } from "react";
import { Home } from "./site/Home";
import { Browse } from "./site/Browse";
import { Show } from "./site/Show";
import { CompanionWidget } from "./companion/CompanionWidget";
import "./site/site.css";

type View = { name: "home" } | { name: "browse" } | { name: "show"; id: string };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  return (
    <div className="site">
      <header>
        <span className="brand">CrunchyFake</span>
        <nav>
          <a onClick={() => setView({ name: "home" })}>Home</a>
          <a onClick={() => setView({ name: "browse" })}>Browse</a>
        </nav>
      </header>
      <main>
        {view.name === "home" && <Home onOpenShow={(id) => setView({ name: "show", id })} />}
        {view.name === "browse" && <Browse onOpenShow={(id) => setView({ name: "show", id })} />}
        {view.name === "show" && <Show id={view.id} onBack={() => setView({ name: "home" })} />}
      </main>
      <CompanionWidget apiBase={import.meta.env.VITE_API_BASE ?? ""} modelUrl="/models/sample.vrm" />
    </div>
  );
}