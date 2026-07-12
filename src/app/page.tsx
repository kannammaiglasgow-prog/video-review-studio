"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const choices = {
  stance: ["ஆதரவு", "எதிர்ப்பு", "நடுநிலை", "விமர்சனம்", "பாராட்டு", "உண்மைச் சரிபார்ப்பு"],
  tone: ["இயல்பான", "நகைச்சுவை", "கிண்டல்", "உணர்ச்சிகரமான", "தீவிரமான", "ஊக்கமளிக்கும்"],
  persona: ["நண்பர்", "யூடியூபர்", "ஹீரோ", "வில்லன்", "சினிமா விவரிப்பாளர்", "செய்தி வாசிப்பாளர்"],
  voice: ["ஆண் — இயல்பான", "பெண் — இயல்பான", "ஆண் — ஆற்றலான", "பெண் — ஆற்றலான", "டிராமாட்டிக்"],
  duration: ["15 விநாடிகள்", "30 விநாடிகள்", "60 விநாடிகள்", "2 நிமிடங்கள்", "5 நிமிடங்கள்", "8 நிமிடங்கள்", "10 நிமிடங்கள்"],
};

type ChoiceKey = keyof typeof choices;
const defaults: Record<ChoiceKey, string> = { stance: "நடுநிலை", tone: "இயல்பான", persona: "யூடியூபர்", voice: "பெண் — இயல்பான", duration: "60 விநாடிகள்" };

const sourceOptions = [
  { value: "youtube", label: "▶ YouTube வீடியோ" },
  { value: "news", label: "📰 News article" },
  { value: "text", label: "✍️ உரை paste" },
];

type StockResult = { provider: string; kind?: "video" | "image"; id: string; url: string; previewUrl?: string; width: number; height: number; attribution?: string };
type Clip = { index: number; url: string; kind: "video" | "image" };

function ChoiceGroup({ label, name, value, onChange }: { label: string; name: ChoiceKey; value: string; onChange: (value: string) => void }) {
  return <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-200">{label}</legend><div className="flex flex-wrap gap-2">{choices[name].map((item) => <button key={item} type="button" onClick={() => onChange(item)} className={`choice ${value === item ? "choice-active" : ""}`}>{item}</button>)}</div></fieldset>;
}

function AssetPreview({ asset, className }: { asset: StockResult; className: string }) {
  if (asset.kind === "image") return <img className={className} src={asset.previewUrl || asset.url} alt={asset.attribution || "stock image"} loading="lazy" />;
  return <video className={className} src={asset.url} muted loop playsInline preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />;
}

