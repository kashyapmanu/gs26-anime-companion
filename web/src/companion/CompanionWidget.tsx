import { useEffect, useRef, useState } from "react";
import { ConversationClient } from "./ConversationClient";
import { VRMStage, type VRMStageHandle } from "./VRMStage";
import { VoiceController } from "./VoiceController";
import "./companion.css";

interface Line { who: "me" | "kira"; text: string }

export function CompanionWidget({ apiBase, modelUrl }: { apiBase: string; modelUrl: string }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [typed, setTyped] = useState("");
  const [listening, setListening] = useState(false);
  const clientRef = useRef<ConversationClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stageRef = useRef<VRMStageHandle | null>(null);
  const voiceRef = useRef<VoiceController>(new VoiceController());
  const sendHandleRef = useRef<{ abort: () => void } | null>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const sttSupported = VoiceController.isSTTSupported();

  useEffect(() => { clientRef.current = new ConversationClient({ base: apiBase }); }, [apiBase]);

  useEffect(() => {
    const el = linesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  async function handleOpen() {
    setOpen(true);
    if (!clientRef.current) return;
    try {
      const { sessionId, greeting } = await clientRef.current.openSession();
      sessionIdRef.current = sessionId;
      setLines((l) => [...l, { who: "kira", text: greeting.text }]);
      if (greeting.audioBase64) {
        stageRef.current?.speak(greeting.audioBase64, greeting.mime).catch(() => {});
      }
    } catch {
      setLines((l) => [...l, { who: "kira", text: "(couldn't reach the companion service)" }]);
    }
  }

  function sendText(text: string) {
    const c = clientRef.current, sid = sessionIdRef.current;
    if (!c || !sid || !text.trim()) return;
    setLines((l) => [...l, { who: "me", text }, { who: "kira", text: "…" }]);
    sendHandleRef.current = c.send(sid, text, {
      onSentence: (t) => setLines((l) => {
        const cp = [...l];
        const last = cp[cp.length - 1];
        if (last && last.who === "kira") {
          const base = last.text === "…" ? "" : last.text;
          cp[cp.length - 1] = { who: "kira", text: base ? `${base} ${t}` : t };
        } else {
          cp.push({ who: "kira", text: t });
        }
        return cp;
      }),
      onAudio: (a) => stageRef.current?.speak(a.audioBase64, a.mime).catch(() => {}),
      onDone: () => { sendHandleRef.current = null; },
      onError: (m) => setLines((l) => {
        const cp = [...l];
        const last = cp[cp.length - 1];
        if (last && last.who === "kira" && last.text === "…") {
          cp[cp.length - 1] = { who: "kira", text: `(glitch: ${m})` };
        } else {
          cp.push({ who: "kira", text: `(glitch: ${m})` });
        }
        return cp;
      }),
    });
  }

  function handleMic() {
    if (!sttSupported) return;
    setListening(true);
    voiceRef.current.startListening(
      (t) => { setListening(false); sendText(t); },
      () => setListening(false),
    );
  }

  return open ? (
    <div className="cstage">
      <div className="cstage-left">
        <div className="topbar left-topbar">
          <span className="system-indicator">
            <span className="pulse-dot"></span> KIRA-AI v2.6 // ONLINE
          </span>
        </div>
        <div className="avatar">
          <VRMStage modelUrl={modelUrl} ref={stageRef as any} />
        </div>
      </div>
      <div className="cstage-right">
        <div className="topbar right-topbar">
          <strong className="widget-title">COMMUNICATIONS MODULE</strong>
          <button aria-label="close" className="close-btn" onClick={() => { sendHandleRef.current?.abort(); stageRef.current?.stopSpeaking(); voiceRef.current.stop(); setOpen(false); }}>×</button>
        </div>
        <div className="panel">
          <div className="lines" ref={linesRef}>
            {lines.map((l, i) => (
              <div className={`line-wrapper ${l.who === "me" ? "me" : "kira"}`} key={i}>
                <div className="line-sender">{l.who === "me" ? "USER" : "KIRA"}</div>
                <div className="line-bubble">{l.text}</div>
              </div>
            ))}
          </div>
          
          <div className="quick-replies">
            <button className="chip" onClick={() => { sendText("What anime do you recommend?"); }}>Recommend Anime</button>
            <button className="chip" onClick={() => { sendText("Tell me a fun fact about Japan!"); }}>Japan Trivia</button>
            <button className="chip" onClick={() => { sendText("Explain how your 3D avatar works."); }}>How you work</button>
          </div>

          <div className="controls">
            {sttSupported ? (
              <button className="mic-btn" onClick={handleMic}>{listening ? "Listening…" : "Speak"}</button>
            ) : null}
            <input className="chat-input" placeholder="Transmit message..." value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { sendText(typed); setTyped(""); } }} />
            <button className="send-btn" onClick={() => { sendText(typed); setTyped(""); }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <button className="cfab" aria-label="open companion" onClick={handleOpen}>
      <span className="cfab-icon">💬</span>
      <span className="cfab-pulse"></span>
    </button>
  );
}
