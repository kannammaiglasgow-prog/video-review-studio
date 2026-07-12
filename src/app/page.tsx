"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const choices = {
  stance: ["ஆதரவு", "எதிர்ப்பு", "நடுநிலை", "விமர்சனம்", "பாராட்டு", "உண்மைச் சரிபார்ப்பு"],
  tone: ["இயல்பான", "நகைச்சுவை", "கிண்டல்", "உணர்ச்சிகரமான", "தீவிரமான", "ஊக்கமளிக்கும்"],
  persona: ["நண்பர்", "யூடியூபர்", "ஹீரோ", "வில்லன்", "சினிமா விவரிப்பாளர்", "செய்தி வாசிப்பாளர்"],
  voice: ["ஆண் — இயல்பான", "பெண் — இயல்பான", "ஆண் — ஆற்றலான", "பெண் — ஆற்றலான", "டிராமாட்டிக்"],
  duration: ["15 விநாடிகள்", "30 விநாடிகள்", "60 விநாடிகள்", "2 நிமிடங்கள்", "5 நிமிடங்கள்", "8 நிமிடங்கள்", "10 நிமிடங்கள்"],
};

type ChoiceKey = keyof typeof choices;
const defaults: Record<ChoiceKey, string> = { stance: "நடுநிலை", tone: "இயல்பான", persona: "யூடியூபர்", voice: "பெண் — இயல்பான", duration: "60 விநாடிகள்" };

function ChoiceGroup({ label, name, value, onChange }: { label: string; name: ChoiceKey; value: string; onChange: (value: string) => void }) {
  return <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-200">{label}</legend><div className="flex flex-wrap gap-2">{choices[name].map((item) => <button key={item} type="button" onClick={() => onChange(item)} className={`choice ${value === item ? "choice-active" : ""}`}>{item}</button>)}</div></fieldset>;
}

