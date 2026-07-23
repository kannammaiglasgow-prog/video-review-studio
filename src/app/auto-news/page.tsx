"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type RegionInfo = { name: string; tamilName: string };
type LogEntry = { id: number; region: string | null; step: string; message: string; status: string; created_at: string };

const voiceOptions = [
  { value: "parler-jaya", label: "Jaya (Professional Female)" },
  { value: "parler-rasa", label: "Rasa (Natural Female)" },
  { value: "parler-ganga", label: "Ganga (Calm Female)" },
  { value: "parler-lekha", label: "Lekha (Energetic Female)" },
  { value: "parler-sundar", label: "Sundar (Professional Male)" },
  { value: "parler-karthik", label: "Karthik (Natural Male)" },
  { value: "parler-vasanth", label: "Vasanth (Calm Male)" },
  { value: "parler-arvind", label: "Arvind (Fast Male)" }
];

export default function AutoNewsPage() {
  const [enabled, setEnabled] = useState(false);
  const [shortsEnabled, setShortsEnabled] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("parler-jaya");
  const [ttsMode, setTtsMode] = useState<"free" | "paid">("free");
  const [regions, setRegions] = useState<RegionInfo[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggeringShorts, setTriggeringShorts] = useState(false);
  const [longVideoTimes, setLongVideoTimes] = useState<string[]>([]);
  const [shortsTimes, setShortsTimes] = useState<string[]>([]);
  const [autoRegions, setAutoRegions] = useState<Set<string>>(new Set());
  const [newLongTime, setNewLongTime] = useState("08:00");
  const [newShortsTime, setNewShortsTime] = useState("09:00");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/auto-news");
      const data = await res.json();
      setEnabled(data.enabled);
      setShortsEnabled(data.shortsEnabled);
      setSelectedVoice(data.selectedVoice || "parler-jaya");
      setTtsMode(data.ttsMode === "paid" ? "paid" : "free");
      setRegions(data.regions || []);
      if (data.schedule) {
        setLongVideoTimes(data.schedule.longVideoTimes || []);
        setShortsTimes(data.schedule.shortsTimes || []);
        setAutoRegions(new Set(data.schedule.selectedRegions || []));
      }
    } catch {
      setMessage("❌ Settings fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const changeVoice = async (voice: string) => {
    setSelectedVoice(voice);
    await fetch("/api/auto-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedVoice: voice })
    });
    setMessage(`🗣️ குரல் "${voiceOptions.find(o => o.value === voice)?.label}" ஆக மாற்றப்பட்டது`);
  };

  const changeTtsMode = async (mode: "free" | "paid") => {
    setTtsMode(mode);
    await fetch("/api/auto-news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttsMode: mode })
    });
    setMessage(mode === "free" ? "🆓 TTS — Free (Parler-TTS) ஆக மாற்றப்பட்டது" : "💰 TTS — Paid (Gemini TTS) ஆக மாற்றப்பட்டது");
  };

  const toggleAutoRegion = (name: string) => {
    setAutoRegions(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const addLongTime = () => {
    if (longVideoTimes.includes(newLongTime)) return;
    setLongVideoTimes([...longVideoTimes, newLongTime].sort());
  };
  const removeLongTime = (t: string) => setLongVideoTimes(longVideoTimes.filter(x => x !== t));

  const addShortsTime = () => {
    if (shortsTimes.includes(newShortsTime)) return;
    setShortsTimes([...shortsTimes, newShortsTime].sort());
  };
  const removeShortsTime = (t: string) => setShortsTimes(shortsTimes.filter(x => x !== t));

  const saveSchedule = async () => {
    if (longVideoTimes.length === 0 || shortsTimes.length === 0 || autoRegions.size === 0) {
      setMessage("⚠️ குறைந்தது ஒரு நேரமும் ஒரு நாடும் தேர்ந்தெடுக்கவும்");
      return;
    }
    setSavingSchedule(true);
    try {
      await fetch("/api/auto-news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: { longVideoTimes, shortsTimes, selectedRegions: Array.from(autoRegions) } })
      });
      setMessage("✅ Automation schedule சேமிக்கப்பட்டது");
    } catch {
      setMessage("❌ Schedule save தோல்வி");
    } finally {
      setSavingSchedule(false);
    }
  };

  // Poll logs every 3 seconds (prevent browser caching with timestamp and no-store)
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/auto-news/logs?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        const newLogs: LogEntry[] = data.logs || [];
        setLogs(newLogs);
        // Check if any log is in 'running' state (pipeline active)
        const hasRunning = newLogs.some(l => l.status === "running");
        setIsRunning(hasRunning);
        // Auto-scroll to bottom only if user is already near bottom of log panel
        const container = logContainerRef.current;
        if (container) {
          const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
          if (isAtBottom) {
            logEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }
        } else if (logEndRef.current) {
          logEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      } catch { /* ignore */ }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const toggleEnabled = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    await fetch("/api/auto-news", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: newVal })
    });
    setMessage(newVal ? "✅ நியூஸ் ஆட்டோமேஷன் ON ஆக்கப்பட்டது" : "⏸️ நியூஸ் ஆட்டோமேஷன் OFF ஆக்கப்பட்டது");
  };

  const toggleShortsEnabled = async () => {
    const newVal = !shortsEnabled;
    setShortsEnabled(newVal);
    await fetch("/api/auto-news", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortsEnabled: newVal })
    });
    setMessage(newVal ? "✅ Shorts ஆட்டோமேஷன் ON ஆக்கப்பட்டது" : "⏸️ Shorts ஆட்டோமேஷன் OFF ஆக்கப்பட்டது");
  };

  const toggleRegion = (name: string) => {
    setSelectedRegions(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelectedRegions(new Set(regions.map(r => r.name)));
  const deselectAll = () => setSelectedRegions(new Set());

  const triggerNews = async () => {
    if (selectedRegions.size === 0) { setMessage("⚠️ குறைந்தது ஒரு நாட்டைத் தேர்ந்தெடுக்கவும்"); return; }
    setTriggering(true); setMessage("");
    try {
      const res = await fetch("/api/auto-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions: Array.from(selectedRegions) })
      });
      const data = await res.json();
      if (data.success) setMessage(`🚀 ${data.regions.length} நாடுகளுக்கான வீடியோக்கள் Generate & Upload ஆகின்றன!`);
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ API request failed"); }
    finally { setTriggering(false); }
  };

  const triggerShorts = async () => {
    setTriggeringShorts(true); setMessage("");
    try {
      const res = await fetch("/api/auto-news", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerShorts: true, slot: Math.floor(Math.random() * 10) })
      });
      const data = await res.json();
      if (data.success) setMessage("📱 10 Shorts அப்லோடு க்யூ தொடங்கப்பட்டது! அனைத்து செய்திகளும் ஒவ்வொன்றாக உருவாக்கப்படும்.");
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ API request failed"); }
    finally { setTriggeringShorts(false); }
  };

  if (loading) return <div style={{ padding: 40, color: "#fff", textAlign: "center", background: "#0a0a1a", minHeight: "100vh" }}>Loading...</div>;

  const flagEmoji: Record<string, string> = {
    "Tamil Nadu": "🇮🇳", "Sri Lanka": "🇱🇰", "UK": "🇬🇧", "Germany": "🇩🇪", "France": "🇫🇷"
  };

  const toggleStyle = (on: boolean) => ({
    width: 64, height: 32, borderRadius: 16, border: "none" as const, cursor: "pointer" as const,
    background: on ? "linear-gradient(90deg, #22c55e, #16a34a)" : "#333",
    position: "relative" as const, transition: "background 0.3s", flexShrink: 0
  });

  const knobStyle = (on: boolean) => ({
    width: 26, height: 26, borderRadius: 13, background: "#fff",
    position: "absolute" as const, top: 3, left: on ? 35 : 3, transition: "left 0.3s"
  });

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)", color: "#fff", padding: "30px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 30 }}>
          <Link href="/" style={{ color: "#a78bfa", textDecoration: "none", fontSize: 14 }}>← முகப்பு</Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, background: "linear-gradient(90deg, #a78bfa, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
            📰 தானியங்கி செய்தி வீடியோ
          </h1>
        </div>

        {/* ── SECTION 1: Long-form News Toggle ─────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>📺 நீண்ட வீடியோ ஆட்டோமேஷன் (16:9)</h2>
              <p style={{ fontSize: 13, color: "#a0a0c0", margin: 0 }}>{longVideoTimes.join(", ") || "—"} — {autoRegions.size} நாடுகள் (கீழே Schedule-ல் மாற்றலாம்)</p>
            </div>
            <button onClick={toggleEnabled} style={toggleStyle(enabled)}>
              <div style={knobStyle(enabled)} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: enabled ? "#4ade80" : "#f87171", marginTop: 8, marginBottom: 0, fontWeight: 600 }}>
            {enabled ? "🟢 ON — தினமும் காலை & மாலை தானாக generate ஆகும்" : "🔴 OFF — நாளை ஓடாது"}
          </p>
        </div>

        {/* ── SECTION 2: Shorts Toggle ──────────────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, border: "1px solid rgba(244,114,182,0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>📱 Shorts ஆட்டோமேஷன் (9:16 · 30–60 வினாடி)</h2>
              <p style={{ fontSize: 13, color: "#a0a0c0", margin: 0 }}>தினமும் {shortsTimes.length} Shorts — {shortsTimes.join(", ") || "—"}</p>
            </div>
            <button onClick={toggleShortsEnabled} style={toggleStyle(shortsEnabled)}>
              <div style={knobStyle(shortsEnabled)} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: shortsEnabled ? "#4ade80" : "#f87171", marginTop: 8, marginBottom: 0, fontWeight: 600 }}>
            {shortsEnabled ? "🟢 ON — ஒவ்வொரு மணிக்கும் 1 Short தானாக upload ஆகும்" : "🔴 OFF — Shorts automation நிறுத்தப்பட்டுள்ளது"}
          </p>
        </div>

        {/* ── SECTION 2.2: Automation Schedule (times + regions + count) ─── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 16, border: "1px solid rgba(167,139,250,0.3)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>⏰ Automation Schedule</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginTop: 0, marginBottom: 16 }}>எத்தனை மணிக்கு, எத்தனை videos/shorts, எந்த நாடுகள் — இங்கே தேர்ந்தெடுக்கவும்</p>

          <label style={{ display: "block", marginBottom: 6, color: "#a0a0c0", fontSize: 14 }}>📺 நீண்ட வீடியோ நேரங்கள் ({longVideoTimes.length})</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {longVideoTimes.map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", fontSize: 13 }}>
                {t}
                <button onClick={() => removeLongTime(t)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input type="time" value={newLongTime} onChange={e => setNewLongTime(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#1a0a2e", color: "#fff", fontSize: 13 }} />
            <button onClick={addLongTime} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #a78bfa", background: "transparent", color: "#a78bfa", cursor: "pointer" }}>+ நேரம் சேர்</button>
          </div>

          <label style={{ display: "block", marginBottom: 6, color: "#a0a0c0", fontSize: 14 }}>📱 Shorts நேரங்கள் ({shortsTimes.length})</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {shortsTimes.map(t => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "rgba(244,114,182,0.15)", border: "1px solid rgba(244,114,182,0.3)", fontSize: 13 }}>
                {t}
                <button onClick={() => removeShortsTime(t)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input type="time" value={newShortsTime} onChange={e => setNewShortsTime(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "#1a0a2e", color: "#fff", fontSize: 13 }} />
            <button onClick={addShortsTime} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #f472b6", background: "transparent", color: "#f472b6", cursor: "pointer" }}>+ நேரம் சேர்</button>
          </div>

          <label style={{ display: "block", marginBottom: 6, color: "#a0a0c0", fontSize: 14 }}>🌍 Automation இயங்கும் நாடுகள் ({autoRegions.size})</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
            {regions.map(r => (
              <label key={r.name} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                background: autoRegions.has(r.name) ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.03)",
                border: autoRegions.has(r.name) ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.08)"
              }}>
                <input type="checkbox" checked={autoRegions.has(r.name)} onChange={() => toggleAutoRegion(r.name)} style={{ accentColor: "#a78bfa" }} />
                <span style={{ fontSize: 13 }}>{r.tamilName}</span>
              </label>
            ))}
          </div>

          <button onClick={saveSchedule} disabled={savingSchedule} style={{
            width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: savingSchedule ? "wait" : "pointer",
            background: "linear-gradient(90deg, #a78bfa, #f472b6)", color: "#fff", fontSize: 14, fontWeight: 700, opacity: savingSchedule ? 0.7 : 1
          }}>
            {savingSchedule ? "சேமிக்கிறது..." : "💾 Schedule சேமி"}
          </button>
        </div>

        {/* ── SECTION 2.4: TTS Free/Paid Toggle ─────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 16, border: "1px solid rgba(251,191,36,0.2)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>💸 குரல் தயாரிப்பு (TTS) — Free அல்லது Paid</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 16 }}>தானியங்கி மற்றும் உடனடி செய்தி/Shorts வீடியோக்கள் அனைத்திற்கும் பொருந்தும்</p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => changeTtsMode("free")} style={{
              flex: 1, padding: "12px 0", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700,
              border: ttsMode === "free" ? "1px solid #22c55e" : "1px solid rgba(255,255,255,0.15)",
              background: ttsMode === "free" ? "rgba(34,197,94,0.15)" : "transparent",
              color: ttsMode === "free" ? "#4ade80" : "#a0a0c0"
            }}>🆓 Free<br /><span style={{ fontSize: 11, fontWeight: 400 }}>Parler-TTS (குரல் தேர்வு கீழே)</span></button>
            <button onClick={() => changeTtsMode("paid")} style={{
              flex: 1, padding: "12px 0", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700,
              border: ttsMode === "paid" ? "1px solid #fbbf24" : "1px solid rgba(255,255,255,0.15)",
              background: ttsMode === "paid" ? "rgba(251,191,36,0.15)" : "transparent",
              color: ttsMode === "paid" ? "#fbbf24" : "#a0a0c0"
            }}>💰 Paid<br /><span style={{ fontSize: 11, fontWeight: 400 }}>Gemini TTS (API cost ஆகும்)</span></button>
          </div>
        </div>

        {/* ── SECTION 2.5: Voice Selector ────────────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, border: "1px solid rgba(251,191,36,0.2)", opacity: ttsMode === "paid" ? 0.5 : 1 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>🗣️ தமிழ் குரல் தேர்வு (Parler-TTS Voice)</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 16 }}>
            {ttsMode === "paid" ? "Paid TTS தேர்ந்தெடுக்கப்பட்டுள்ளதால் இந்தக் குரல் தேர்வு பயன்படுத்தப்படாது (Gemini தானாக ஒரு குரலைப் பயன்படுத்தும்)" : "தானியங்கி மற்றும் உடனடி செய்திகளுக்குப் பயன்படுத்தப்பட வேண்டிய குரல்"}
          </p>
          <select
            value={selectedVoice}
            onChange={(e) => changeVoice(e.target.value)}
            disabled={ttsMode === "paid"}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
              background: "#1a0a2e", color: "#fff", fontSize: 14, fontWeight: 500, outline: "none",
              cursor: ttsMode === "paid" ? "not-allowed" : "pointer"
            }}
          >
            {voiceOptions.map(o => (
              <option key={o.value} value={o.value} style={{ background: "#0a0a1a" }}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* ── SECTION 3: Manual News Trigger ───────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 16, border: "1px solid rgba(167,139,250,0.3)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>🚀 உடனடி நீண்ட வீடியோ Generate & Upload</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginTop: 0, marginBottom: 16 }}>நாட்டைத் தேர்ந்தெடுத்து இப்போதே YouTube-ல் upload செய்யவும்</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={selectAll} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid #a78bfa", background: "transparent", color: "#a78bfa", cursor: "pointer" }}>அனைத்தும் தேர்வு</button>
            <button onClick={deselectAll} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid #666", background: "transparent", color: "#999", cursor: "pointer" }}>நீக்கு</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {regions.map(r => (
              <label key={r.name} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                background: selectedRegions.has(r.name) ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.03)",
                border: selectedRegions.has(r.name) ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.08)"
              }}>
                <input type="checkbox" checked={selectedRegions.has(r.name)} onChange={() => toggleRegion(r.name)} style={{ accentColor: "#a78bfa", width: 18, height: 18 }} />
                <span style={{ fontSize: 22 }}>{flagEmoji[r.name] || "🌍"}</span>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{r.tamilName}</span>
              </label>
            ))}
          </div>

          <button onClick={triggerNews} disabled={triggering || selectedRegions.size === 0} style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            cursor: triggering || selectedRegions.size === 0 ? "not-allowed" : "pointer",
            background: selectedRegions.size === 0 ? "#333" : "linear-gradient(90deg, #a78bfa, #f472b6)",
            color: "#fff", fontSize: 15, fontWeight: 700, opacity: triggering ? 0.7 : 1, transition: "all 0.3s"
          }}>
            {triggering ? "⏳ Processing..." : `🎬 ${selectedRegions.size} நாடு — உடனே Generate & Upload →`}
          </button>
        </div>

        {/* ── SECTION 4: Manual Shorts Trigger ─────────────────────────── */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, border: "1px solid rgba(244,114,182,0.3)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>📱 உடனடி Shorts Generate & Upload</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginTop: 0, marginBottom: 16 }}>
            அனைத்து நாடுகளின் டாப் 10 செய்திகளை சேகரித்து — 10 Shorts வீடியோக்களையும் வரிசையாக Generate & Upload செய்யும்
          </p>
          <button onClick={triggerShorts} disabled={triggeringShorts} style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            cursor: triggeringShorts ? "wait" : "pointer",
            background: "linear-gradient(90deg, #f472b6, #fb923c)",
            color: "#fff", fontSize: 15, fontWeight: 700, opacity: triggeringShorts ? 0.7 : 1, transition: "all 0.3s"
          }}>
            {triggeringShorts ? "⏳ Generating 10 Shorts..." : "📱 10 Shorts Queue — உடனே Generate & Upload →"}
          </button>
        </div>

        {/* Status Message */}
        {message && (
          <div style={{
            background: message.includes("❌") || message.includes("⚠️") ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            border: `1px solid ${message.includes("❌") || message.includes("⚠️") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            borderRadius: 12, padding: "12px 16px", fontSize: 14, textAlign: "center", marginBottom: 16
          }}>{message}</div>
        )}

        {/* Info */}
        <div style={{ padding: "16px 20px", background: "rgba(255,255,255,0.03)", borderRadius: 12, fontSize: 12, color: "#555" }}>
          <p style={{ margin: "2px 0" }}>📌 நீண்ட வீடியோ: 16:9 | Shorts: 9:16 (30–60 sec) | மொழி: தமிழ்</p>
          <p style={{ margin: "2px 0" }}>📌 நேரங்கள்/நாடுகள் மேலே "⏰ Automation Schedule" section-ல் மாற்றலாம்</p>
          <p style={{ margin: "2px 0" }}>📌 செய்தி மூலம்: Google News RSS</p>
        </div>

        {/* ── LIVE STATUS PANEL ─────────────────────────────────────── */}
        <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 16, border: `1px solid ${isRunning ? "rgba(167,139,250,0.5)" : "rgba(255,255,255,0.08)"}`, marginBottom: 24, overflow: "hidden", transition: "border-color 0.3s" }}>
          <div style={{ padding: "14px 20px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: isRunning ? "#22c55e" : "#555", boxShadow: isRunning ? "0 0 8px #22c55e" : "none", animation: isRunning ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: isRunning ? "#a78bfa" : "#666" }}>
              {isRunning ? "🔴 Live — Pipeline ஓடுகிறது..." : "⚪ Live Status Panel"}
            </span>
            <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>ஒவ்வொரு 3 வினாடிக்கும் refresh</span>
          </div>

          <div ref={logContainerRef} style={{ maxHeight: 320, overflowY: "auto", padding: "12px 0" }}>
            {logs.length === 0 ? (
              <p style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
                Generate பட்டனை கிளிக் செய்தால் இங்கே live status காட்டும்...
              </p>
            ) : (
              logs.map((log) => {
                const colors: Record<string, { bg: string; border: string; dot: string }> = {
                  running: { bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)", dot: "#a78bfa" },
                  done:    { bg: "rgba(34,197,94,0.06)",   border: "rgba(34,197,94,0.15)",  dot: "#22c55e" },
                  error:   { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   dot: "#ef4444" },
                  info:    { bg: "rgba(251,191,36,0.06)",  border: "rgba(251,191,36,0.15)", dot: "#fbbf24" },
                };
                const c = colors[log.status] || colors.info;
                const time = new Date(log.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 20px", background: c.bg, borderLeft: `3px solid ${c.dot}`, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, marginTop: 5, flexShrink: 0, boxShadow: log.status === "running" ? `0 0 6px ${c.dot}` : "none" }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: "#ddd", lineHeight: 1.4 }}>{log.message}</span>
                      {log.region && <span style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>— {log.region}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: "#444", flexShrink: 0 }}>{time}</span>
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      </div>
    </div>
  );
}
