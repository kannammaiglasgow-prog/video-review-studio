"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ChannelSummary = {
  key: string;
  label: string;
  connected: boolean;
  todayCount: number;
  inProgressCount: number;
  lastProject: { id: number; title: string; status: string; createdAt: string; youtubeUrl: string | null } | null;
};

const statusBadge: Record<string, { emoji: string; color: string; label: string }> = {
  generating: { emoji: "🟡", color: "#fbbf24", label: "Script எழுதப்படுகிறது" },
  writing_scenes: { emoji: "🟡", color: "#fbbf24", label: "Scenes தயாராகிறது" },
  generating_audio: { emoji: "🟡", color: "#fbbf24", label: "Audio தயாராகிறது" },
  fetching_media: { emoji: "🟡", color: "#fbbf24", label: "Media தேடுகிறது" },
  script_ready: { emoji: "🟡", color: "#fbbf24", label: "Render ஆக காத்திருக்கிறது" },
  rendering: { emoji: "🟡", color: "#fbbf24", label: "Render ஆகிறது" },
  rendered: { emoji: "🟢", color: "#4ade80", label: "Video ரெடி" },
  uploaded: { emoji: "🟢", color: "#4ade80", label: "Upload ஆயிற்று" },
  failed: { emoji: "🔴", color: "#f87171", label: "தோல்வி" },
};

function relativeTime(iso: string): string {
  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC, no timezone suffix.
  const diffMs = Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "இப்போதுதான்";
  if (mins < 60) return `${mins} நிமிடத்திற்கு முன்`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} மணி நேரத்திற்கு முன்`;
  const days = Math.floor(hours / 24);
  return `${days} நாட்களுக்கு முன்`;
}

export default function DashboardPage() {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/channels?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      setChannels(data.channels || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 15000);
    return () => clearInterval(interval);
  }, [fetchChannels]);

  const totalToday = channels.reduce((sum, c) => sum + c.todayCount, 0);
  const totalInProgress = channels.reduce((sum, c) => sum + c.inProgressCount, 0);
  const errorChannels = channels.filter((c) => c.lastProject?.status === "failed").length;
  const disconnectedChannels = channels.filter((c) => !c.connected).length;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)", color: "#fff", padding: "30px 20px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 26 }}>🏠</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, background: "linear-gradient(90deg, #a78bfa, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
            Work Dashboard
          </h1>
        </div>

        {/* Global summary bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 28 }}>
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 12, color: "#a0a0c0" }}>இன்று மொத்தம்</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{totalToday}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 12, color: "#a0a0c0" }}>இப்போது நடக்கிறது</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#a78bfa" }}>{totalInProgress}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${errorChannels ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 12, color: "#a0a0c0" }}>Error channels</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: errorChannels ? "#f87171" : "#fff" }}>{errorChannels}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${disconnectedChannels ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 12, color: "#a0a0c0" }}>YouTube இணைக்கப்படாதவை</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: disconnectedChannels ? "#fbbf24" : "#fff" }}>{disconnectedChannels}</div>
          </div>
        </div>

        {/* Video Project section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🎬 Video Project</h2>
          <span style={{ fontSize: 12, color: "#707090" }}>ஒவ்வொரு 15 வினாடிக்கும் refresh</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#707090" }}>Loading...</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
            {channels.map((c) => {
              const badge = c.lastProject ? statusBadge[c.lastProject.status] : null;
              return (
                <Link
                  key={c.key}
                  href={`/dashboard/channels/${c.key}`}
                  style={{
                    display: "block", textDecoration: "none", color: "#fff",
                    background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 16,
                    border: c.lastProject?.status === "failed" ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(255,255,255,0.1)",
                    transition: "border-color 0.2s, transform 0.2s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.label}</div>
                    <span style={{ fontSize: 16 }} title={c.connected ? "YouTube இணைக்கப்பட்டுள்ளது" : "இணைக்கப்படவில்லை"}>
                      {c.connected ? "🔗" : "⬜"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 13 }}>{badge ? badge.emoji : "⚪"}</span>
                    <span style={{ fontSize: 12.5, color: badge ? badge.color : "#707090" }}>
                      {badge ? badge.label : "இதுவரை video இல்லை"}
                    </span>
                  </div>

                  {c.lastProject && (
                    <div style={{ fontSize: 12, color: "#a0a0c0", marginBottom: 10, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {c.lastProject.title}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#707090", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8 }}>
                    <span>இன்று: {c.todayCount}</span>
                    {c.inProgressCount > 0 && <span style={{ color: "#a78bfa" }}>⚙️ {c.inProgressCount} நடக்கிறது</span>}
                    {c.lastProject && <span>{relativeTime(c.lastProject.createdAt)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 30, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/sivan-arul/story-to-video" style={{ fontSize: 13, color: "#a78bfa", textDecoration: "none" }}>📖 Story to Video →</Link>
          <Link href="/auto-news" style={{ fontSize: 13, color: "#a78bfa", textDecoration: "none" }}>📰 Auto News dashboard →</Link>
          <Link href="/sivan-arul" style={{ fontSize: 13, color: "#a78bfa", textDecoration: "none" }}>🕉️ Sivan Arul dashboard →</Link>
          <Link href="/" style={{ fontSize: 13, color: "#707090", textDecoration: "none" }}>← முதன்மை பக்கம்</Link>
        </div>
      </div>
    </div>
  );
}
