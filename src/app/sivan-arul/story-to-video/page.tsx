"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import Link from "next/link";

type Scene = { prompt: string; seconds: number; narrationExcerpt: string };
type ProjectStatus = {
  id: number;
  status: string;
  storyInput: string;
  script: string | null;
  durationTarget: number;
  voice: string;
  scenes: Scene[];
  uploadedImages: boolean[];
  audioDuration: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  seoTags: string[];
  youtubeChannel: string | null;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
  facebookPageId: string | null;
  facebookVideoId: string | null;
  facebookUrl: string | null;
  errorMessage: string | null;
  aspectRatio: string;
  bgmEnabled: boolean;
  animateEnabled: boolean;
  language: string;
  mediaSource: string;
  ttsMode: string;
  localize: boolean;
  thumbnailPrompt: string;
  apiCost: number;
  costBreakdown: Record<string, number>;
};

const voiceOptions = [
  { value: "Female — Warm", label: "பெண் — Warm" },
  { value: "Male — Warm", label: "ஆண் — Warm" },
  { value: "Female — Energetic", label: "பெண் — Energetic" },
  { value: "Male — Energetic", label: "ஆண் — Energetic" },
  { value: "Male — Heroic/Firm", label: "ஆண் — Heroic/Firm" },
  { value: "Female — Bright", label: "பெண் — Bright" },
  { value: "Dramatic", label: "Dramatic" },
];

const channelOptions = [
  { value: "story", label: "Tamil Story (@biggbosstamil247)" },
  { value: "english", label: "English Stories" },
  { value: "food", label: "Food Business" },
  { value: "devotional", label: "Sivan Arul (Devotional)" },
  { value: "sanatana", label: "Sanatana Spirit (English)" },
  { value: "news", label: "Tamil Politics Star (News)" },
];

const statusLabels: Record<string, string> = {
  generating: "📝 Script எழுதப்படுகிறது...",
  writing_scenes: "🎬 Scene breakdown + image prompts உருவாக்கப்படுகிறது...",
  generating_audio: "🎙️ Gemini TTS narration உருவாக்கப்படுகிறது...",
  script_ready: "✅ Script + Audio + Media தயார்!",
  fetching_media: "🎬 Copyright-free stock media (Pexels/Pixabay) fetch ஆகிறது...",
  rendering: "🎞️ Video render ஆகிறது...",
  rendered: "✅ Video ரெடி!",
  uploaded: "🚀 YouTube-க்கு upload ஆயிற்று!",
  failed: "❌ தோல்வி",
};

