"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type CostSummary = {
  today: number;
  last7Days: number;
  last30Days: number;
  allTime: number;
  byStep: Record<string, number>;
  byChannel: Record<string, number>;
  recentProjects: { id: number; createdAt: string; channel: string | null; cost: number; storyPreview: string }[];
};

const stepLabels: Record<string, string> = {
  translate: "Translate",
  scenes: "Scene prompts",
  auto_idea: "Idea/Script",
  tts: "TTS narration (Gemini paid)",
  seo: "SEO/Thumbnail",
};

const box: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 18, marginBottom: 20 };
const statCard = (highlight = false): React.CSSProperties => ({
  background: "rgba(255,255,255,0.05)", border: `1px solid ${highlight ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "14px 18px",
});

function fmt(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export default function CostMonitorPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/cost-monitor?t=" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      setSummary(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 20000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 50%, #0a1628 100%)", color: "#fff", padding: "30px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Link href="/dashboard" style={{ color: "#a78bfa", textDecoration: "none", fontSize: 14 }}>← Dashboard</Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 26 }}>💰</span>
          <h1 style={{ fontSize: 24, fontWeight: 700, background: "linear-gradient(90deg, #a78bfa, #f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
            API Cost Monitor
          </h1>
        </div>
        <div style={{ fontSize: 13, color: "#a0a0c0", marginBottom: 24 }}>
          Free paths (edge-tts, Pollinations AI images) செலவு ஏற்படுத்தாது — இங்கே காட்டப்படுவது Gemini script/scene-prompt calls, paid Gemini TTS, மற்றும் paid image APIs (எ.கா Nano Banana) select பண்ணினால் மட்டும்.
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#707090" }}>Loading...</div>
        ) : !summary ? (
          <div style={{ padding: 40, textAlign: "center", color: "#f87171" }}>Cost data load ஆகவில்லை.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
              <div style={statCard()}>
                <div style={{ fontSize: 12, color: "#a0a0c0" }}>இன்று</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(summary.today)}</div>
              </div>
              <div style={statCard()}>
                <div style={{ fontSize: 12, color: "#a0a0c0" }}>கடந்த 7 நாட்கள்</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(summary.last7Days)}</div>
              </div>
              <div style={statCard()}>
                <div style={{ fontSize: 12, color: "#a0a0c0" }}>கடந்த 30 நாட்கள்</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{fmt(summary.last30Days)}</div>
              </div>
              <div style={statCard(true)}>
                <div style={{ fontSize: 12, color: "#a0a0c0" }}>மொத்தம் (All-time)</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#a78bfa" }}>{fmt(summary.allTime)}</div>
              </div>
            </div>

            <div style={box}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>📊 Step வாரியாக (Breakdown)</div>
              {Object.keys(summary.byStep).length === 0 ? (
                <div style={{ fontSize: 13, color: "#707090" }}>இதுவரை எந்த paid API-உம் பயன்படுத்தப்படவில்லை.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(summary.byStep).sort((a, b) => b[1] - a[1]).map(([step, amt]) => (
                    <div key={step} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                      <span style={{ color: "#c0c0d8" }}>{stepLabels[step] || step}</span>
                      <span style={{ fontWeight: 600 }}>{fmt(amt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={box}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>📺 Channel வாரியாக</div>
              {Object.keys(summary.byChannel).length === 0 ? (
                <div style={{ fontSize: 13, color: "#707090" }}>Data இல்லை.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(summary.byChannel).sort((a, b) => b[1] - a[1]).map(([channel, amt]) => (
                    <div key={channel} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                      <span style={{ color: "#c0c0d8" }}>{channel}</span>
                      <span style={{ fontWeight: 600 }}>{fmt(amt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={box}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>🕘 சமீபத்திய cost-உள்ள projects</div>
              {summary.recentProjects.length === 0 ? (
                <div style={{ fontSize: 13, color: "#707090" }}>இதுவரை எதுவும் இல்லை.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {summary.recentProjects.map((p) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 8 }}>
                      <div style={{ overflow: "hidden" }}>
                        <span style={{ color: "#a78bfa" }}>#{p.id}</span>{" "}
                        <span style={{ color: "#707090" }}>{p.channel || "—"}</span>{" · "}
                        <span style={{ color: "#c0c0d8" }}>{p.storyPreview}{p.storyPreview.length >= 80 ? "…" : ""}</span>
                      </div>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", marginLeft: 12 }}>{fmt(p.cost)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