export default function Home() {
  const [form, setForm] = useState({ url: "", startTime: "00:00", endTime: "01:00", format: "9:16", customInstruction: "", ...defaults });
  const [status, setStatus] = useState<"idle" | "saving" | "queued" | "error">("idle");
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const previewClass = useMemo(() => form.format === "9:16" ? "aspect-[9/16] max-h-[540px]" : "aspect-video", [form.format]);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    fetch("/api/projects").then((response) => response.json()).then((data) => {
      const latest = data.projects?.find((project: { status: string }) => project.status === "complete");
      if (latest) {
        setVideoUrl(`/api/projects/${latest.id}/video`);
        setMessage(`கடைசியாக உருவாக்கிய திட்டம் #${latest.id} பார்க்கத் தயாராக உள்ளது.`);
        setStatus("queued");
      }
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("saving"); setMessage(""); setVideoUrl("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "திட்டத்தை உருவாக்க முடியவில்லை");
      setStatus("queued"); setMessage(`திட்டம் #${result.id} உருவாக்கப்பட்டது. Transcript மற்றும் தமிழ் script தயாராகிறது...`);
      const processResponse = await fetch(`/api/projects/${result.id}/process`, { method: "POST" });
      const processed = await processResponse.json();
      if (!processResponse.ok) throw new Error(processed.error || "Processing தோல்வியடைந்தது");
      setMessage(`திட்டம் #${result.id} முழுமையாக தயாராகிவிட்டது. ${processed.assetCount} stock clips பயன்படுத்தப்பட்டன.`);
      setVideoUrl(`/api/projects/${result.id}/video`);
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "எதிர்பாராத பிழை"); }
  }

  return <main className="min-h-screen">
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-10"><div className="flex items-center gap-3"><div className="logo-mark">▶</div><div><p className="text-lg font-bold tracking-tight">Video Review Studio</p><p className="text-xs text-slate-400">தமிழ் AI வீடியோ உருவாக்கி</p></div></div><div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Local mode</div></div></header>
    <div className="mx-auto grid max-w-[1500px] gap-7 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10">
      <form onSubmit={submit} className="space-y-6">
        <section><p className="eyebrow">புதிய உருவாக்கம்</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">ஒரு வீடியோவை தமிழ் review-ஆக மாற்றுங்கள்</h1><p className="mt-3 max-w-3xl text-slate-400">எந்த மொழி YouTube வீடியோவையும் ஆய்வு செய்து, உங்கள் பார்வை, குரல் மற்றும் பாணியில் copyright-safe review video உருவாக்குங்கள்.</p></section>
        <section className="panel space-y-5"><div className="step-title"><span>1</span><div><h2>வீடியோவைத் தேர்ந்தெடுக்கவும்</h2><p>YouTube URL மற்றும் ஆய்வு செய்ய வேண்டிய பகுதி</p></div></div><label className="block"><span className="field-label">YouTube URL</span><div className="url-input"><span>▶</span><input required type="url" placeholder="https://youtube.com/watch?v=..." value={form.url} onChange={(e) => set("url", e.target.value)} /></div></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">தொடக்க நேரம்</span><input className="text-input" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} placeholder="00:00" /></label><label><span className="field-label">முடிவு நேரம்</span><input className="text-input" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} placeholder="01:00" /></label></div></section>
        <section className="panel space-y-7"><div className="step-title"><span>2</span><div><h2>Review பாணியை வடிவமைக்கவும்</h2><p>AI எழுத வேண்டிய நிலைப்பாடு மற்றும் உணர்வு</p></div></div><ChoiceGroup label="நிலைப்பாடு" name="stance" value={form.stance} onChange={(v) => set("stance", v)} /><ChoiceGroup label="Tone" name="tone" value={form.tone} onChange={(v) => set("tone", v)} /><ChoiceGroup label="கதாபாத்திர பாணி" name="persona" value={form.persona} onChange={(v) => set("persona", v)} /><label className="block"><span className="field-label">கூடுதல் வழிமுறை (விருப்பம்)</span><textarea className="text-input min-h-24 resize-y" placeholder="உதாரணம்: தொடக்கத்தில் வலுவான hook சேர்க்கவும்..." value={form.customInstruction} onChange={(e) => set("customInstruction", e.target.value)} /></label></section>
        <section className="panel space-y-7"><div className="step-title"><span>3</span><div><h2>குரல் மற்றும் output</h2><p>Final video எப்படி இருக்க வேண்டும்?</p></div></div><ChoiceGroup label="தமிழ் குரல்" name="voice" value={form.voice} onChange={(v) => set("voice", v)} /><div className="space-y-3"><p className="text-sm font-semibold text-slate-200">Video வடிவம்</p><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => set("format", "9:16")} className={`format-card ${form.format === "9:16" ? "format-active" : ""}`}><span className="portrait-icon"/><strong>Shorts / Reels</strong><small>9:16 · 1080 × 1920</small></button><button type="button" onClick={() => set("format", "16:9")} className={`format-card ${form.format === "16:9" ? "format-active" : ""}`}><span className="landscape-icon"/><strong>Normal video</strong><small>16:9 · 1920 × 1080</small></button></div></div><ChoiceGroup label="கால அளவு" name="duration" value={form.duration} onChange={(v) => set("duration", v)} /></section>
        <button disabled={status === "saving"} className="generate-button" type="submit"><span>{status === "saving" ? "தயாராகிறது..." : "Review video உருவாக்கு"}</span><b>→</b></button>{message && <div className={`status ${status === "error" ? "status-error" : ""}`}>{message}</div>}
        {videoUrl && <section className="panel space-y-4"><div className="step-title"><span>✓</span><div><h2>உங்கள் review video தயாராகிவிட்டது</h2><p>Preview செய்து MP4 file-ஐ சேமிக்கலாம்</p></div></div><video className="mx-auto max-h-[620px] w-full rounded-xl bg-black" src={videoUrl} controls playsInline /><a className="generate-button" href={`${videoUrl}?download=1`} download><span>MP4 video சேமிக்கவும்</span><b>↓</b></a></section>}
      </form>
      <aside className="lg:sticky lg:top-6 lg:self-start"><div className="panel overflow-hidden p-0"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Live preview</h2><p className="text-xs text-slate-500">{form.format} · {form.duration}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">Draft</span></div><div className="preview-wrap"><div className={`preview ${previewClass}`}><div className="preview-glow"/><div className="preview-content"><span className="preview-badge">{form.stance}</span><div><p className="text-[10px] uppercase tracking-[.25em] text-white/60">தமிழ் வீடியோ review</p><h3 className="mt-2 text-xl font-black leading-tight">உங்கள் கதையை<br/>உங்கள் பாணியில் சொல்லுங்கள்</h3><p className="mt-3 text-xs text-white/65">{form.tone} · {form.persona}</p></div><div className="subtitle-demo">தமிழ் subtitles இங்கே தோன்றும்</div></div></div></div><div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center"><div className="p-4"><b className="block">{form.format}</b><small>வடிவம்</small></div><div className="p-4"><b className="block">{form.duration}</b><small>நீளம்</small></div><div className="p-4"><b className="block">தமிழ்</b><small>Output</small></div></div></div><div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-sm leading-6 text-amber-100/70"><strong className="text-amber-200">அடுத்த படி:</strong> `.env.local`-ல் API keys சேர்க்கப்பட்டதும் transcript, Gemini, stock footage மற்றும் TTS இணைப்புகள் செயல்படும்.</div></aside>
    </div>
  </main>;
}