const box: React.CSSProperties = { background: "#1a1a2e", borderRadius: 12, padding: 20, marginBottom: 20, border: "1px solid #2d2d44" };
const label: React.CSSProperties = { display: "block", marginBottom: 6, color: "#a0a0c0", fontSize: 14 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #3a3a5a", background: "#0f0f1e", color: "#fff", fontSize: 14, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#8b5cf6,#ec4899)", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 };
const btnDisabled: React.CSSProperties = { ...btn, background: "#3a3a5a", cursor: "not-allowed" };

export default function StoryToVideoPage() {
  const [story, setStory] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [voice, setVoice] = useState("Female — Warm");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [bgm, setBgm] = useState(true);
  const [animate, setAnimate] = useState(true);
  const [language, setLanguage] = useState<"ta" | "en">("ta");
  const [ttsMode, setTtsMode] = useState<"free" | "paid">("free");
  const [mediaSource, setMediaSource] = useState<"stock" | "ai">("stock");
  const [localize, setLocalize] = useState(false);
  const [autoUpload, setAutoUpload] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [recentProjects, setRecentProjects] = useState<{ id: number; status: string; storyPreview: string; language: string; createdAt: string; hasVideo: boolean }[]>([]);
  const [project, setProject] = useState<ProjectStatus | null>(null);
  const [rendering, setRendering] = useState(false);
  const [seoBusy, setSeoBusy] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbPrompt, setThumbPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [channel, setChannel] = useState("story");
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("public");
  const [uploading, setUploading] = useState(false);
  const [channelStatus, setChannelStatus] = useState<{ connected: boolean; channel?: { id: string; title: string }; matchesExpected?: boolean } | null>(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [fbPages, setFbPages] = useState<{ id: string; name: string }[]>([]);
  const [fbPageId, setFbPageId] = useState("");
  const [fbConnected, setFbConnected] = useState(false);
  const [fbBusy, setFbBusy] = useState(false);
  const [fbUploading, setFbUploading] = useState(false);
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [pastedImagePreview, setPastedImagePreview] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Paste an image directly into the story textarea (Ctrl+V) — Gemini vision
  // looks at it and writes a story-starter description, inserted into the box.
  const handleStoryPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return; // normal text paste — let the browser handle it as usual
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;

    setPastedImagePreview(URL.createObjectURL(file));
    setImageAnalyzing(true);
    setMessage("");
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] || "";
      const res = await fetch("/api/sivan-arul/story-to-video/describe-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, data: base64, language }),
      });
      const data = await res.json();
      if (data.success) {
        setStory((prev) => (prev.trim() ? `${prev.trim()}\n\n${data.description}` : data.description));
        setMessage("✅ Image-ஐ Gemini பார்த்து, அதற்கான கதை உரை story box-ல் சேர்க்கப்பட்டது.");
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ Image analysis தோல்வி — மீண்டும் முயற்சிக்கவும்");
    } finally {
      setImageAnalyzing(false);
    }
  };

  // Reset everything to start a fresh story — also strips ?project= from the
  // URL so the "load from URL" effect below doesn't immediately re-hydrate it.
  const createNewVideo = () => {
    const params = new URLSearchParams(window.location.search);
    params.delete("project");
    const qs = params.toString();
    window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);

    setProjectId(null);
    setProject(null);
    setStory("");
    setTitle("");
    setDescription("");
    setTags("");
    setThumbPrompt("");
    setPastedImagePreview(null);
    setImageAnalyzing(false);
    setMessage("");
    setChannelStatus(null);
  };

  const fetchProject = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/${id}?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setProject(data);
      if (data.seoTitle) setTitle(data.seoTitle);
      if (data.seoDescription) setDescription(data.seoDescription);
      if (data.seoTags?.length) setTags(data.seoTags.join(", "));
      if (data.thumbnailPrompt) setThumbPrompt(data.thumbnailPrompt);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existing = params.get("project");
    if (existing && !projectId) setProjectId(Number(existing));
    // Deep-link from the dashboard's "Start new video" button on a channel card.
    const channelParam = params.get("channel");
    if (channelParam && !existing) setChannel(channelParam);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("project") !== String(projectId)) {
      params.set("project", String(projectId));
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    }
    fetchProject(projectId);
    const interval = setInterval(() => fetchProject(projectId), 3000);
    return () => clearInterval(interval);
  }, [projectId, fetchProject]);

  // "Recent Projects" list — lets the user jump back into any in-flight or
  // finished project (e.g. one still generating in the background after they
  // started a second one) without needing to remember its id. Only relevant on
  // the fresh create-form view; polls lightly so statuses stay live there too.
  const fetchRecentProjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/list?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setRecentProjects(data.projects || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (projectId) return;
    fetchRecentProjects();
    const interval = setInterval(fetchRecentProjects, 5000);
    return () => clearInterval(interval);
  }, [projectId, fetchRecentProjects]);

  // Default the upload channel to the English-stories channel for English projects.
  useEffect(() => {
    if (project?.language === "en") setChannel("english");
  }, [project?.language]);

  const submitStory = async () => {
    if (story.trim().length < 20) { setMessage("❌ குறைந்தது 20 எழுத்துகள் கொண்ட கதையை பேஸ்ட் செய்யவும்"); return; }
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch("/api/sivan-arul/story-to-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story, durationSeconds: durationMinutes * 60, voice, aspectRatio, bgm, animate, language, ttsMode, mediaSource, localize, channel }),
      });
      const data = await res.json();
      if (data.success) {
        setProjectId(data.projectId);
        setMessage("✅ Generation தொடங்கியது...");
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ Request தோல்வி");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadImage = async (sceneIndex: number, file: File) => {
    if (!projectId) return;
    const formData = new FormData();
    formData.append(`scene_${sceneIndex}`, file);
    await fetch(`/api/sivan-arul/story-to-video/${projectId}/images`, { method: "POST", body: formData });
    fetchProject(projectId);
  };

  const uploadBatch = async (files: FileList) => {
    if (!projectId) return;
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("batch", file));
    await fetch(`/api/sivan-arul/story-to-video/${projectId}/images`, { method: "POST", body: formData });
    fetchProject(projectId);
  };

  const renderVideoNow = async () => {
    if (!projectId) return;
    setRendering(true);
    setMessage("");
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/${projectId}/render`, { method: "POST" });
      const data = await res.json();
      if (!data.success) setMessage(`❌ ${data.error}`);
    } catch {
      setMessage("❌ Render தொடங்க முடியவில்லை");
    } finally {
      setRendering(false);
    }
  };

  const generateSeo = async () => {
    if (!projectId) return;
    setSeoBusy(true);
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/${projectId}/seo`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTitle(data.title);
        setDescription(data.description);
        setTags(data.tags.join(", "));
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ SEO generation தோல்வி");
    } finally {
      setSeoBusy(false);
    }
  };

  const generateThumbPrompt = async () => {
    if (!projectId) return;
    setThumbBusy(true);
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/${projectId}/thumbnail`, { method: "POST" });
      const data = await res.json();
      if (data.success) setThumbPrompt(data.thumbnailPrompt);
      else setMessage(`❌ ${data.error}`);
    } catch {
      setMessage("❌ Thumbnail prompt generation தோல்வி");
    } finally {
      setThumbBusy(false);
    }
  };

  const channelReqRef = useRef("");
  const refreshChannelStatus = useCallback(async (ch: string) => {
    channelReqRef.current = ch;
    try {
      const res = await fetch(`/api/sivan-arul/youtube/manage?channel=${ch}&t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (channelReqRef.current === ch) setChannelStatus(data); // ignore stale (out-of-order) responses
    } catch {
      if (channelReqRef.current === ch) setChannelStatus(null);
    }
  }, []);

  useEffect(() => { if (channel) refreshChannelStatus(channel); }, [channel, refreshChannelStatus]);

  const connectChannel = () => {
    // Open the OAuth flow in a real popup window so Google shows the account +
    // brand-channel picker (pick the exact channel), then poll for the result.
    window.open(`/api/sivan-arul/youtube/auth?channel=${channel}`, "_blank", "width=560,height=720");
    setMessage("🔗 OAuth window திறந்தது — account → correct channel → Allow. முடிந்ததும் status தானாக update ஆகும்.");
    let n = 0;
    const iv = setInterval(() => { n += 1; refreshChannelStatus(channel); if (n > 20) clearInterval(iv); }, 3000);
  };

  const disconnectChannel = async () => {
    setChannelBusy(true);
    try {
      await fetch(`/api/sivan-arul/youtube/manage?channel=${channel}`, { method: "DELETE" });
      await refreshChannelStatus(channel);
      setMessage("🔌 Channel disconnect ஆயிற்று (Google-லும் revoke) — இப்போது Connect செய்தால் fresh channel picker வரும்.");
    } finally {
      setChannelBusy(false);
    }
  };

  const refreshFacebookStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/sivan-arul/facebook/manage?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      setFbConnected(Boolean(data.connected));
      setFbPages(data.pages || []);
      setFbPageId((prev) => prev || (data.pages?.[0]?.id ?? ""));
    } catch {
      setFbConnected(false);
      setFbPages([]);
    }
  }, []);

  useEffect(() => { refreshFacebookStatus(); }, [refreshFacebookStatus]);

  const connectFacebook = () => {
    window.open("/api/sivan-arul/facebook/auth", "_blank", "width=560,height=720");
    setMessage("🔗 Facebook OAuth window திறந்தது — login → Page-ஐத் தேர்ந்தெடுத்து Allow செய்யவும். முடிந்ததும் status தானாக update ஆகும்.");
    let n = 0;
    const iv = setInterval(() => { n += 1; refreshFacebookStatus(); if (n > 20) clearInterval(iv); }, 3000);
  };

  const disconnectFacebookAccount = async () => {
    setFbBusy(true);
    try {
      await fetch("/api/sivan-arul/facebook/manage", { method: "DELETE" });
      await refreshFacebookStatus();
      setMessage("🔌 Facebook disconnect ஆயிற்று.");
    } finally {
      setFbBusy(false);
    }
  };

  const uploadToFacebookVideo = async () => {
    if (!projectId || !fbPageId) return;
    setFbUploading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/${projectId}/upload-facebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: fbPageId, title, description }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ Facebook Upload வெற்றி! ${data.url}`);
        fetchProject(projectId);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ Facebook Upload தோல்வி");
    } finally {
      setFbUploading(false);
    }
  };

  // overrides lets the auto-upload flow pass freshly-generated SEO text directly
  // instead of reading React state (which wouldn't be updated yet in the same tick).
  const uploadToYoutube = async (overrides?: { title?: string; description?: string; tags?: string }) => {
    if (!projectId) return;
    setUploading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/sivan-arul/story-to-video/${projectId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          title: overrides?.title ?? title,
          description: overrides?.description ?? description,
          tags: (overrides?.tags ?? tags).split(",").map((t) => t.trim()).filter(Boolean),
          privacyStatus: privacy,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ Upload வெற்றி! ${data.url}`);
        fetchProject(projectId);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ Upload தோல்வி");
    } finally {
      setUploading(false);
    }
  };

  const allImagesUploaded = project?.uploadedImages?.length ? project.uploadedImages.every(Boolean) : false;
  const scriptReady = project && ["script_ready", "generating_images", "rendering", "rendered", "uploaded"].includes(project.status);
  const videoReady = project && ["rendered", "uploaded"].includes(project.status);

  // Auto-render: no button click needed — the instant every scene has its media
  // (stock-fetched or manually topped-up), render starts by itself. The ref guard
  // stops it firing again on every 3s poll while status is still "script_ready".
  const autoRenderFiredRef = useRef<number | null>(null);
  useEffect(() => {
    if (!project || !allImagesUploaded) return;
    if (project.status !== "script_ready") return;
    if (autoRenderFiredRef.current === project.id) return;
    autoRenderFiredRef.current = project.id;
    renderVideoNow();
  }, [project, allImagesUploaded]);

  // Auto-upload: only when the "Auto Upload" checkbox was on when the story was
  // submitted. Once rendering finishes, generate SEO (if not already done) and
  // upload straight away — no confirmation clicks.
  const autoUploadFiredRef = useRef<number | null>(null);
  useEffect(() => {
    if (!project || !autoUpload) return;
    if (project.status !== "rendered" || project.youtubeUrl) return;
    if (autoUploadFiredRef.current === project.id) return;
    autoUploadFiredRef.current = project.id;
    (async () => {
      let seoTitle = title, seoDescription = description, seoTagsStr = tags;
      if (!seoTitle.trim()) {
        try {
          const res = await fetch(`/api/sivan-arul/story-to-video/${project.id}/seo`, { method: "POST" });
          const data = await res.json();
          if (data.success) {
            seoTitle = data.title; seoDescription = data.description; seoTagsStr = data.tags.join(", ");
            setTitle(seoTitle); setDescription(seoDescription); setTags(seoTagsStr);
          }
        } catch { /* upload still proceeds; backend falls back to a generic title */ }
      }
      await uploadToYoutube({ title: seoTitle, description: seoDescription, tags: seoTagsStr });
    })();
  }, [project, autoUpload]);

  // Shown both on the input form (so the channel is visible/changeable before
  // generating — important now that Auto Upload can fire without any clicks)
  // and again in the final upload section. Same state/handlers, one source of truth.
  const channelPickerBlock = (
    <div style={{ flex: "1 1 200px" }}>
      <label style={label}>YouTube Channel</label>
      <select value={channel} onChange={(e) => setChannel(e.target.value)} style={input}>
        {channelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div style={{ marginTop: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {channelStatus?.connected ? (
          <span style={{ color: channelStatus.matchesExpected === false ? "#ffb060" : "#8bff8b" }}>
            {channelStatus.matchesExpected === false ? "⚠️" : "✅"} {channelStatus.channel?.title}
            {channelStatus.matchesExpected === false ? " — wrong channel!" : ""}
          </span>
        ) : (
          <span style={{ color: "#ff9090" }}>⬜ Not connected</span>
        )}
        <button onClick={connectChannel} style={{ ...btn, padding: "5px 12px", fontSize: 12 }}>🔗 Connect</button>
        {channelStatus?.connected && (
          <button onClick={disconnectChannel} disabled={channelBusy} style={{ ...(channelBusy ? btnDisabled : btn), background: "#5a2a2a", padding: "5px 12px", fontSize: 12 }}>
            {channelBusy ? "..." : "🔌 Disconnect"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a14", color: "#e0e0f0", fontFamily: "system-ui, sans-serif", padding: "24px 16px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <Link href="/sivan-arul" style={{ color: "#a78bfa", textDecoration: "none", fontSize: 14 }}>← Sivan Arul Dashboard</Link>
        </div>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>📖 Story to Video</h1>
        <p style={{ color: "#a0a0c0", marginBottom: 24, fontSize: 14 }}>
          கதை/செய்தியை பேஸ்ட் செய்யுங்கள், duration + voice select செய்யுங்கள் — Gemini script, narration audio, copyright-free stock media தானாக தயார் செய்து வீடியோ ரெண்டர் செய்யும்.
        </p>

        {message && (
          <div style={{ ...box, position: "sticky", top: 8, zIndex: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.5)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: message.startsWith("❌") ? "#2d1a1a" : "#1a2d1e", borderColor: message.startsWith("❌") ? "#5a2a2a" : "#2a5a3a" }}>
            <span>{message}</span>
            <button onClick={() => setMessage("")} style={{ background: "transparent", border: "none", color: "#a0a0c0", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>
        )}

        {!projectId && (
          <div style={box}>
            <label style={label}>கதை / செய்தி (Story / News)</label>
            <textarea
              value={story}
              onChange={(e) => setStory(e.target.value)}
              onPaste={handleStoryPaste}
              rows={8}
              placeholder="இங்கே உங்கள் கதை அல்லது செய்தியை பேஸ்ட் செய்யுங்கள்... (ஒரு image-ஐயும் இங்கே Ctrl+V paste செய்யலாம் — Gemini அதைப் பார்த்து கதை உரை எழுதும்)"
              style={{ ...input, resize: "vertical", marginBottom: 8 }}
            />
            {(pastedImagePreview || imageAnalyzing) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: 8, background: "#0f0f1e", borderRadius: 8, border: "1px solid #3a3a5a" }}>
                {pastedImagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pastedImagePreview} alt="Pasted" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                )}
                <span style={{ fontSize: 12, color: "#c0c0d8" }}>
                  {imageAnalyzing ? "🖼️ Gemini image-ஐ பார்த்து கதை எழுதுகிறது..." : "🖼️ Image பார்க்கப்பட்டு, கதை உரை சேர்க்கப்பட்டது"}
                </span>
              </div>
            )}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 12, fontSize: 13, color: "#c0c0d8" }}>
              <input type="checkbox" checked={autoUpload} onChange={(e) => setAutoUpload(e.target.checked)} style={{ marginTop: 3 }} />
              <span>🚀 <b>Auto Upload</b> — media தயாரானதும் தானாகவே render ஆகும் (எப்போதும்); இது tick செய்திருந்தால், render முடிந்ததும் SEO தானாக generate ஆகி நேரடியாக YouTube-க்கு (தேர்ந்த channel/privacy-உடன்) upload ஆகிவிடும் — எந்த button-ஐயும் அழுத்த வேண்டாம்.</span>
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              {channelPickerBlock}
              <div style={{ flex: "1 1 200px" }}>
                <label style={label}>Privacy (upload செய்யும்போது)</label>
                <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} style={input}>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginBottom: 16, fontSize: 13, color: "#c0c0d8" }}>
              <input type="checkbox" checked={localize} onChange={(e) => setLocalize(e.target.checked)} style={{ marginTop: 3 }} />
              <span>🌏 <b>Localize to the selected language&apos;s culture</b> — names &amp; places adapt to the language (e.g. English story + Tamil → Tamil names, Tamil places, native Tamil story). Off = no changes at all — same-language story is used exactly as typed, a different-language story gets a literal translation only (no rewriting).</span>
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={label}>Duration (நிமிடங்கள்)</label>
                <input type="number" min={1} max={20} step={0.5} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} style={input} />
              </div>
              <div style={{ flex: "1 1 150px" }}>
                <label style={label}>Language</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value as "ta" | "en")} style={input}>
                  <option value="ta">தமிழ் (Tamil)</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={label}>Voice Style</label>
                <select value={voice} onChange={(e) => setVoice(e.target.value)} style={input}>
                  {voiceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={label}>Format</label>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as "16:9" | "9:16")} style={input}>
                  <option value="16:9">🖥️ Long — Landscape (16:9)</option>
                  <option value="9:16">📱 Short — Vertical (9:16, Shorts/Reels)</option>
                </select>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={label}>Narration TTS</label>
                <select value={ttsMode} onChange={(e) => setTtsMode(e.target.value as "free" | "paid")} style={input}>
                  <option value="paid">💎 Paid — Gemini TTS (best quality)</option>
                  <option value="free">🆓 Free — edge-tts (no cost)</option>
                </select>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label style={label}>Scene Media</label>
                <select value={mediaSource} onChange={(e) => setMediaSource(e.target.value as "stock" | "ai")} style={input}>
                  <option value="stock">🎬 Stock footage (Pexels/Pixabay, free)</option>
                  <option value="ai">🎨 AI Generated (Pollinations/Flux, free)</option>
                </select>
              </div>
              <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }}>
                <label style={{ ...label, marginBottom: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={bgm} onChange={(e) => setBgm(e.target.checked)} /> 🎵 Background music (soft)
                </label>
                <label style={{ ...label, marginBottom: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> 🎞️ Animate images (Ken Burns zoom/pan)
                </label>
              </div>
            </div>
            <button onClick={submitStory} disabled={submitting} style={submitting ? btnDisabled : btn}>
              {submitting ? "தொடங்குகிறது..." : "🚀 Generate Script + Audio + Prompts"}
            </button>
          </div>
        )}

        {!projectId && recentProjects.length > 0 && (
          <div style={box}>
            <label style={label}>📋 Recent Projects — ஒரு project-ஐ (இன்னும் process ஆகிக்கொண்டிருந்தாலும்) மீண்டும் திறக்க கீழே click செய்யவும்</label>
            <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {recentProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setProjectId(p.id)}
                  style={{ cursor: "pointer", background: "#0f0f1e", border: "1px solid #3a3a5a", borderRadius: 8, padding: 10 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a0a0c0", marginBottom: 4 }}>
                    <span>#{p.id} · {p.createdAt} · {p.language === "en" ? "English" : "தமிழ்"}</span>
                    <span>{statusLabels[p.status] || p.status}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#d0d0e0" }}>{p.storyPreview}{p.storyPreview.length >= 90 ? "…" : ""}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {project && (
          <>
            <div style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Project #{project.id}</strong>
                <span>{statusLabels[project.status] || project.status}</span>
              </div>
              {project.errorMessage && <div style={{ color: "#ff8080", marginTop: 8, fontSize: 13 }}>{project.errorMessage}</div>}
            </div>

            <div style={box}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#c0c0d8" }}>
                  🗣️ {project.language === "en" ? "English" : "தமிழ்"}
                  {project.localize ? " 🌏Localized" : ""}
                  {" · "}{project.mediaSource === "ai" ? "🎨 AI" : "🎬 Stock"}
                  {" · "}{project.ttsMode === "free" ? "🆓 Free TTS" : "💎 Paid TTS"}
                  {" · "}{project.aspectRatio === "9:16" ? "📱 Short 9:16" : "🖥️ Long 16:9"}
                  {" · "}🎵 BGM {project.bgmEnabled ? "On" : "Off"}
                  {" · "}🎞️ Animation {project.animateEnabled ? "On" : "Off"}
                </span>
                <strong style={{ fontSize: 15 }}>💰 API cost: ${project.apiCost.toFixed(4)}</strong>
              </div>
              {Object.keys(project.costBreakdown || {}).length > 0 && (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, fontSize: 12, color: "#9090b0" }}>
                  {Object.entries(project.costBreakdown).map(([step, amt]) => (
                    <span key={step}>{step}: ${Number(amt).toFixed(4)}</span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: "#707090" }}>
                Cost above = Gemini script + scenes + TTS + SEO.
              </div>
            </div>

            {scriptReady && project.script && (
              <div style={box}>
                <label style={label}>Narration Script ({project.script.length} characters, ~{Math.round(project.audioDuration || 0)}s)</label>
                <textarea readOnly value={project.script} rows={6} style={{ ...input, resize: "vertical", marginBottom: 12 }} />
                {project.hasAudio && (
                  <audio controls src={`/api/sivan-arul/story-to-video/${project.id}/audio`} style={{ width: "100%" }} />
                )}
              </div>
            )}

            {scriptReady && project.scenes.length > 0 && !allImagesUploaded && (
              <div style={box}>
                <label style={label}>Scene Media</label>
                <div style={{ marginBottom: 14, padding: 12, background: "#0f0f1e", borderRadius: 8, border: "1px solid #2d5a3a", fontSize: 12, color: "#a0a0c0" }}>
                  🎬 Copyright-free stock media (Pexels/Pixabay) — scene keywords வைத்து video/images தானாக fetch ஆகும். ஏதேனும் scene காலியாக இருந்தால் கீழே manual-ஆ upload செய்யலாம்.
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={label}>⚡ Bulk upload (காலியான scenes-ல் வரிசைப்படி நிரப்பும்)</label>
                  <input type="file" accept="image/*" multiple onChange={(e) => e.target.files && uploadBatch(e.target.files)} style={input} />
                </div>
                <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {project.scenes.map((scene, index) => (
                    <div key={index} style={{ background: "#0f0f1e", borderRadius: 8, padding: 12, border: project.uploadedImages[index] ? "1px solid #2a5a3a" : "1px solid #3a3a5a" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a0a0c0", marginBottom: 4 }}>
                        <span>Scene {index + 1} ({scene.seconds.toFixed(1)}s)</span>
                        <span>{project.uploadedImages[index] ? "✅ Uploaded" : "⬜ Pending"}</span>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 8, color: "#d0d0e0" }}>{scene.prompt}</div>
                      <input
                        ref={(el) => { fileInputRefs.current[index] = el; }}
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && uploadImage(index, e.target.files[0])}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scriptReady && !videoReady && (
              <div style={box}>
                <button onClick={renderVideoNow} disabled={!allImagesUploaded || rendering || project.status === "rendering"} style={(!allImagesUploaded || rendering || project.status === "rendering") ? btnDisabled : btn}>
                  {project.status === "rendering" ? "🎞️ Rendering..." : allImagesUploaded ? "🎬 Render Video" : `⬜ ${project.uploadedImages.filter(Boolean).length}/${project.scenes.length} படங்கள் upload செய்யவும்`}
                </button>
              </div>
            )}

            {videoReady && (
              <div style={box}>
                <label style={label}>Final Video</label>
                <video controls src={`/api/sivan-arul/story-to-video/${project.id}/video`} style={{ width: "100%", borderRadius: 8, marginBottom: 12 }} />
                <a href={`/api/sivan-arul/story-to-video/${project.id}/video?download=1`} style={{ color: "#a78bfa", fontSize: 13 }}>⬇️ Download</a>
              </div>
            )}

            {videoReady && (
              <div style={box}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <label style={{ ...label, marginBottom: 0 }}>YouTube Upload — SEO</label>
                  <button onClick={generateSeo} disabled={seoBusy} style={{ ...(seoBusy ? btnDisabled : btn), padding: "6px 14px", fontSize: 13 }}>
                    {seoBusy ? "..." : "✨ Generate SEO"}
                  </button>
                </div>
                <label style={label}>தலைப்பு (Title)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...input, marginBottom: 12 }} />
                <label style={label}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} style={{ ...input, resize: "vertical", marginBottom: 12 }} />
                <label style={label}>Tags (comma separated)</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} style={{ ...input, marginBottom: 16 }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ ...label, marginBottom: 0 }}>🖼️ Thumbnail image prompt</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {thumbPrompt && (
                      <button onClick={() => { navigator.clipboard?.writeText(thumbPrompt); setMessage("📋 Thumbnail prompt copy ஆயிற்று"); }} style={{ ...btn, background: "#2d2d44", padding: "6px 12px", fontSize: 13 }}>Copy</button>
                    )}
                    <button onClick={generateThumbPrompt} disabled={thumbBusy} style={{ ...(thumbBusy ? btnDisabled : btn), padding: "6px 14px", fontSize: 13 }}>
                      {thumbBusy ? "..." : "✨ Generate"}
                    </button>
                  </div>
                </div>
                <textarea
                  value={thumbPrompt}
                  onChange={(e) => setThumbPrompt(e.target.value)}
                  rows={4}
                  placeholder="'✨ Generate' அழுத்தினால், high-CTR thumbnail-க்கான English image prompt இங்கே வரும் — எந்த AI image tool-லும் (Nano Banana, Midjourney, etc.) paste செய்து thumbnail உருவாக்கவும்."
                  style={{ ...input, resize: "vertical", marginBottom: 16 }}
                />
                <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
                  {channelPickerBlock}
                  <div style={{ flex: "1 1 200px" }}>
                    <label style={label}>Privacy</label>
                    <select value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} style={input}>
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>
                {project.youtubeUrl ? (
                  <div style={{ color: "#8bff8b" }}>✅ Uploaded: <a href={project.youtubeUrl} target="_blank" style={{ color: "#a78bfa" }}>{project.youtubeUrl}</a></div>
                ) : (
                  <button onClick={() => uploadToYoutube()} disabled={uploading} style={uploading ? btnDisabled : btn}>
                    {uploading ? "Uploading..." : "🚀 Upload to YouTube"}
                  </button>
                )}
              </div>
            )}

            {videoReady && (
              <div style={box}>
                <label style={label}>📘 Facebook Page-க்கும் upload செய்யலாம் (அதே video)</label>
                <select value={fbPageId} onChange={(e) => setFbPageId(e.target.value)} style={{ ...input, marginBottom: 8 }}>
                  {fbPages.length === 0 && <option value="">— Page இல்லை, முதலில் Connect செய்யவும் —</option>}
                  {fbPages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12, fontSize: 12 }}>
                  {fbConnected ? (
                    <span style={{ color: "#8bff8b" }}>✅ Facebook connected ({fbPages.length} page{fbPages.length === 1 ? "" : "s"})</span>
                  ) : (
                    <span style={{ color: "#ff9090" }}>⬜ Facebook Not connected</span>
                  )}
                  <button onClick={connectFacebook} style={{ ...btn, padding: "5px 12px", fontSize: 12 }}>🔗 Connect</button>
                  {fbConnected && (
                    <button onClick={disconnectFacebookAccount} disabled={fbBusy} style={{ ...(fbBusy ? btnDisabled : btn), background: "#5a2a2a", padding: "5px 12px", fontSize: 12 }}>
                      {fbBusy ? "..." : "🔌 Disconnect"}
                    </button>
                  )}
                </div>
                {project.facebookUrl ? (
                  <div style={{ color: "#8bff8b" }}>✅ Uploaded: <a href={project.facebookUrl} target="_blank" style={{ color: "#a78bfa" }}>{project.facebookUrl}</a></div>
                ) : (
                  <button onClick={uploadToFacebookVideo} disabled={fbUploading || !fbPageId} style={(fbUploading || !fbPageId) ? btnDisabled : btn}>
                    {fbUploading ? "Uploading..." : "📘 Upload to Facebook"}
                  </button>
                )}
              </div>
            )}

            <div style={box}>
              <button onClick={createNewVideo} style={{ ...btn, background: "linear-gradient(135deg,#2d5a3a,#1a3a2a)", width: "100%" }}>
                ➕ Create New Video
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
