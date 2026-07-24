"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type HistoryItem = { id: number; title: string; status: string; createdAt: string; youtubeUrl: string | null; language: string };
type ChannelDetail = {
  key: string;
  label: string;
  connected: boolean;
  channelInfo: { id: string; title: string } | null;
  inProgress: HistoryItem[];
  history: HistoryItem[];
  todayCount: number;
};

const statusLabels: Record<string, string> = {
  generating: "📝 Script எழுதப்படுகிறது...",
  writing_scenes: "🎬 Scenes உருவாக்கப்படுகிறது...",
  generating_audio: "🎙️ Audio உருவாக்கப்படுகிறது...",
  fetching_media: "🎬 Stock media தேடுகிறது...",
  script_ready: "✅ Render ஆக காத்திருக்கிறது",
  rendering: "🎞️ Video render ஆகிறது...",
  rendered: "✅ Video ரெடி!",
  uploaded: "🚀 YouTube-க்கு upload ஆயிற்று!",
  failed: "❌ தோல்வி",
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "இப்போதுதான்";
  if (mins < 60) return `${mins} நிமிடத்திற்கு முன்`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} மணி நேரத்திற்கு முன்`;
  const days = Math.floor(hours / 24);
  return `${days} நாட்களுக்கு முன்`;
}

const box: React.CSSProperties = { background: "#1a1a2e", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #2d2d44" };

const storyVoiceOptions = [
  { value: "Female — Warm", label: "பெண் — Warm" },
  { value: "Male — Warm", label: "ஆண் — Warm" },
  { value: "Female — Energetic", label: "பெண் — Energetic" },
  { value: "Male — Energetic", label: "ஆண் — Energetic" },
  { value: "Male — Heroic/Firm", label: "ஆண் — Heroic/Firm" },
  { value: "Female — Bright", label: "பெண் — Bright" },
  { value: "Dramatic", label: "Dramatic" },
];

function TimesEditor({
  label, times, setTimes, accentColor, newTime, setNewTime,
}: {
  label: string; times: string[]; setTimes: (t: string[]) => void; accentColor: string; newTime: string; setNewTime: (t: string) => void;
}) {
  const addTime = () => {
    if (times.includes(newTime)) return;
    setTimes([...times, newTime].sort());
  };
  const removeTime = (t: string) => setTimes(times.filter((x) => x !== t));

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", marginBottom: 6, color: "#a0a0c0", fontSize: 13 }}>{label} ({times.length}/day)</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {times.map((t) => (
          <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: `${accentColor}26`, border: `1px solid ${accentColor}4d`, fontSize: 13 }}>
            {t}
            <button onClick={() => removeTime(t)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#0f0f1e", color: "#fff", fontSize: 13 }} />
        <button onClick={addTime} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: `1px solid ${accentColor}`, background: "transparent", color: accentColor, cursor: "pointer" }}>+ நேரம் சேர்</button>
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", position: "relative",
        background: on ? "linear-gradient(90deg, #22c55e, #16a34a)" : "#333", transition: "background 0.3s", flexShrink: 0,
      }}
    >
      <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 3, left: on ? 27 : 3, transition: "left 0.3s" }} />
    </button>
  );
}

function IdeaEngineAutomation({ channel }: { channel: "story" | "english" | "devotional" }) {
  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("11:00");
  const [shortsEnabled, setShortsEnabled] = useState(false);
  const [shortsTimes, setShortsTimes] = useState<string[]>([]);
  const [newShortsTime, setNewShortsTime] = useState("09:00");
  const [voice, setVoice] = useState("Female — Warm");
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggeringShorts, setTriggeringShorts] = useState(false);
  const [message, setMessage] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/auto-story/${channel}?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setEnabled(Boolean(data.enabled));
      setTimes(data.times || []);
      setShortsEnabled(Boolean(data.shortsEnabled));
      setShortsTimes(data.shortsTimes || []);
      setVoice(data.voice || "Female — Warm");
    } catch { /* ignore */ }
  }, [channel]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await fetch(`/api/auto-story/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
    setMessage(next ? "🟢 நீண்ட வீடியோ Idea Engine ON ஆக்கப்பட்டது" : "🔴 நீண்ட வீடியோ Idea Engine OFF ஆக்கப்பட்டது");
  };

  const toggleShortsEnabled = async () => {
    const next = !shortsEnabled;
    setShortsEnabled(next);
    await fetch(`/api/auto-story/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shortsEnabled: next }) });
    setMessage(next ? "🟢 Shorts Idea Engine ON ஆக்கப்பட்டது" : "🔴 Shorts Idea Engine OFF ஆக்கப்பட்டது");
  };

  const changeVoice = async (next: string) => {
    setVoice(next);
    await fetch(`/api/auto-story/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voice: next }) });
    setMessage(`🗣️ குரல் "${storyVoiceOptions.find((o) => o.value === next)?.label}" ஆக மாற்றப்பட்டது`);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await fetch(`/api/auto-story/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ times, shortsTimes }) });
      setMessage("✅ நேரங்கள் சேமிக்கப்பட்டது");
    } finally { setSaving(false); }
  };

  const triggerNow = async (format: "long" | "short") => {
    setTriggering(true);
    setMessage("");
    try {
      const res = await fetch(`/api/auto-story/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trigger: true, format }) });
      const data = await res.json();
      setMessage(data.success ? "🚀 Idea Engine தொடங்கியது — கீழே 'இப்போது நடக்கிறது'-ல் சில நிமிடங்களில் தெரியும்" : `❌ ${data.error}`);
    } catch {
      setMessage("❌ Trigger தோல்வி");
    } finally {
      setTriggering(false);
    }
  };

  // "Short" button queues a full batch (default 10, or however many times are
  // configured below) — each draws its own fresh idea, so all are different themes.
  const triggerShortsBatch = async () => {
    setTriggeringShorts(true);
    setMessage("");
    try {
      const count = shortsTimes.length || 10;
      const res = await fetch(`/api/auto-story/${channel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ triggerBatch: true, format: "short", count }) });
      const data = await res.json();
      setMessage(data.success ? `🚀 ${data.message}` : `❌ ${data.error}`);
    } catch {
      setMessage("❌ Trigger தோல்வி");
    } finally {
      setTriggeringShorts(false);
    }
  };

  return (
    <div style={{ ...box, border: "1px solid rgba(34,197,94,0.3)" }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px 0" }}>🤖 Idea Engine Automation</h2>
      <p style={{ fontSize: 12, color: "#a0a0c0", marginTop: 0, marginBottom: 16 }}>
Gemini-யே ஒரு idea (situation) invent பண்ணி, அதிலிருந்து முற்றிலும் புதிய கதை எழுதி, render பண்ணி — Private-ஆ review-க்கு தயார் ஆகும் (upload தானாக ஆகாது). வெளியில் இருந்து எதுவும் scrape செய்யப்படாது.
      </p>

      {/* Long-form */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>📺 நீண்ட வீடியோ (16:9)</span>
        <ToggleSwitch on={enabled} onClick={toggleEnabled} />
      </div>
      <TimesEditor label="நேரங்கள்" times={times} setTimes={setTimes} accentColor="#22c55e" newTime={newTime} setNewTime={setNewTime} />

      {/* Shorts */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>📱 Shorts (9:16)</span>
        <ToggleSwitch on={shortsEnabled} onClick={toggleShortsEnabled} />
      </div>
      <TimesEditor label="நேரங்கள்" times={shortsTimes} setTimes={setShortsTimes} accentColor="#f472b6" newTime={newShortsTime} setNewTime={setNewShortsTime} />

      <button onClick={saveAll} disabled={saving} style={{ width: "100%", fontSize: 12, padding: "8px 14px", borderRadius: 8, border: "none", background: "#22c55e", color: "#0a0a1a", fontWeight: 700, cursor: saving ? "wait" : "pointer", marginBottom: 14 }}>
        {saving ? "..." : "💾 நேரங்கள் சேமி"}
      </button>

      <label style={{ display: "block", marginBottom: 6, color: "#a0a0c0", fontSize: 13 }}>குரல் (Voice — இரண்டு formats-க்கும்)</label>
      <select
        value={voice}
        onChange={(e) => changeVoice(e.target.value)}
        style={{
          width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
          background: "#0f0f1e", color: "#fff", fontSize: 13, marginBottom: 14,
        }}
      >
        {storyVoiceOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => triggerNow("long")}
          disabled={triggering}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 10, border: "none", cursor: triggering ? "wait" : "pointer",
            background: "linear-gradient(90deg, #a78bfa, #f472b6)", color: "#fff", fontSize: 13, fontWeight: 700, opacity: triggering ? 0.7 : 1,
          }}
        >
          {triggering ? "⏳..." : "🚀 இப்போதே Long Video"}
        </button>
        <button
          onClick={triggerShortsBatch}
          disabled={triggeringShorts}
          style={{
            flex: 1, padding: "12px 0", borderRadius: 10, border: "none", cursor: triggeringShorts ? "wait" : "pointer",
            background: "linear-gradient(90deg, #f472b6, #fb923c)", color: "#fff", fontSize: 13, fontWeight: 700, opacity: triggeringShorts ? 0.7 : 1,
          }}
        >
          {triggeringShorts ? "⏳..." : `📱 இப்போதே ${shortsTimes.length || 10} Shorts`}
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#707090", marginTop: 8, marginBottom: 0 }}>
        📱 Shorts button-ல் {shortsTimes.length || 10} shorts வரிசையாக (ஒவ்வொன்றும் வேற theme-ல்) generate ஆகும் — ஒரே நேரத்தில் ஒன்று மட்டும், render முடிந்ததும் அடுத்தது தொடங்கும்.
      </p>

      {message && <p style={{ fontSize: 12, color: message.includes("❌") ? "#f87171" : "#4ade80", marginTop: 10, marginBottom: 0 }}>{message}</p>}
    </div>
  );
}

export default function ChannelDetailPage() {
  const params = useParams();
  const channel = params.channel as string;
  const [data, setData] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/channels/${channel}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [channel]);

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, 5000);
    return () => clearInterval(interval);
  }, [fetchDetail]);

  if (loading) return <div style={{ minHeight: "100vh", background: "#0a0a1a", color: "#fff", padding: 40, textAlign: "center" }}>Loading...</div>;
  if (!data) return <div style={{ minHeight: "100vh", background: "#0a0a1a", color: "#fff", padding: 40, textAlign: "center" }}>Channel கிடைக்கவில்லை</div>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)", color: "#fff", padding: "30px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Link href="/dashboard" style={{ color: "#a78bfa", textDecoration: "none", fontSize: 14 }}>← Dashboard</Link>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{data.label}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          {data.connected ? (
            <span style={{ fontSize: 13, color: "#4ade80" }}>🔗 இணைக்கப்பட்டுள்ளது{data.channelInfo ? ` — ${data.channelInfo.title}` : ""}</span>
          ) : (
            <span style={{ fontSize: 13, color: "#fbbf24" }}>⬜ YouTube இணைக்கப்படவில்லை</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <Link
            href={`/sivan-arul/story-to-video?channel=${channel}`}
            style={{
              display: "inline-block", padding: "10px 20px", borderRadius: 10,
              background: "linear-gradient(90deg, #a78bfa, #f472b6)", color: "#fff", fontSize: 14, fontWeight: 700, textDecoration: "none",
            }}
          >
            + இந்த channel-க்கு புதிய video தொடங்கு
          </Link>

          {channel === "news" && (
            <Link
              href="/auto-news"
              style={{
                display: "inline-block", padding: "10px 20px", borderRadius: 10,
                background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80", fontSize: 14, fontWeight: 700, textDecoration: "none",
              }}
            >
              🤖 Automation
            </Link>
          )}
          {channel !== "news" && channel !== "story" && channel !== "english" && channel !== "devotional" && (
            <span
              title="இந்த channel-க்கு automation இன்னும் கட்டப்படவில்லை"
              style={{
                display: "inline-block", padding: "10px 20px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", color: "#707090", fontSize: 14, fontWeight: 700,
              }}
            >
              🤖 Automation (விரைவில்)
            </span>
          )}
        </div>

        {(channel === "story" || channel === "english" || channel === "devotional") && <IdeaEngineAutomation channel={channel} />}

        {/* Currently in progress */}
        <div style={box}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>⚙️ இப்போது நடக்கிறது ({data.inProgress.length})</h2>
          {data.inProgress.length === 0 ? (
            <p style={{ fontSize: 13, color: "#707090", margin: 0 }}>இப்போது எதுவும் process ஆகவில்லை</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.inProgress.map((p) => (
                <Link key={p.id} href={`/sivan-arul/story-to-video?project=${p.id}`} style={{ textDecoration: "none", color: "#fff" }}>
                  <div style={{ padding: "10px 12px", background: "rgba(167,139,250,0.08)", borderRadius: 8, border: "1px solid rgba(167,139,250,0.2)" }}>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: "#a78bfa" }}>{statusLabels[p.status] || p.status}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        <div style={box}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>📋 Video History ({data.history.length})</h2>
          {data.history.length === 0 ? (
            <p style={{ fontSize: 13, color: "#707090", margin: 0 }}>இதுவரை இந்த channel-க்கு video இல்லை</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 500, overflowY: "auto" }}>
              {data.history.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link href={`/sivan-arul/story-to-video?project=${p.id}`} style={{ color: "#fff", textDecoration: "none", fontSize: 13 }}>
                      #{p.id} · {p.title}
                    </Link>
                    <div style={{ fontSize: 11, color: "#707090", marginTop: 2 }}>
                      {statusLabels[p.status] || p.status} · {relativeTime(p.createdAt)}
                    </div>
                  </div>
                  {p.youtubeUrl && (
                    <a href={p.youtubeUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#a78bfa", marginLeft: 12, flexShrink: 0 }}>▶ காண்க</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
