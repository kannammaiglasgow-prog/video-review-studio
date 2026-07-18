"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type DeityInfo = { name: string; tamilName: string; day: number };
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

const weekdayNames = [
  "ஞாயிறு (Sunday)", "திங்கள் (Monday)", "செவ்வாய் (Tuesday)", "புதன் (Wednesday)",
  "வியாழன் (Thursday)", "வெள்ளி (Friday)", "சனி (Saturday)"
];

const deityEmojis: Record<string, string> = {
  "Surya_Kula": "☀️🔱", "Shiva": "🕉️🔱", "Murugan_Amman": "🦚🌺", "Vishnu": "🪷🐚",
  "Guru_Sai": "🧘✨", "Laxmi_Durga": "🪷💰", "Hanuman_Sani": "🐒🔥"
};

export default function SivanArulPage() {
  const [enabled, setEnabled] = useState(false);
  const [shortsEnabled, setShortsEnabled] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("parler-jaya");
  const [deities, setDeities] = useState<DeityInfo[]>([]);
  const [todayDay, setTodayDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [ytStatus, setYtStatus] = useState<{ configured: boolean; connected: boolean; channel?: { id: string; title: string; thumbnail?: string; customUrl?: string } } | null>(null);
  const [legendTemple, setLegendTemple] = useState("");
  const [legendStory, setLegendStory] = useState("");
  const [legendPrivacy, setLegendPrivacy] = useState("private");
  const [legendSubmitting, setLegendSubmitting] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchYtStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/sivan-arul/youtube/status");
      const data = await res.json();
      setYtStatus(data);
    } catch {
      setYtStatus(null);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/sivan-arul");
      const data = await res.json();
      setEnabled(data.enabled);
      setShortsEnabled(data.shortsEnabled);
      setSelectedVoice(data.selectedVoice || "parler-jaya");
      setDeities(data.deities || []);
      
      // Compute current day of week in Indian Standard Time (IST)
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      setTodayDay(ist.getDay());
      
      await fetchYtStatus();
    } catch {
      setMessage("❌ Settings fetch failed");
    } finally {
      setLoading(false);
    }
  }, [fetchYtStatus]);

  useEffect(() => {
    fetchSettings();
    
    // Check URL params for oauth results
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("yt");
    if (oauthResult) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setMessage(oauthResult === "connected" ? "யூடியூப் பக்தி சேனல் வெற்றிகரமாக இணைக்கப்பட்டது ✅" : "யூடியூப் இணைப்பு தோல்வியடைந்தது — மீண்டும் முயற்சிக்கவும்.");
    }
  }, [fetchSettings]);

  const disconnectYt = async () => {
    try {
      await fetch("/api/sivan-arul/youtube/status", { method: "DELETE" });
      setMessage("❌ பக்தி யூடியூப் சேனல் துண்டிக்கப்பட்டது");
      fetchYtStatus();
    } catch {
      setMessage("❌ சேனலைத் துண்டிக்க முடியவில்லை");
    }
  };

  const changeVoice = async (voice: string) => {
    setSelectedVoice(voice);
    await fetch("/api/sivan-arul", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedVoice: voice })
    });
    setMessage(`🗣️ பக்தி குரல் "${voiceOptions.find(o => o.value === voice)?.label}" ஆக மாற்றப்பட்டது`);
  };

  // Poll logs every 3 seconds
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/sivan-arul/logs?t=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        const newLogs: LogEntry[] = data.logs || [];
        setLogs(newLogs);
        
        const hasRunning = newLogs.some(l => l.status === "running");
        setIsRunning(hasRunning);
        
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
    await fetch("/api/sivan-arul", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: newVal })
    });
    setMessage(newVal ? "✅ பக்தி வீடியோக்கள் ஆட்டோமேஷன் ON ஆக்கப்பட்டது" : "⏸️ பக்தி வீடியோக்கள் ஆட்டோமேஷன் OFF ஆக்கப்பட்டது");
  };

  const toggleShortsEnabled = async () => {
    const newVal = !shortsEnabled;
    setShortsEnabled(newVal);
    await fetch("/api/sivan-arul", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortsEnabled: newVal })
    });
    setMessage(newVal ? "✅ பக்தி Shorts ஆட்டோமேஷன் ON ஆக்கப்பட்டது" : "⏸️ பக்தி Shorts ஆட்டோமேஷன் OFF ஆக்கப்பட்டது");
  };

  const submitLegendShorts = async () => {
    if (legendTemple.trim().length < 3) { setMessage("❌ கோவில்/தெய்வம் பெயரைக் குறிப்பிடவும்"); return; }
    if (legendStory.trim().length < 20) { setMessage("❌ குறைந்தது 20 எழுத்துகள் கொண்ட புராணக் கதை விவரத்தை எழுதவும்"); return; }
    setLegendSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/sivan-arul/legend-shorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templeName: legendTemple.trim(), storyDetails: legendStory.trim(), privacyStatus: legendPrivacy })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`🚀 "${legendTemple.trim()}" புராணக் கதை Shorts தயாரிப்பு தொடங்கியது! (Project #${data.projectId})`);
        setLegendTemple("");
        setLegendStory("");
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ API request failed");
    } finally {
      setLegendSubmitting(false);
    }
  };

  const triggerDeityVideo = async (deityName: string, isShorts: boolean) => {
    const triggerKey = `${deityName}-${isShorts ? 'short' : 'long'}`;
    setTriggering(prev => ({ ...prev, [triggerKey]: true }));
    setMessage("");
    
    try {
      const res = await fetch("/api/sivan-arul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deityName, isShorts })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`🚀 ${data.deity} (${isShorts ? 'Shorts' : 'நீண்ட வீடியோ'}) தயாரிப்பு வெற்றிகரமாகத் தொடங்கியது!`);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ API request failed");
    } finally {
      setTriggering(prev => ({ ...prev, [triggerKey]: false }));
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, color: "#fff", textAlign: "center", background: "#09050d", minHeight: "100vh" }}>
        Loading...
      </div>
    );
  }

  const toggleStyle = (on: boolean) => ({
    width: 64,
    height: 32,
    borderRadius: 16,
    border: "none",
    cursor: "pointer",
    background: on ? "linear-gradient(90deg, #ea580c, #ca8a04)" : "#333",
    position: "relative" as const,
    transition: "background 0.3s",
    flexShrink: 0
  });

  const knobStyle = (on: boolean) => ({
    width: 26,
    height: 26,
    borderRadius: 13,
    background: "#fff",
    position: "absolute" as const,
    top: 3,
    left: on ? 35 : 3,
    transition: "left 0.3s"
  });

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #09050d 0%, #1e0b02 50%, #0d0612 100%)", color: "#fff", padding: "30px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 30 }}>
          <Link href="/" style={{ color: "#fb923c", textDecoration: "none", fontSize: 14 }}>← முகப்பு</Link>
          <h1 style={{ fontSize: 24, fontWeight: 700, background: "linear-gradient(90deg, #fb923c, #facc15)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
            🕉️ சிவன் அருள் — பக்தி சேனல் தானியங்கி
          </h1>
        </div>

        {/* Top Info Alert */}
        <div style={{ background: "rgba(234, 88, 12, 0.1)", border: "1px solid rgba(234, 88, 12, 0.3)", borderRadius: 16, padding: "16px 20px", marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#ffedd5", lineHeight: 1.5 }}>
            <strong>தினசரி தெய்வ அட்டவணை முறை:</strong> இந்தத் திட்டம் இந்திய நேரப்படி (IST) தற்போதைய நாளைக் கண்டறிந்து, அதற்கேற்ப சிவன், முருகன், விஷ்ணு, லட்சுமி போன்ற தெய்வங்களின் வீடியோக்களையும், மென்மையான பக்தி பின்னணி இசையையும் இணைத்துத் தயாரிக்கும்.
          </p>
        </div>

        {/* Devotional Automation Controls */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          {/* Long form automation */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 20, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>📺 நீண்ட வீடியோ (16:9)</h2>
                <p style={{ fontSize: 12, color: "#a0a0c0", margin: "4px 0 0 0" }}>தினசரி பக்தி கதைகள், ஸ்தல வரலாறு</p>
              </div>
              <button onClick={toggleEnabled} style={toggleStyle(enabled)}>
                <div style={knobStyle(enabled)} />
              </button>
            </div>
            <span style={{ fontSize: 12, color: enabled ? "#4ade80" : "#f87171", fontWeight: 600 }}>
              {enabled ? "🟢 ON — தானாகப் பதிவேற்றப்படும்" : "🔴 OFF — நிறுத்தி வைக்கப்பட்டுள்ளது"}
            </span>
          </div>

          {/* Shorts automation */}
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 20, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>📱 பக்தி Shorts (9:16)</h2>
                <p style={{ fontSize: 12, color: "#a0a0c0", margin: "4px 0 0 0" }}>ஆன்மீகப் பொன்மொழிகள், எளிய மந்திரங்கள்</p>
              </div>
              <button onClick={toggleShortsEnabled} style={toggleStyle(shortsEnabled)}>
                <div style={knobStyle(shortsEnabled)} />
              </button>
            </div>
            <span style={{ fontSize: 12, color: shortsEnabled ? "#4ade80" : "#f87171", fontWeight: 600 }}>
              {shortsEnabled ? "🟢 ON — மணிநேரத்திற்கு 1 Short" : "🔴 OFF — நிறுத்தி வைக்கப்பட்டுள்ளது"}
            </span>
          </div>
        </div>

        {/* Voice selector */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, border: "1px solid rgba(250,204,21,0.2)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>🗣️ பக்தி குரல் தேர்வு (Voice Settings)</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 16 }}>வாசிப்பதற்கு மிகவும் அமைதியாகவும் நிதானமாகவும் அமைந்த குரல்</p>
          <select
            value={selectedVoice}
            onChange={(e) => changeVoice(e.target.value)}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
              background: "#1c0b02", color: "#fff", fontSize: 14, fontWeight: 500, outline: "none", cursor: "pointer"
            }}
          >
            {voiceOptions.map(o => (
              <option key={o.value} value={o.value} style={{ background: "#09050d" }}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* YouTube Connection Card */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, border: "1px solid rgba(234,88,12,0.2)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>📤 சிவன் அருள் யூடியூப் சேனல் இணைப்பு (YouTube Channel Connection)</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 16 }}>பக்தி வீடியோக்கள் இந்த குறிப்பிட்ட சேனலில் மட்டுமே பதிவேற்றப்படும்</p>
          
          {ytStatus?.connected && ytStatus.channel ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.02)", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {ytStatus.channel.thumbnail && (
                  <img style={{ width: 36, height: 36, borderRadius: "50%" }} src={ytStatus.channel.thumbnail} alt="channel logo" />
                )}
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>{ytStatus.channel.title}</p>
                  {ytStatus.channel.customUrl && (
                    <p style={{ margin: 0, fontSize: 11, color: "#a0a0c0" }}>{ytStatus.channel.customUrl}</p>
                  )}
                </div>
              </div>
              <button
                onClick={disconnectYt}
                style={{ background: "rgba(239,68,68,0.15)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                ❌ துண்டி (Disconnect)
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#facc15", fontWeight: 600 }}>⚠️ பக்தி யூடியூப் சேனல் இணைக்கப்படவில்லை.</span>
              <a
                href="/api/sivan-arul/youtube/auth"
                style={{ display: "inline-block", textAlign: "center", textDecoration: "none", background: "linear-gradient(90deg, #ea580c, #d97706)", color: "#fff", padding: "12px 16px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                🔗 பக்தி யூடியூப் சேனலுடன் இணை (Link Devotional Channel)
              </a>
            </div>
          )}
        </div>

        {/* Temple Legend / Puranic Story Shorts */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: "20px 24px", marginBottom: 24, border: "1px solid rgba(250,204,21,0.2)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4, marginTop: 0 }}>🛕 கோவில் புராணக் கதை Shorts (Temple Legend Shorts)</h2>
          <p style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 16 }}>ஒரு கோவில்/தெய்வத்தின் புராணக் கதையை உள்ளிடவும் — Gemini ஸ்கிரிப்ட் எழுதி, குரல் கொடுத்து, YouTube-ல் அப்லோட் செய்யும்</p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12, color: "#ddd", display: "block", marginBottom: 6 }}>கோவில் / தெய்வம் பெயர்</span>
              <input
                value={legendTemple}
                onChange={(e) => setLegendTemple(e.target.value)}
                placeholder="எ.கா: ஸ்ரீரங்கம் கோவில் — ஆண்டளக்கும் ஐயன்"
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "#1c0b02", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 12, color: "#ddd", display: "block", marginBottom: 6 }}>புராணக் கதை விவரம் (Story details)</span>
              <textarea
                value={legendStory}
                onChange={(e) => setLegendStory(e.target.value)}
                placeholder="கதையை சுருக்கமாகவோ விரிவாகவோ இங்கே எழுதவும்..."
                rows={5}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "#1c0b02", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { value: "private", label: "🔒 Private" },
                { value: "unlisted", label: "🔗 Unlisted" },
                { value: "public", label: "🌍 Public" }
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setLegendPrivacy(opt.value)}
                  style={{
                    padding: "8px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: legendPrivacy === opt.value ? "1px solid #facc15" : "1px solid rgba(255,255,255,0.15)",
                    background: legendPrivacy === opt.value ? "rgba(250,204,21,0.15)" : "transparent",
                    color: legendPrivacy === opt.value ? "#facc15" : "#ccc"
                  }}
                >{opt.label}</button>
              ))}
            </div>
            <button
              type="button"
              onClick={submitLegendShorts}
              disabled={legendSubmitting}
              style={{
                padding: "12px 16px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
                background: "linear-gradient(90deg, #ea580c, #d97706)", color: "#fff", opacity: legendSubmitting ? 0.7 : 1
              }}
            >{legendSubmitting ? "⏳ தயாராகிறது..." : "🚀 புராணக் கதை Short உருவாக்கு"}</button>
          </div>
        </div>

        {/* Deity Week Rotation list */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 20, marginBottom: 24, border: "1px solid rgba(251,146,60,0.15)" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>🗓️ நாள் வாரியான தெய்வ வழிபாடுகள் & உடனடி வீடியோக்கள்</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {deities.map(d => {
              const isToday = d.day === todayDay;
              const triggerLongKey = `${d.name}-false`;
              const triggerShortKey = `${d.name}-true`;
              
              return (
                <div key={d.name} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px", borderRadius: 14,
                  background: isToday ? "rgba(234, 88, 12, 0.12)" : "rgba(255,255,255,0.02)",
                  border: isToday ? "1px solid rgba(234, 88, 12, 0.4)" : "1px solid rgba(255,255,255,0.05)",
                  position: "relative"
                }}>
                  {isToday && (
                    <div style={{
                      position: "absolute", top: -8, left: 15, background: "#ea580c",
                      padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700
                    }}>இன்று (TODAY)</div>
                  )}
                  
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 24 }}>{deityEmojis[d.name] || "🪷"}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{d.tamilName}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#888" }}>{weekdayNames[d.day]}</p>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => triggerDeityVideo(d.name, true)}
                      disabled={triggering[triggerShortKey] || triggering[triggerLongKey]}
                      style={{
                        padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600,
                        background: "rgba(250,204,21,0.15)", color: "#facc15", cursor: "pointer",
                        opacity: triggering[triggerShortKey] ? 0.7 : 1
                      }}
                    >
                      {triggering[triggerShortKey] ? "⏳ Shorts..." : "📱 Shorts"}
                    </button>
                    <button
                      onClick={() => triggerDeityVideo(d.name, false)}
                      disabled={triggering[triggerShortKey] || triggering[triggerLongKey]}
                      style={{
                        padding: "8px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600,
                        background: "linear-gradient(90deg, #ea580c, #d97706)", color: "#fff", cursor: "pointer",
                        opacity: triggering[triggerLongKey] ? 0.7 : 1
                      }}
                    >
                      {triggering[triggerLongKey] ? "⏳ Video..." : "📺 Video"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Message Status */}
        {message && (
          <div style={{
            background: message.includes("❌") || message.includes("⚠️") ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
            border: `1px solid ${message.includes("❌") || message.includes("⚠️") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            borderRadius: 12, padding: "12px 16px", fontSize: 14, textAlign: "center", marginBottom: 16
          }}>{message}</div>
        )}

        {/* LIVE STATUS PANEL */}
        <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: 16, border: `1px solid ${isRunning ? "rgba(251,146,60,0.5)" : "rgba(255,255,255,0.08)"}`, marginBottom: 24, overflow: "hidden", transition: "border-color 0.3s" }}>
          <div style={{ padding: "14px 20px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: isRunning ? "#f97316" : "#555", boxShadow: isRunning ? "0 0 8px #f97316" : "none", animation: isRunning ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: isRunning ? "#f97316" : "#666" }}>
              {isRunning ? "🔴 Live — பக்தி வீடியோ தயாராகிறது..." : "⚪ பக்தி லைவ் பேனல் (Live Status)"}
            </span>
            <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>ஒவ்வொரு 3 வினாடிக்கும் refresh</span>
          </div>

          <div ref={logContainerRef} style={{ maxHeight: 300, overflowY: "auto", padding: "12px 0" }}>
            {logs.length === 0 ? (
              <p style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
                பக்தி வீடியோக்களை க்யூ செய்த பின், அதன் லைவ் விவரங்கள் இங்கே தோன்றும்...
              </p>
            ) : (
              logs.map((log) => {
                const colors: Record<string, { bg: string; border: string; dot: string }> = {
                  running: { bg: "rgba(251,146,60,0.06)", border: "rgba(251,146,60,0.15)", dot: "#f97316" },
                  done:    { bg: "rgba(34,197,94,0.06)",   border: "rgba(34,197,94,0.15)",  dot: "#22c55e" },
                  error:   { bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   dot: "#ef4444" },
                  info:    { bg: "rgba(250,204,21,0.06)",  border: "rgba(250,204,21,0.15)", dot: "#facc15" },
                };
                const c = colors[log.status] || colors.info;
                const time = new Date(log.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                return (
                  <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 20px", background: c.bg, borderLeft: `3px solid ${c.dot}`, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, marginTop: 5, flexShrink: 0, boxShadow: log.status === "running" ? `0 0 6px ${c.dot}` : "none" }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, color: "#ddd", lineHeight: 1.4 }}>{log.message}</span>
                      {log.region && <span style={{ fontSize: 11, color: "#666", marginLeft: 8 }}>— {log.region}</span>}
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