export default function Home() {
  const [form, setForm] = useState({ url: "", sourceType: "youtube", scriptMode: "rewrite", sourceText: "", startTime: "00:00", endTime: "01:00", format: "9:16", customInstruction: "", ...defaults });
  const [status, setStatus] = useState<"idle" | "saving" | "queued" | "error">("idle");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [videoVersion, setVideoVersion] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipVersion, setClipVersion] = useState(0);
  const [editingClip, setEditingClip] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<StockResult[]>([]);
  const [searchTab, setSearchTab] = useState<"video" | "image">("video");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingRender, setPendingRender] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const previewClass = useMemo(() => form.format === "9:16" ? "aspect-[9/16] max-h-[540px]" : "aspect-video", [form.format]);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const videoUrl = projectId ? `/api/projects/${projectId}/video${videoVersion ? `?v=${videoVersion}` : ""}` : "";
  const currentClip = editingClip !== null ? clips.find((clip) => clip.index === editingClip) : undefined;

  const loadClips = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/projects/${id}/clips`);
      const data = await response.json();
      setClips(data.clips || []);
    } catch { setClips([]); }
  }, []);

  useEffect(() => {
    fetch("/api/projects").then((response) => response.json()).then((data) => {
      const latest = data.projects?.find((project: { status: string }) => project.status === "complete");
      if (latest) {
        setProjectId(latest.id);
        setMessage(`கடைசியாக உருவாக்கிய திட்டம் #${latest.id} பார்க்கத் தயாராக உள்ளது.`);
        setStatus("queued");
        loadClips(latest.id);
      }
    }).catch(() => undefined);
  }, [loadClips]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("saving"); setMessage(""); setProjectId(null); setClips([]); setEditingClip(null); setPendingRender(false); setSuggestions([]);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "திட்டத்தை உருவாக்க முடியவில்லை");
      const sourceNote = form.sourceType === "news" ? "News article படிக்கப்பட்டு" : form.sourceType === "text" ? "உரை எடுக்கப்பட்டு" : "Transcript எடுக்கப்பட்டு";
      setStatus("queued"); setMessage(`திட்டம் #${result.id} உருவாக்கப்பட்டது. ${sourceNote} தமிழ் voice-over தயாராகிறது...`);
      const processResponse = await fetch(`/api/projects/${result.id}/process`, { method: "POST" });
      const processed = await processResponse.json();
      if (!processResponse.ok) throw new Error(processed.error || "Processing தோல்வியடைந்தது");
      setMessage(`திட்டம் #${result.id} முழுமையாக தயாராகிவிட்டது. ${processed.assetCount} stock clips பயன்படுத்தப்பட்டன.`);
      setProjectId(result.id); setVideoVersion(Date.now());
      loadClips(result.id);
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "எதிர்பாராத பிழை"); }
  }

  async function openClipEditor(index: number) {
    setEditingClip(index); setSearchResults([]); setSearchQuery(""); setSearchTab("video");
    if (projectId !== null && !suggestions.length) {
      try {
        const response = await fetch(`/api/projects/${projectId}/suggestions`);
        const data = await response.json();
        setSuggestions(data.results || []);
      } catch { setSuggestions([]); }
    }
  }

  function closeClipEditor() {
    setEditingClip(null); setSearchResults([]); setSearchQuery("");
  }

  async function searchStock() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true); setSearchResults([]);
    try {
      const orientation = form.format === "9:16" ? "portrait" : "landscape";
      const response = await fetch(`/api/stock/search?q=${encodeURIComponent(searchQuery)}&orientation=${orientation}&type=${searchTab}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search தோல்வியடைந்தது");
      setSearchResults(data.results || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Search தோல்வியடைந்தது"); }
    finally { setSearching(false); }
  }

  async function applyReplacement(index: number, apply: () => Promise<Response>) {
    if (projectId === null) return;
    try {
      const response = await apply();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Clip மாற்ற முடியவில்லை");
      setClipVersion(Date.now()); setPendingRender(true); closeClipEditor();
      loadClips(projectId);
      setMessage(`Clip ${index + 1} மாற்றப்பட்டது. எல்லா மாற்றங்களும் முடிந்ததும் "மீண்டும் render" அழுத்தவும்.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Clip மாற்ற முடியவில்லை"); }
  }

  async function replaceWithAsset(asset: StockResult) {
    if (projectId === null || editingClip === null) return;
    const assetKey = `${asset.provider}-${asset.kind || "video"}-${asset.id}`;
    setReplacing(assetKey);
    await applyReplacement(editingClip, () => fetch(`/api/projects/${projectId}/clips/${editingClip}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: asset.url, kind: asset.kind || "video" }) }));
    setReplacing(null);
  }

  async function uploadImage(file: File) {
    if (projectId === null || editingClip === null) return;
    setUploading(true);
    const body = new FormData();
    body.append("file", file);
    await applyReplacement(editingClip, () => fetch(`/api/projects/${projectId}/clips/${editingClip}`, { method: "POST", body }));
    setUploading(false);
  }

  async function rerender() {
    if (projectId === null) return;
    setRerendering(true); setMessage("புதிய clips-உடன் video மீண்டும் render ஆகிறது...");
    try {
      const response = await fetch(`/api/projects/${projectId}/rerender`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Render தோல்வியடைந்தது");
      setVideoVersion(Date.now()); setPendingRender(false);
      setMessage(`திட்டம் #${projectId} புதிய clips-உடன் தயாராகிவிட்டது.`);
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Render தோல்வியடைந்தது"); }
    finally { setRerendering(false); }
  }

  return <main className="min-h-screen">
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-10"><div className="flex items-center gap-3"><div className="logo-mark">▶</div><div><p className="text-lg font-bold tracking-tight">Video Review Studio</p><p className="text-xs text-slate-400">தமிழ் AI வீடியோ உருவாக்கி</p></div></div><div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Local mode</div></div></header>
    <div className="mx-auto grid max-w-[1500px] gap-7 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10">
      <form onSubmit={submit} className="space-y-6">
        <section><p className="eyebrow">புதிய உருவாக்கம்</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">ஒரு வீடியோவை தமிழ் review-ஆக மாற்றுங்கள்</h1><p className="mt-3 max-w-3xl text-slate-400">YouTube வீடியோ, news article அல்லது உங்கள் சொந்த உரை — எதிலிருந்தும் copyright-safe தமிழ் video உருவாக்குங்கள்.</p></section>
        <section className="panel space-y-5"><div className="step-title"><span>1</span><div><h2>மூலத்தைத் தேர்ந்தெடுக்கவும்</h2><p>YouTube வீடியோ, news URL அல்லது உரை paste</p></div></div>
          <div className="flex flex-wrap gap-2">{sourceOptions.map((option) => <button key={option.value} type="button" onClick={() => set("sourceType", option.value)} className={`choice ${form.sourceType === option.value ? "choice-active" : ""}`}>{option.label}</button>)}</div>
          {form.sourceType !== "text" && <label className="block"><span className="field-label">{form.sourceType === "news" ? "News URL" : "YouTube URL"}</span><div className="url-input"><span>{form.sourceType === "news" ? "📰" : "▶"}</span><input required type="url" placeholder={form.sourceType === "news" ? "https://www.bbc.com/news/..." : "https://youtube.com/watch?v=..."} value={form.url} onChange={(e) => set("url", e.target.value)} /></div></label>}
          {form.sourceType === "youtube" && <div className="grid gap-4 sm:grid-cols-2"><label><span className="field-label">தொடக்க நேரம்</span><input className="text-input" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} placeholder="00:00" /></label><label><span className="field-label">முடிவு நேரம்</span><input className="text-input" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} placeholder="01:00" /></label></div>}
          {form.sourceType === "news" && <p className="text-xs text-slate-400">Article-ஐ AI படித்து, நீங்கள் தேர்ந்தெடுக்கும் நிலைப்பாட்டில் தமிழ் video உருவாக்கும். "நடுநிலை" என்றால் neutral செய்தி சுருக்கம்; மற்ற நிலைப்பாடுகள் கருத்து/review style.</p>}
          {form.sourceType === "text" && <>
            <label className="block"><span className="field-label">உங்கள் உரை / voice-over script</span><textarea required className="text-input min-h-40 resize-y" placeholder="உங்கள் செய்தி, குறிப்பு அல்லது voice-over script-ஐ இங்கே paste செய்யவும்..." value={form.sourceText} onChange={(e) => set("sourceText", e.target.value)} /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => set("scriptMode", "rewrite")} className={`choice ${form.scriptMode === "rewrite" ? "choice-active" : ""}`}>🪄 AI மெருகூட்டட்டும்</button>
              <button type="button" onClick={() => set("scriptMode", "as-is")} className={`choice ${form.scriptMode === "as-is" ? "choice-active" : ""}`}>📖 அப்படியே வாசிக்கவும்</button>
            </div>
            <p className="text-xs text-slate-400">{form.scriptMode === "as-is" ? "நீங்கள் எழுதியதை மாற்றாமல் அப்படியே வாசிக்கும் — நிலைப்பாடு/tone script-ஐ பாதிக்காது." : "உங்கள் உரையை அடிப்படையாகக் கொண்டு, தேர்ந்தெடுத்த நிலைப்பாடு மற்றும் tone-ல் AI புதிய தமிழ் script எழுதும்."}</p>
          </>}
        </section>
        <section className="panel space-y-7"><div className="step-title"><span>2</span><div><h2>Review பாணியை வடிவமைக்கவும்</h2><p>AI எழுத வேண்டிய நிலைப்பாடு மற்றும் உணர்வு</p></div></div><ChoiceGroup label="நிலைப்பாடு" name="stance" value={form.stance} onChange={(v) => set("stance", v)} /><ChoiceGroup label="Tone" name="tone" value={form.tone} onChange={(v) => set("tone", v)} /><ChoiceGroup label="கதாபாத்திர பாணி" name="persona" value={form.persona} onChange={(v) => set("persona", v)} /><label className="block"><span className="field-label">கூடுதல் வழிமுறை (விருப்பம்)</span><textarea className="text-input min-h-24 resize-y" placeholder="உதாரணம்: தொடக்கத்தில் வலுவான hook சேர்க்கவும்..." value={form.customInstruction} onChange={(e) => set("customInstruction", e.target.value)} /></label></section>
        <section className="panel space-y-7"><div className="step-title"><span>3</span><div><h2>குரல் மற்றும் output</h2><p>Final video எப்படி இருக்க வேண்டும்?</p></div></div><ChoiceGroup label="தமிழ் குரல்" name="voice" value={form.voice} onChange={(v) => set("voice", v)} /><div className="space-y-3"><p className="text-sm font-semibold text-slate-200">Video வடிவம்</p><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => set("format", "9:16")} className={`format-card ${form.format === "9:16" ? "format-active" : ""}`}><span className="portrait-icon"/><strong>Shorts / Reels</strong><small>9:16 · 1080 × 1920</small></button><button type="button" onClick={() => set("format", "16:9")} className={`format-card ${form.format === "16:9" ? "format-active" : ""}`}><span className="landscape-icon"/><strong>Normal video</strong><small>16:9 · 1920 × 1080</small></button></div></div><ChoiceGroup label="கால அளவு" name="duration" value={form.duration} onChange={(v) => set("duration", v)} /><p className="text-xs text-slate-400">குறிப்பு: voice-over சற்று நீளமானால் video-வும் voice முடியும் வரை நீளும் — பேச்சு நடுவில் வெட்டப்படாது.</p></section>
        <button disabled={status === "saving"} className="generate-button" type="submit"><span>{status === "saving" ? "தயாராகிறது..." : "Review video உருவாக்கு"}</span><b>→</b></button>{message && <div className={`status ${status === "error" ? "status-error" : ""}`}>{message}</div>}
        {projectId !== null && <section className="panel space-y-4"><div className="step-title"><span>✓</span><div><h2>உங்கள் review video தயாராகிவிட்டது</h2><p>Preview செய்து MP4 file-ஐ சேமிக்கலாம்</p></div></div><video key={videoUrl} className="mx-auto max-h-[620px] w-full rounded-xl bg-black" src={videoUrl} controls playsInline /><a className="generate-button" href={`/api/projects/${projectId}/video?download=1`} download><span>MP4 video சேமிக்கவும்</span><b>↓</b></a></section>}
        {projectId !== null && <section className="panel space-y-5"><div className="step-title"><span>✎</span><div><h2>Voice-over மற்றும் clips-ஐ சரிபார்க்கவும்</h2><p>Clip-ஐ click செய்தால் பெரிதாக பார்த்து மாற்றலாம்</p></div></div>
          <div><p className="field-label">Voice-over மட்டும் கேட்க</p><audio className="w-full" src={`/api/projects/${projectId}/audio`} controls preload="none" /></div>
          {clips.length > 0 && <div className="space-y-3"><p className="field-label">பயன்படுத்தப்பட்ட clips ({clips.length}) — மாற்ற ஒரு clip-ஐ click செய்யவும்</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{clips.map((clip) => <button key={clip.index} type="button" onClick={() => openClipEditor(clip.index)} className="group relative overflow-hidden rounded-lg border border-white/10 transition hover:border-white/40">{clip.kind === "image" ? <img className="aspect-video w-full bg-black object-cover" src={`${clip.url}?v=${clipVersion}`} alt={`clip ${clip.index + 1}`} /> : <video className="aspect-video w-full bg-black object-cover" src={`${clip.url}?v=${clipVersion}`} muted loop playsInline onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />}<span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 py-0.5 text-xs">{clip.kind === "image" ? "🖼️" : "🎬"} Clip {clip.index + 1}</span><span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold opacity-0 transition group-hover:opacity-100">மாற்று ✎</span></button>)}</div></div>}
          {pendingRender && <button type="button" onClick={rerender} disabled={rerendering} className="generate-button"><span>{rerendering ? "Render ஆகிறது..." : "புதிய clips-உடன் மீண்டும் render"}</span><b>⟳</b></button>}
        </section>}
      </form>
      <aside className="lg:sticky lg:top-6 lg:self-start"><div className="panel overflow-hidden p-0"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Live preview</h2><p className="text-xs text-slate-500">{form.format} · {form.duration}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-400">Draft</span></div><div className="preview-wrap"><div className={`preview ${previewClass}`}><div className="preview-glow"/><div className="preview-content"><span className="preview-badge">{form.stance}</span><div><p className="text-[10px] uppercase tracking-[.25em] text-white/60">தமிழ் வீடியோ review</p><h3 className="mt-2 text-xl font-black leading-tight">உங்கள் கதையை<br/>உங்கள் பாணியில் சொல்லுங்கள்</h3><p className="mt-3 text-xs text-white/65">{form.tone} · {form.persona}</p></div><div className="subtitle-demo">தமிழ் subtitles இங்கே தோன்றும்</div></div></div></div><div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center"><div className="p-4"><b className="block">{form.format}</b><small>வடிவம்</small></div><div className="p-4"><b className="block">{form.duration}</b><small>நீளம்</small></div><div className="p-4"><b className="block">தமிழ்</b><small>Output</small></div></div></div><div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-sm leading-6 text-amber-100/70"><strong className="text-amber-200">குறிப்பு:</strong> Clip-ஐ click செய்து videos/images தேடி மாற்றலாம்; சொந்த image-ஐயும் upload செய்யலாம் — static image தானாக மெதுவாக zoom ஆகும்.</div></aside>
    </div>

    {editingClip !== null && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={closeClipEditor}>
      <div className="max-h-[92vh] w-full max-w-4xl space-y-5 overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Clip {editingClip + 1}-ஐ மாற்றவும்</h2>
          <button type="button" onClick={closeClipEditor} className="choice">✕ மூடு</button>
        </div>
        {currentClip && <div><p className="field-label mb-2">தற்போதைய clip</p>{currentClip.kind === "image" ? <img className="mx-auto max-h-[320px] rounded-xl bg-black" src={`${currentClip.url}?v=${clipVersion}`} alt="current clip" /> : <video className="mx-auto max-h-[320px] w-full rounded-xl bg-black" src={`${currentClip.url}?v=${clipVersion}`} controls autoPlay muted loop playsInline />}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setSearchTab("video"); setSearchResults([]); }} className={`choice ${searchTab === "video" ? "choice-active" : ""}`}>🎬 Videos</button>
          <button type="button" onClick={() => { setSearchTab("image"); setSearchResults([]); }} className={`choice ${searchTab === "image" ? "choice-active" : ""}`}>🖼️ Images</button>
          <button type="button" onClick={() => uploadInput.current?.click()} disabled={uploading} className="choice">{uploading ? "Upload ஆகிறது..." : "⬆️ சொந்த image upload"}</button>
          <input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadImage(file); e.target.value = ""; }} />
        </div>
        <div className="flex gap-2">
          <input className="text-input flex-1" placeholder={searchTab === "image" ? "English keyword — உதா: sunset beach, temple..." : "English keyword — உதா: city traffic, ocean waves..."} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchStock(); } }} />
          <button type="button" onClick={searchStock} disabled={searching} className="choice choice-active shrink-0">{searching ? "தேடுகிறது..." : "தேடு"}</button>
        </div>
        {searchResults.length > 0 && <div className="space-y-2"><p className="field-label">Search results</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{searchResults.map((asset) => { const assetKey = `${asset.provider}-${asset.kind || "video"}-${asset.id}`; return <div key={assetKey} className="space-y-2"><AssetPreview asset={asset} className="aspect-video w-full rounded-lg bg-black object-cover" /><button type="button" disabled={replacing !== null} onClick={() => replaceWithAsset(asset)} className="choice w-full">{replacing === assetKey ? "மாற்றுகிறது..." : `இதை பயன்படுத்து (${asset.provider})`}</button></div>; })}</div></div>}
        {!searchResults.length && suggestions.length > 0 && searchTab === "video" && <div className="space-y-2"><p className="field-label">பரிந்துரைக்கப்பட்ட videos (இந்த project-க்கு தேடியவை)</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{suggestions.map((asset) => { const assetKey = `suggestion-${asset.provider}-${asset.id}`; return <div key={assetKey} className="space-y-2"><AssetPreview asset={asset} className="aspect-video w-full rounded-lg bg-black object-cover" /><button type="button" disabled={replacing !== null} onClick={() => replaceWithAsset(asset)} className="choice w-full">{replacing === `${asset.provider}-video-${asset.id}` ? "மாற்றுகிறது..." : `இதை பயன்படுத்து (${asset.provider})`}</button></div>; })}</div></div>}
      </div>
    </div>}
  </main>;
}
