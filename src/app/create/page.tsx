"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { VideoStyleConfig } from "@/lib/config";
import { transitionPresets, recommendTransitions } from "@/../packages/transition-library/src";

const choices = {
  stance: ["ஆதரவு", "எதிர்ப்பு", "நடுநிலை", "விமர்சனம்", "பாராட்டு", "உண்மைச் சரிபார்ப்பு"],
  tone: ["இயல்பான", "நகைச்சுவை", "கிண்டல்", "உணர்ச்சிகரமான", "தீவிரமான", "ஊக்கமளிக்கும்"],
  persona: ["நண்பர்", "யூடியூபர்", "ஹீரோ", "வில்லன்", "சினிமா விவரிப்பாளர்", "செய்தி வாசிப்பாளர்"],
  voice: ["ஆண் — இயல்பான", "பெண் — இயல்பான", "ஆண் — ஆற்றலான", "பெண் — ஆற்றலான", "டிராமாட்டிக்"],
  duration: ["15 விநாடிகள்", "30 விநாடிகள்", "60 விநாடிகள்", "2 நிமிடங்கள்", "5 நிமிடங்கள்", "8 நிமிடங்கள்", "10 நிமிடங்கள்", "ஆட்டோ — voice முடியும் வரை"],
};

type ChoiceKey = keyof typeof choices;
const defaults: Record<ChoiceKey, string> = { stance: "நடுநிலை", tone: "இயல்பான", persona: "யூடியூபர்", voice: "பெண் — இயல்பான", duration: "60 விநாடிகள்" };

const sourceGridOptions = [
  { value: "youtube", label: "YouTube URL", icon: "▶", description: "YouTube வீடியோ இணைப்பைப் பயன்படுத்த" },
  { value: "local_folder", label: "Local Video Folder", icon: "📁", description: "உள்ளூர் கணினி வீடியோ கோப்புறையைப் பயன்படுத்த" },
  { value: "google_drive", label: "Google Drive", icon: "☁️", description: "Google Drive கோப்புகளை இணைக்க", disabled: true },
  { value: "phone_gallery", label: "Phone Gallery", icon: "📱", description: "கைபேசி கேலரி வீடியோக்களை இணைக்க", disabled: true },
  { value: "news", label: "News URL", icon: "📰", description: "செய்தி கட்டுரையின் URL-ஐப் பயன்படுத்த" },
  { value: "text", label: "Voice Script / Text", icon: "✍️", description: "சொந்த உரை அல்லது ஸ்கிரிப்டை எழுத" },
  { value: "voiceover", label: "Uploaded Voice-over", icon: "🎙️", description: "பதிவு செய்யப்பட்ட ஆடியோ கோப்பைப் பயன்படுத்த" },
];

const outputLanguageOptions = [
  { value: "ta", label: "தமிழ்" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

type StockResult = { provider: string; kind?: "video" | "image"; id: string; url: string; previewUrl?: string; width: number; height: number; attribution?: string };
type Clip = { index: number; url: string; kind: "video" | "image" };
type YoutubeStatus = { configured: boolean; connected: boolean; channel?: { id: string; title: string; thumbnail?: string; customUrl?: string } };

const privacyOptions = [
  { value: "private", label: "🔒 Private (நீங்கள் மட்டும்)" },
  { value: "unlisted", label: "🔗 Unlisted (link உள்ளவர்கள்)" },
  { value: "public", label: "🌍 Public (எல்லோரும்)" },
];

function ChoiceGroup({ label, name, value, onChange }: { label: string; name: ChoiceKey; value: string; onChange: (value: string) => void }) {
  return <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-200">{label}</legend><div className="flex flex-wrap gap-2">{choices[name].map((item) => <button key={item} type="button" onClick={() => onChange(item)} className={`choice ${value === item ? "choice-active" : ""}`}>{item}</button>)}</div></fieldset>;
}

function AssetPreview({ asset, className }: { asset: StockResult; className: string }) {
  // Local assets use an absolute file-system path that the browser can't load directly.
  // Proxy them through the backend media-proxy API so they stream correctly.
  function toProxied(raw: string | undefined) {
    if (!raw) return raw;
    // Detect Windows absolute path (C:\...) or Unix path that looks like /home/...
    const isLocal = /^[A-Za-z]:[/\\]/.test(raw) || (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("http"));
    if (isLocal) return `/api/media-proxy?path=${encodeURIComponent(raw)}`;
    return raw;
  }
  if (asset.kind === "image") return <img className={className} src={toProxied(asset.previewUrl || asset.url)} alt={asset.attribution || "stock image"} loading="lazy" />;
  return <video className={className} src={toProxied(asset.url)} muted loop playsInline preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />;
}

export default function Home() {
  const [form, setForm] = useState({ url: "", sourceType: "youtube", scriptMode: "as-is", sourceText: "", startTime: "00:00", endTime: "01:00", ttsProvider: "local", format: "9:16", customInstruction: "", outputLanguage: "ta", stockKeywords: "", allowGeminiKeywords: false, tier: "free", videoStyle: "documentary", ctaEnabled: false, ctaPosition: "end", localFolderId: "", bRollSource: "stock", isReaction: false, reactionLayout: "pause-and-explain", splitShortsEnabled: false, autoApprove: false, autoApprovePrivacy: "private", ...defaults });
  const [styles, setStyles] = useState<VideoStyleConfig[]>([]);
  const activeStyle = useMemo(() => styles.find((s) => s.id === form.videoStyle), [styles, form.videoStyle]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const audioFileInput = useRef<HTMLInputElement>(null);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "queued" | "error" | "awaiting_script_approval" | "awaiting_scenes_approval" | "complete">("idle");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [videoVersion, setVideoVersion] = useState(0);
  const [editableScript, setEditableScript] = useState("");
  const [scenes, setScenes] = useState<any[]>([]);
  const [submittingScript, setSubmittingScript] = useState(false);
  const [submittingScenes, setSubmittingScenes] = useState(false);

  // API Cost Monitor State
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [actualCost, setActualCost] = useState<number | null>(null);
  const [costBreakdown, setCostBreakdown] = useState<Record<string, number>>({});
  const [liveEstimate, setLiveEstimate] = useState<{ estimatedCost: number; breakdown: { script: number; metadata: number; tts: number; keywords: number } } | null>(null);

  // Thumbnail generation states
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [thumbnailPath, setThumbnailPath] = useState("");
  const [generatingThumbnail, setGeneratingThumbnail] = useState(false);
  const [thumbnailCost, setThumbnailCost] = useState(0);

  // Sliding History Drawer State
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyProjects, setHistoryProjects] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Local Video Folders State
  const [folders, setFolders] = useState<any[]>([]);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);

  // AI Transition Recommendation Engine UI State
  const [renderingPreviewIndex, setRenderingPreviewIndex] = useState<number | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [transitionFilterQuery, setTransitionFilterQuery] = useState("");
  const [transitionCategory, setTransitionCategory] = useState<string>("all");

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      const list = data.folders || [];
      setFolders(list);
      if (list.length > 0) {
        setForm((current) => {
          if (!current.localFolderId) {
            return { ...current, localFolderId: String(list[0].id), bRollSource: current.bRollSource === "stock" ? "personal" : current.bRollSource };
          }
          return current;
        });
      }
    } catch {}
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/projects");
      const data = await response.json();
      setHistoryProjects(data.projects || []);
    } catch {
      setHistoryProjects([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);




  useEffect(() => {
    let active = true;
    const fetchEstimate = async () => {
      try {
        const response = await fetch("/api/projects/estimate-cost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType: form.sourceType,
            sourceText: form.sourceText,
            duration: form.duration,
            ttsProvider: form.ttsProvider,
            tier: form.tier,
            allowGeminiKeywords: form.allowGeminiKeywords
          })
        });
        const data = await response.json();
        if (active) {
          setLiveEstimate(data);
        }
      } catch {}
    };

    const timer = setTimeout(() => {
      fetchEstimate();
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [form.sourceType, form.sourceText, form.duration, form.ttsProvider, form.tier, form.allowGeminiKeywords]);
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
  const [ytStatus, setYtStatus] = useState<YoutubeStatus | null>(null);
  const [ytTitle, setYtTitle] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [ytPrivacy, setYtPrivacy] = useState("private");
  const [ytTags, setYtTags] = useState<string[]>([]);
  const [ytUploading, setYtUploading] = useState(false);
  const [ytResult, setYtResult] = useState<{ url: string; privacyStatus: string; thumbnail?: string } | null>(null);
  const [hasThumb, setHasThumb] = useState(false);
  const [thumbVersion, setThumbVersion] = useState(0);
  const [thumbBusy, setThumbBusy] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);
  const previewClass = useMemo(() => form.format === "9:16" ? "aspect-[9/16] max-h-[540px]" : "aspect-video", [form.format]);
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setTier = (tier: "free" | "premium") => setForm((current) => ({ ...current, tier, ttsProvider: tier === "free" ? "local" : current.ttsProvider, scriptMode: tier === "free" ? "as-is" : current.scriptMode, allowGeminiKeywords: tier === "free" ? false : current.allowGeminiKeywords }));
  const videoUrl = projectId ? `/api/projects/${projectId}/video${videoVersion ? `?v=${videoVersion}` : ""}` : "";
  const currentClip = editingClip !== null ? clips.find((clip) => clip.index === editingClip) : undefined;
  const sceneCount = audioDurationSeconds ? Math.max(1, Math.ceil((audioDurationSeconds + 2) / 3)) : null;
  // Proxy local absolute file-system paths through the backend so the browser can load them
  const toProxyUrl = (raw: string | undefined): string | undefined => {
    if (!raw) return raw;
    const isLocal = /^[A-Za-z]:[/\\]/.test(raw) || (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("http"));
    return isLocal ? `/api/media-proxy?path=${encodeURIComponent(raw)}` : raw;
  };

  function handleImagePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            if (typeof event.target?.result === "string") {
              setSourceImage(event.target.result);
            }
          };
          reader.readAsDataURL(file);
          e.preventDefault();
        }
      }
    }
  }

  function pickAudioFile(file: File) {
    setAudioFile(file);
    setAudioDurationSeconds(null);
    const url = URL.createObjectURL(file);
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => { setAudioDurationSeconds(probe.duration); URL.revokeObjectURL(url); };
    probe.onerror = () => URL.revokeObjectURL(url);
    probe.src = url;
  }

  const loadClips = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/projects/${id}/clips`);
      const data = await response.json();
      setClips(data.clips || []);
    } catch { setClips([]); }
    try {
      const response = await fetch(`/api/projects/${id}/suggestions`);
      const data = await response.json();
      setSuggestions(data.results || []);
      if (data.title) setYtTitle(data.title);
      if (data.tags) setYtTags(data.tags);
      if (data.script) {
        const hashTags = Array.isArray(data.tags) && data.tags.length > 0
          ? data.tags.slice(0, 3).map((t: string) => `#${t.replace(/\s+/g, "")}`).join(" ")
          : "#TamilAI #VideoReview #AIShorts";
        const tagsList = Array.isArray(data.tags) && data.tags.length > 0
          ? `\n\n🏷️ Keywords:\n${data.tags.join(", ")}`
          : "";
        const seoDesc = `${data.title || "AI Video"}\n\n📖 Script:\n${data.script}${tagsList}\n\n${hashTags}\n\nGenerated by Video Review Studio AI 🎥`;
        setYtDescription(seoDesc);
      }
    } catch { setSuggestions([]); }
    try {
      const response = await fetch(`/api/projects/${id}/thumbnail`, { method: "HEAD" });
      setHasThumb(response.ok); setThumbVersion(Date.now());
    } catch { setHasThumb(false); }
  }, []);

  const loadYtStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/youtube/status");
      setYtStatus(await response.json());
    } catch { setYtStatus(null); }
  }, []);

  const refreshCost = useCallback(async (targetId: number) => {
    try {
      const response = await fetch("/api/projects");
      const data = await response.json();
      const p = (data.projects || []).find((p: any) => p.id === targetId);
      if (p) {
        setEstimatedCost(p.estimated_cost || 0);
        setActualCost(p.actual_cost || 0);
        let breakdown = {};
        if (p.cost_breakdown) {
          try { breakdown = JSON.parse(p.cost_breakdown); } catch {}
        }
        setCostBreakdown(breakdown);
      }
    } catch {}
  }, []);

  const loadProjectIntoWorkspace = useCallback(async (id: number) => {
    try {
      const response = await fetch("/api/projects");
      const data = await response.json();
      const project = (data.projects || []).find((p: any) => p.id === id);
      if (!project) return;

      setIsHistoryOpen(false);
      setProjectId(project.id);
      refreshCost(project.id);
      const currentStatus = project.status;

      // Update form parameters from project row if present
      setForm((curr) => ({
        ...curr,
        format: project.aspect_ratio || "9:16",
        tier: project.tier || "free",
        videoStyle: project.video_style || "documentary",
        sourceType: project.source_type || "text",
        ctaEnabled: Boolean(project.cta_enabled),
        ctaPosition: project.cta_position || "end",
        splitShortsEnabled: Boolean(project.split_shorts_enabled),
      }));

      if (currentStatus === "awaiting_script_approval") {
        setStatus("awaiting_script_approval");
        setEditableScript(project.review_script || project.transcript || "");
        setThumbnailPrompt(project.thumbnail_prompt || "");
        setThumbnailPath(project.thumbnail_path || "");
        setMessage(`திட்டம் #${project.id} ஸ்கிரிப்ட் ஒப்புதலுக்காக காத்திருக்கிறது.`);
      } else if (currentStatus === "awaiting_scenes_approval") {
        setStatus("awaiting_scenes_approval");
        setMessage(`திட்டம் #${project.id} சீன்கள் ஒப்புதலுக்காக காத்திருக்கிறது.`);
        const scenesRes = await fetch(`/api/projects/${project.id}/scenes`);
        const scenesData = await scenesRes.json();
        setScenes(scenesData.scenes || []);
      } else if (currentStatus === "complete") {
        setStatus("complete");
        setMessage(`திட்டம் #${project.id} பார்க்கத் தயாராக உள்ளது.`);
        loadClips(project.id);
      } else if (currentStatus === "failed") {
        setStatus("error");
        setMessage(project.error_message || "Processing தோல்வியடைந்தது");
      } else {
        setStatus("queued");
        setMessage(`திட்டம் #${project.id} தயாராகிறது... தற்போதைய நிலை: ${currentStatus}`);
      }
    } catch (err) {
      setMessage("திட்டத்தை லோட் செய்வதில் பிழை ஏற்பட்டது.");
    }
  }, [loadClips, refreshCost]);

  // Auto-fill thumbnail prompt if empty when project loading completes
  useEffect(() => {
    if (projectId && !thumbnailPrompt && ytTitle) {
      setThumbnailPrompt(`High contrast YouTube thumbnail for "${ytTitle}", eye-catching visual, realistic style, highly engaging, clean background, 4k`);
    }
  }, [projectId, ytTitle, thumbnailPrompt]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get("yt");
    const styleParam = params.get("style");
    const isNewRequest = !!styleParam;

    fetch("/api/projects").then((response) => response.json()).then((data) => {
      const projects = data.projects || [];
      if (projects.length > 0 && !isNewRequest) {
        const latest = projects[0];
        setProjectId(latest.id);
        refreshCost(latest.id);
        const currentStatus = latest.status;
        
        if (currentStatus === "awaiting_script_approval") {
          setStatus("awaiting_script_approval");
          setEditableScript(latest.review_script || latest.transcript || "");
          setThumbnailPrompt(latest.thumbnail_prompt || "");
          setThumbnailPath(latest.thumbnail_path || "");
          setMessage(`திட்டம் #${latest.id} ஸ்கிரிப்ட் ஒப்புதலுக்காக காத்திருக்கிறது.`);
        } else if (currentStatus === "awaiting_scenes_approval") {
          setStatus("awaiting_scenes_approval");
          setMessage(`திட்டம் #${latest.id} சீன்கள் ஒப்புதலுக்காக காத்திருக்கிறது.`);
          fetch(`/api/projects/${latest.id}/scenes`)
            .then((r) => r.json())
            .then((d) => setScenes(d.scenes || []))
            .catch(() => undefined);
        } else if (currentStatus === "complete") {
          setStatus("complete");
          setMessage(`கடைசியாக உருவாக்கிய திட்டம் #${latest.id} பார்க்கத் தயாராக உள்ளது.`);
          loadClips(latest.id);
        } else if (currentStatus === "failed") {
          setStatus("error");
          setMessage(latest.error_message || "Processing தோல்வியடைந்தது");
        } else {
          setStatus("queued");
          setMessage(`திட்டம் #${latest.id} தயாராகிறது... தற்போதைய நிலை: ${currentStatus}`);
        }
      }
    }).catch(() => undefined);
    fetch("/api/youtube/status").then((response) => response.json()).then(setYtStatus).catch(() => setYtStatus(null));
    fetch("/api/styles").then((r) => r.json()).then((d) => setStyles(d.styles || [])).catch(() => undefined);

    if (styleParam) {
      Promise.resolve().then(() => setForm((current) => ({ ...current, videoStyle: styleParam })));
    }
    if (oauthResult === "connected" || oauthResult === "error") {
      Promise.resolve().then(() => setMessage(oauthResult === "connected" ? "YouTube channel இணைக்கப்பட்டது ✅" : "YouTube இணைப்பு தோல்வியடைந்தது — மீண்டும் முயற்சிக்கவும்."));
      window.history.replaceState(null, "", `/create?style=${styleParam || "documentary"}`);
    } else if (styleParam) {
      window.history.replaceState(null, "", `/create?style=${styleParam}`);
    }
  }, [loadClips]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    const checkScanning = () => {
      const hasScanning = folders.some(f => f.scan_status === "scanning" || f.scan_status === "queued");
      if (hasScanning) {
        timer = setTimeout(async () => {
          await loadFolders();
        }, 3000);
      }
    };
    checkScanning();
    return () => clearTimeout(timer);
  }, [folders, loadFolders]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("saving"); setMessage(""); setProjectId(null); setClips([]); setEditingClip(null); setPendingRender(false); setSuggestions([]); setYtResult(null); setYtTitle(""); setYtDescription(""); setScenes([]);
    try {
      if (form.isReaction) {
        if (!form.url) throw new Error("YouTube URL-ஐ உள்ளிடவும்");
        const response = await fetch("/api/projects/reaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            youtubeUrl: form.url,
            layout: form.reactionLayout,
            outputLanguage: form.outputLanguage,
            voice: form.voice,
            tone: form.tone,
            persona: form.persona,
            aspectRatio: form.format,
            videoStyle: form.videoStyle
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Reaction project-ஐ உருவாக்க முடியவில்லை");
        
        setStatus("queued");
        setMessage("Reaction வீடியோ பதிவிறக்கப்படுகிறது (downloading)...");
        
        // Start status polling loop
        const pollId = result.id || result.projectId;
        const timer = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/projects/${pollId}/status`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            
            if (statusData.status === "complete") {
              clearInterval(timer);
              setProjectId(pollId);
              setStatus("complete");
              setMessage("விமர்சன வீடியோ வெற்றிகரமாக உருவாக்கப்பட்டது!");
              setVideoVersion(Date.now());
              loadClips(pollId);
              refreshCost(pollId);
            } else if (statusData.status === "failed") {
              clearInterval(timer);
              setStatus("error");
              setMessage(`உருவாக்கம் தோல்வியடைந்தது: ${statusData.errorMessage || "தெரியாத பிழை"}`);
            } else if (statusData.status === "awaiting_script_approval") {
              clearInterval(timer);
              setProjectId(pollId);
              setStatus("awaiting_script_approval");
              setEditableScript(statusData.reviewScript || "[]");
              setThumbnailPrompt(statusData.thumbnailPrompt || "");
              setThumbnailPath(statusData.thumbnailPath || "");
              setMessage("ஸ்குரிப்ட் தயாராக உள்ளது! சரிபார்த்து ஒப்புதல் அளிக்கவும்.");
              refreshCost(pollId);
            } else {
              let dispStatus = statusData.status;
              if (dispStatus === "downloading") dispStatus = "பதிவிறக்கப்படுகிறது (downloading)";
              setMessage(`Reaction வீடியோ உருவாகிறது: ${dispStatus}...`);
            }
          } catch {
            // ignore network failure
          }
        }, 3000);
        return;
      }

      let response: Response;
      if (form.sourceType === "voiceover") {
        if (!audioFile) throw new Error("Voice-over audio file-ஐ upload செய்யவும்");
        const body = new FormData();
        body.append("sourceType", "voiceover");
        body.append("sourceText", form.sourceText);
        body.append("format", form.format);
        body.append("outputLanguage", form.outputLanguage);
        body.append("stockKeywords", form.stockKeywords);
        body.append("allowGeminiKeywords", String(form.allowGeminiKeywords));
        body.append("tier", form.tier);
        body.append("videoStyle", form.videoStyle);
        body.append("ctaEnabled", String(form.ctaEnabled));
        body.append("ctaPosition", form.ctaPosition);
        body.append("autoApprove", String(form.autoApprove));
        if (form.localFolderId) body.append("localFolderId", String(form.localFolderId));
        if (form.bRollSource) body.append("bRollSource", form.bRollSource);
        body.append("audio", audioFile);
        response = await fetch("/api/projects", { method: "POST", body });
      } else {
        response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            sourceImage,
            hasImage: !!sourceImage
          })
        });
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "திட்டத்தை உருவாக்க முடியவில்லை");
      const sourceNote = form.sourceType === "news" ? "News article படிக்கப்பட்டு" : form.sourceType === "text" ? "உரை எடுக்கப்பட்டு" : form.sourceType === "voiceover" ? "Voice-over audio பயன்படுத்தப்பட்டு" : "Transcript எடுக்கப்பட்டு";
      setStatus("queued"); setMessage(`திட்டம் #${result.id} உருவாக்கப்பட்டது. ${sourceNote} video தயாராகிறது...`);
      const processResponse = await fetch(`/api/projects/${result.id}/process`, { method: "POST" });
      const processed = await processResponse.json();
      if (!processResponse.ok) throw new Error(processed.error || "Processing தோல்வியடைந்தது");
      setProjectId(result.id);
      refreshCost(result.id);
      
      if (processed.status === "awaiting_script_approval") {
        setStatus("awaiting_script_approval");
        setEditableScript(processed.script || "");
        setMessage("ஸ்குரிப்ட் தயாராக உள்ளது! சரிபார்த்து ஒப்புதல் அளிக்கவும்.");
      } else if (processed.status === "awaiting_scenes_approval") {
        setStatus("awaiting_scenes_approval");
        setScenes(processed.scenes || []);
        setMessage("சீன்கள் தயாராக உள்ளன! சரிபார்த்து ஒப்புதல் அளிக்கவும்.");
      } else if (processed.status === "complete") {
        setStatus("complete");
        setVideoVersion(Date.now());
        loadClips(result.id);
        if (form.autoApprove) {
          setMessage(`திட்டம் #${result.id} முழுமையாக தயாராகிவிட்டது. YouTube-க்கு தானாக upload ஆகிறது...`);
          await autoUploadToYoutube(result.id);
        } else {
          setMessage(`திட்டம் #${result.id} முழுமையாக தயாராகிவிட்டது. ${processed.assetCount} stock clips பயன்படுத்தப்பட்டன.`);
        }
      }
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "எதிர்பாராத பிழை"); }
  }

  async function autoUploadToYoutube(id: number) {
    try {
      const suggestionsRes = await fetch(`/api/projects/${id}/suggestions`);
      const data = await suggestionsRes.json();
      const title = String(data.title || "AI Video").slice(0, 100);
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const hashTags = tags.length > 0
        ? tags.slice(0, 3).map((t: string) => `#${t.replace(/\s+/g, "")}`).join(" ")
        : "#TamilAI #VideoReview #AIShorts";
      const tagsList = tags.length > 0 ? `\n\n🏷️ Keywords:\n${tags.join(", ")}` : "";
      const description = `${title}\n\n📖 Script:\n${data.script || ""}${tagsList}\n\n${hashTags}\n\nGenerated by Video Review Studio AI 🎥`;
      setYtTitle(title); setYtDescription(description); setYtTags(tags);

      const response = await fetch(`/api/projects/${id}/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, privacy: form.autoApprovePrivacy, tags })
      });
      const uploadData = await response.json();
      if (!response.ok) throw new Error(uploadData.error || "YouTube upload தோல்வியடைந்தது");
      setYtResult(uploadData);
      setMessage(`திட்டம் #${id} முழுமையாக தானியங்கியாக உருவாக்கப்பட்டு YouTube-ல் upload செய்யப்பட்டது ✅ (${uploadData.privacyStatus})`);
    } catch (error) {
      setMessage(`வீடியோ தயார், ஆனால் தானியங்கி YouTube upload தோல்வியடைந்தது: ${error instanceof Error ? error.message : "தெரியாத பிழை"}`);
    }
  }

  async function approveScript() {
    if (!projectId || !editableScript.trim()) return;
    setSubmittingScript(true);
    setMessage("ஸ்குரிப்ட் அங்கீகரிக்கப்படுகிறது... குரல் மற்றும் சீன்கள் தயாராகின்றன...");
    try {
      const response = await fetch(`/api/projects/${projectId}/approve-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: editableScript })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Script approval failed");

      if (result.status === "rendering") {
        setStatus("queued");
        setMessage("Reaction வீடியோ உருவாக்கப்படுகிறது...");
        
        const pollId = projectId;
        const timer = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/projects/${pollId}/status`);
            if (!statusRes.ok) return;
            const statusData = await statusRes.json();
            
            if (statusData.status === "complete") {
              clearInterval(timer);
              setProjectId(pollId);
              setStatus("complete");
              setMessage("விமர்சன வீடியோ வெற்றிகரமாக உருவாக்கப்பட்டது!");
              setVideoVersion(Date.now());
              loadClips(pollId);
              refreshCost(pollId);
            } else if (statusData.status === "failed") {
              clearInterval(timer);
              setStatus("error");
              setMessage(`உருவாக்கம் தோல்வியடைந்தது: ${statusData.errorMessage || "தெரியாத பிழை"}`);
            } else {
              setMessage(`Reaction வீடியோ உருவாகிறது: ${statusData.status}...`);
            }
          } catch {
            // ignore
          }
        }, 3000);
        return;
      }

      setScenes(result.scenes || []);
      refreshCost(projectId);
      setStatus("awaiting_scenes_approval");
      setMessage("சீன்கள் மற்றும் பரிந்துரைகள் தயாராக உள்ளன! திருத்தி ஒப்புதல் அளிக்கவும்.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Script ஒப்புதல் தோல்வியடைந்தது");
    } finally {
      setSubmittingScript(false);
    }
  }

  async function approveScenes() {
    if (!projectId || !scenes.length) return;
    setSubmittingScenes(true);
    setMessage("சீன்கள் அங்கீகரிக்கப்படுகின்றன... வீடியோ ரெண்டர் செய்யப்படுகிறது...");
    setStatus("queued");
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Scenes approval failed");

      setMessage(`வீடியோ தயாராகிவிட்டது! ${result.assetCount} கிளிப்புகள் பயன்படுத்தப்பட்டன.`);
      setProjectId(projectId);
      setVideoVersion(Date.now());
      refreshCost(projectId);
      setStatus("complete");
      loadClips(projectId);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "வீடியோ ரெண்டரிங் தோல்வியடைந்தது");
    } finally {
      setSubmittingScenes(false);
    }
  }

  async function generateThumbnail() {
    if (!projectId || !thumbnailPrompt.trim()) return;
    setGeneratingThumbnail(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: thumbnailPrompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "உருவாக்கம் தோல்வியடைந்தது");
      setThumbnailPath(data.thumbnailPath);
      setThumbnailCost(0.03); // cost of generation
      setHasThumb(true);
      setThumbVersion(Date.now());
      refreshCost(projectId);
      alert("Thumbnail வெற்றிகரமாக உருவாக்கப்பட்டது!");
    } catch (err: any) {
      alert("பிழை: " + (err.message || String(err)));
    } finally {
      setGeneratingThumbnail(false);
    }
  }

  async function uploadThumbnailFile(file: File) {
    if (!projectId) return;
    setGeneratingThumbnail(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/upload-thumbnail`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "பதிவேற்றம் தோல்வியடைந்தது");
      setThumbnailPath(data.thumbnailPath);
      setHasThumb(true);
      setThumbVersion(Date.now());
      alert("Thumbnail வெற்றிகரமாக பதிவேற்றப்பட்டது!");
    } catch (err: any) {
      alert("பிழை: " + (err.message || String(err)));
    } finally {
      setGeneratingThumbnail(false);
    }
  }

  function updateSceneKeywords(sceneIndex: number, keywords: string) {
    const kwArray = keywords.split(",").map(k => k.trim()).filter(Boolean);
    setScenes(prev => prev.map(s => s.index === sceneIndex ? { ...s, keywords: kwArray } : s));
  }

  function chooseSceneAsset(sceneIndex: number, asset: any) {
    setScenes(prev => prev.map(s => s.index === sceneIndex ? { ...s, chosenAsset: asset } : s));
  }

  async function searchStockForScene(sceneIndex: number, query: string, type: "video" | "image") {
    if (query.trim().length < 2) return;
    setScenes(prev => prev.map(s => s.index === sceneIndex ? { ...s, searching: true } : s));
    try {
      const orientation = form.format === "9:16" ? "portrait" : "landscape";
      const response = await fetch(`/api/stock/search?q=${encodeURIComponent(query)}&orientation=${orientation}&type=${type}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search தோல்வியடைந்தது");
      const results = data.results || [];
      setScenes(prev => prev.map(s => s.index === sceneIndex ? {
        ...s,
        suggestions: results,
        chosenAsset: results[0] || s.chosenAsset,
        searching: false
      } : s));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Search தோல்வியடைந்தது");
      setScenes(prev => prev.map(s => s.index === sceneIndex ? { ...s, searching: false } : s));
    }
  }

  function openClipEditor(index: number) {
    setEditingClip(index); setSearchResults([]); setSearchQuery(""); setSearchTab("video");
  }

  async function uploadToYt() {
    if (projectId === null || !ytTitle.trim()) { setMessage("YouTube title prescribing..."); return; }
    setYtUploading(true); setYtResult(null); setMessage("YouTube-க்கு upload ஆகிறது... (video அளவை பொறுத்து சில நிமிடங்கள் ஆகலாம்)");
    try {
      const response = await fetch(`/api/projects/${projectId}/youtube`, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          title: ytTitle, 
          description: ytDescription, 
          privacy: ytPrivacy,
          tags: ytTags
        }) 
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "YouTube upload தோல்வியடைந்தது");
      setYtResult(data);
      setMessage(`YouTube upload வெற்றி ✅ (${data.privacyStatus})`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "YouTube upload தோல்வியடைந்தது"); }
    finally { setYtUploading(false); }
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

  async function setThumb(action: () => Promise<Response>) {
    if (projectId === null) return;
    setThumbBusy(true);
    try {
      const response = await action();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Thumbnail சேமிக்க முடியவில்லை");
      setHasThumb(true); setThumbVersion(Date.now());
      setMessage("Thumbnail தயார் — upload செய்யும்போது தானாக YouTube-ல் அமைக்கப்படும்.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Thumbnail சேமிக்க முடியவில்லை"); }
    finally { setThumbBusy(false); }
  }

  function uploadThumb(file: File) {
    const body = new FormData();
    body.append("file", file);
    setThumb(() => fetch(`/api/projects/${projectId}/thumbnail`, { method: "POST", body }));
  }

  function grabThumbFromVideo() {
    setThumb(() => fetch(`/api/projects/${projectId}/thumbnail`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ atSec: 1.5 }) }));
  }

  async function removeThumb() {
    if (projectId === null) return;
    await fetch(`/api/projects/${projectId}/thumbnail`, { method: "DELETE" });
    setHasThumb(false);
  }

  async function runTransitionPreview(sceneIndex: number, transition: any) {
    if (projectId === null) return;
    setRenderingPreviewIndex(sceneIndex);
    setPreviewVideoUrl(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/preview-transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIndex, transition })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Preview render failed");
      setPreviewVideoUrl(data.url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Preview render failed");
    } finally {
      setRenderingPreviewIndex(null);
    }
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

  return <main className="min-h-screen pb-28">
    <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-10">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="logo-mark">▶</div>
          <div>
            <p className="text-lg font-bold tracking-tight">Video Review Studio</p>
            <p className="text-xs text-slate-400">தமிழ் AI வீடியோ உருவாக்கி</p>
          </div>
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              loadHistory();
              setIsHistoryOpen(true);
            }}
            className="choice text-xs flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-lg border border-white/10"
          >
            📂 திட்ட வரலாறு (History)
          </button>
          <button
            type="button"
            onClick={() => {
              setProjectId(null);
              setStatus("idle");
              setMessage("");
              setSourceImage(null);
              setForm((current) => ({ ...current, url: "", sourceText: "" }));
              window.history.replaceState(null, "", "/create?style=documentary");
            }}
            className="choice text-xs flex items-center gap-1 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 px-3 py-2 rounded-lg text-violet-300 font-semibold"
          >
            ➕ புதிய வீடியோ (New Video)
          </button>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Local mode
          </div>
        </div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1500px] gap-7 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-10">
      <form onSubmit={submit} className="space-y-6">
        <section>
          <div className="mb-4"><Link href="/" className="choice inline-block text-xs">← Back to Style Selection</Link></div>
          <p className="eyebrow">புதிய உருவாக்கம்</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            ஒரு வீடியோவை தமிழ் {activeStyle ? activeStyle.name : "Review"}-ஆக மாற்றுங்கள்
          </h1>
          {activeStyle && (
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{activeStyle.icon}</span>
                <div>
                  <h3 className="font-semibold text-white">{activeStyle.name} Style</h3>
                  <p className="text-xs text-slate-400">{activeStyle.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs border-t border-white/5 pt-3">
                <span className="text-slate-400">📈 Viewer Retention: <strong className="text-emerald-400">{activeStyle.estimatedViewerRetention}</strong></span>
                <span className="text-slate-400">🎬 Use Cases: <strong>{activeStyle.exampleUseCases.join(", ")}</strong></span>
              </div>
            </div>
          )}
        </section>
        {(status === "idle" || status === "saving" || status === "error") && (
          <>
            <section className="panel space-y-4">
              <div className="step-title"><span>💰</span><div><h2>Free அல்லது Premium?</h2><p>Free-ல் Gemini API எதுவும் call ஆகாது — முழுவதும் local, $0.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setTier("free")} className={`format-card ${form.tier === "free" ? "format-active" : ""}`}><strong>🆓 Free</strong><small>Gemini API இல்லை · local script + Local Parler/Piper TTS · API கட்டணம் இல்லை</small></button>
                <button type="button" onClick={() => setTier("premium")} className={`format-card ${form.tier === "premium" ? "format-active" : ""}`}><strong>💎 Premium</strong><small>Gemini AI script rewrite + Gemini TTS option · API கட்டணம் உண்டு</small></button>
              </div>
            </section>
            
            <section className="panel space-y-4">
              <div className="step-title"><span>📤</span><div><h2>YouTube Channel இணைப்பு</h2><p>வீடியோ தயாரானதும் பதிவேற்ற வேண்டிய சேனலைத் தேர்ந்தெடுக்கவும்.</p></div></div>
              {!ytStatus?.configured && (
                <p className="text-xs leading-5 text-slate-400">
                  YouTube upload செயல்பட <code className="rounded bg-white/10 px-1">YOUTUBE_CLIENT_ID</code> மற்றும் <code className="rounded bg-white/10 px-1">YOUTUBE_CLIENT_SECRET</code>-ஐ <code className="rounded bg-white/10 px-1">.env.local</code>-ல் அமைக்க வேண்டும்.
                </p>
              )}
              {ytStatus?.configured && !ytStatus.connected && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">Google account-ல் அனுமதி அளித்து உங்கள் சேனலை இணைக்கவும்.</p>
                  <a className="choice choice-active inline-block" href="/api/youtube/auth">🔗 YouTube-உடன் இணை (Link YouTube)</a>
                </div>
              )}
              {ytStatus?.configured && ytStatus.connected && ytStatus.channel && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 p-3">
                  <div className="flex items-center gap-3">
                    {ytStatus.channel.thumbnail && (
                      <img className="h-9 w-9 rounded-full" src={ytStatus.channel.thumbnail} alt="channel" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white">{ytStatus.channel.title}</p>
                      {ytStatus.channel.customUrl && <p className="text-xs text-slate-400">{ytStatus.channel.customUrl}</p>}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="choice text-xs bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-300"
                    onClick={async () => {
                      await fetch("/api/youtube/status", { method: "DELETE" });
                      loadYtStatus();
                    }}
                  >
                    ❌ துண்டி (Change Channel)
                  </button>
                </div>
              )}
            </section>

            <section className="panel space-y-6">
              <div className="step-title">
                <span>1</span>
                <div>
                  <h2>மூலத்தைத் தேர்ந்தெடுக்கவும் (Choose Source)</h2>
                  <p>வீடியோ தயாரிப்பிற்கான மூலப்பொருள் அல்லது தளத்தைத் தேர்ந்தெடுக்கவும்.</p>
                </div>
              </div>

              {/* Source Grid */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sourceGridOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      set("sourceType", opt.value);
                    }}
                    className={`format-card text-left relative flex flex-col justify-between h-full ${form.sourceType === opt.value ? "format-active" : ""} ${opt.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{opt.icon}</span>
                      <strong>{opt.label}</strong>
                    </div>
                    <small className="mt-1 block text-slate-400">{opt.description}</small>
                    {opt.disabled && (
                      <span className="absolute top-2 right-2 text-[9px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded font-mono font-bold tracking-wider">🔒 SOON</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Source Type Details Inputs */}
              {form.sourceType !== "text" && form.sourceType !== "voiceover" && form.sourceType !== "local_folder" && (
                <label className="block">
                  <span className="field-label">{form.sourceType === "news" ? "News URL" : "YouTube URL"}</span>
                  <div className="url-input">
                    <span>{form.sourceType === "news" ? "📰" : "▶"}</span>
                    <input
                      required
                      type="url"
                      placeholder={form.sourceType === "news" ? "https://www.bbc.com/news/..." : "https://youtube.com/watch?v=..."}
                      value={form.url}
                      onChange={(e) => set("url", e.target.value)}
                    />
                  </div>
                </label>
              )}

              {form.sourceType === "youtube" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="field-label">தொடக்க நேரம்</span>
                      <input className="text-input" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} placeholder="00:00" />
                    </label>
                    <label>
                      <span className="field-label">முடிவு நேரம்</span>
                      <input className="text-input" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} placeholder="01:00" />
                    </label>
                  </div>

                  <div className="space-y-4 border-t border-white/5 pt-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isReaction}
                        onChange={(e) => setForm(prev => ({ ...prev, isReaction: e.target.checked }))}
                        className="rounded bg-white/10 border-white/20 text-emerald-400 focus:ring-emerald-400"
                      />
                      <span>👍 Reaction / Review வீடியோவாக மாற்றவா? (Make Reaction Video)</span>
                    </label>
                    
                    {form.isReaction && (
                      <div className="ml-6 space-y-3 rounded-lg border border-white/5 bg-white/5 p-3">
                        <span className="field-label text-slate-300">விமர்சன வீடியோ வடிவமைப்பு (Reaction Layout):</span>
                        <select
                          className="text-input text-sm"
                          value={form.reactionLayout}
                          onChange={(e) => setForm(prev => ({ ...prev, reactionLayout: e.target.value }))}
                        >
                          <option value="pause-and-explain">Pause-and-explain (நிறுத்தி விளக்குதல்)</option>
                          <option value="sequential">Sequential (காட்சிக்கு பின் விமர்சனம்)</option>
                          <option value="split-screen">Split-screen (இருதிரை விமர்சனம்)</option>
                          <option value="pip">Picture-in-picture (PiP வடிவம்)</option>
                          <option value="news-overlay">News Overlay (செய்திப் பலகை)</option>
                          <option value="split-thumbnail-news">பிரிப்பு ஷார்ட்ஸ் (Split Shorts Layout)</option>
                        </select>
                        
                        <span className="field-label text-slate-300">விமர்சனக் கருப்பொருள் (Reaction Theme):</span>
                        <select
                          className="text-input text-sm"
                          value={form.videoStyle}
                          onChange={(e) => setForm(prev => ({ ...prev, videoStyle: e.target.value }))}
                        >
                          <option value="standard">Standard (இயல்பான ப்ளூ கார்டு)</option>
                          <option value="avatar">AI Presenter (ஆண்/பெண் AI பிரசெண்டர்)</option>
                          <option value="motivational">Motivational Split (மதிப்பீட்டு B-Roll + சப்டைட்டில்)</option>
                        </select>
                        <p className="text-[10px] text-slate-400">
                          விமர்சகர் குரல், லேஅவுட் மற்றும் கருப்பொருள் அமைப்புகளுடன் வீடியோ கம்பைல் செய்யப்படும்.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {form.sourceType === "news" && (
                <p className="text-xs text-slate-400">
                  {form.tier === "free"
                    ? "Free tier-ல் news article உரை அப்படியே voice-over-ஆக மாற்றப்படும் (AI rewrite இல்லை, Gemini call இல்லை)."
                    : "Article-ஐ AI படித்து, நீங்கள் தேர்ந்தெடுக்கும் நிலைப்பாட்டில் தமிழ் video உருவாக்கும். “நடுநிலை” என்றால் neutral செய்தி சுருக்கம்; மற்ற நிலைப்பாடுகள் கருத்து/review style."}
                </p>
              )}

              {form.sourceType === "youtube" && form.tier === "free" && (
                <p className="text-xs text-slate-400">
                  Free tier-ல் YouTube transcript-ஐ அப்படியே voice-over-ஆக மாற்றும் (AI rewrite இல்லை, Gemini call இல்லை).
                </p>
              )}

              {form.sourceType === "local_folder" && (
                <div className="space-y-4 rounded-xl border border-white/5 bg-white/5 p-4">
                  {/* Connected Folders list */}
                  <div className="space-y-2">
                    <span className="field-label">இணைக்கப்பட்ட உள்ளூர் கோப்புறைகள் (Connected Folders)</span>
                    {folders.length === 0 ? (
                      <p className="text-xs text-slate-400">இணைக்கப்பட்ட கோப்புறைகள் எதுவும் இல்லை. கீழே புதிய கோப்புறையை இணைக்கவும்.</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {folders.map((folder) => {
                          const isSelected = String(form.localFolderId) === String(folder.id);
                          return (
                            <div
                              key={folder.id}
                              onClick={() => set("localFolderId", String(folder.id))}
                              className={`flex flex-col gap-2 rounded-lg border p-3 cursor-pointer transition ${isSelected ? "border-emerald-500 bg-emerald-950/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-xs font-semibold text-white font-mono break-all line-clamp-1">{folder.path}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${
                                  folder.scan_status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                                  folder.scan_status === "scanning" ? "bg-amber-500/20 text-amber-400 animate-pulse" :
                                  "bg-slate-800 text-slate-400"
                                }`}>
                                  {folder.scan_status === "completed" ? "Completed" : folder.scan_status === "scanning" ? "Scanning" : folder.scan_status}
                                </span>
                              </div>
                              
                              {/* Progress bar */}
                              {(folder.scan_status === "scanning" || folder.scan_status === "queued" || folder.total_files > 0) && (
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[10px] text-slate-400">
                                    <span>கிளிப்புகள் ஸ்கேன்: {folder.scanned_files} / {folder.total_files}</span>
                                    {folder.total_files > 0 && <span>{Math.round((folder.scanned_files / folder.total_files) * 100)}%</span>}
                                  </div>
                                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-400 transition-all duration-300"
                                      style={{ width: `${folder.total_files > 0 ? (folder.scanned_files / folder.total_files) * 100 : 0}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              
                              {/* Control Actions (Pause/Resume) */}
                              <div className="flex gap-2 justify-end mt-1">
                                {folder.scan_status === "scanning" && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await fetch("/api/folders", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ action: "pause", folderId: folder.id })
                                      });
                                      loadFolders();
                                    }}
                                    className="px-2 py-0.5 text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded hover:bg-amber-500/20 transition"
                                  >
                                    ⏸ Pause
                                  </button>
                                )}
                                {folder.scan_status === "paused" && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await fetch("/api/folders", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ action: "resume", folderId: folder.id })
                                      });
                                      loadFolders();
                                    }}
                                    className="px-2 py-0.5 text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded hover:bg-emerald-500/20 transition"
                                  >
                                    ▶ Resume
                                  </button>
                                )}
                                {(folder.scan_status === "completed" || folder.scan_status === "paused" || folder.scan_status === "error") && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await fetch("/api/folders", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ path: folder.path })
                                      });
                                      loadFolders();
                                    }}
                                    className="px-2 py-0.5 text-[10px] bg-sky-500/10 border border-sky-500/20 text-sky-300 rounded hover:bg-sky-500/20 transition"
                                  >
                                    🔄 Refresh Scan
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Register New Folder Input */}
                  <div className="space-y-2">
                    <span className="field-label">புதிய கோப்புறையை இணை (Register Folder)</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="C:/Users/kanna/Videos/Vacation"
                        value={newFolderPath}
                        onChange={(e) => setNewFolderPath(e.target.value)}
                        className="text-input flex-1 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/folders/select", { method: "POST" });
                            const data = await res.json();
                            if (data.path) {
                              setNewFolderPath(data.path);
                            }
                          } catch (err) {
                            alert("Folder selector-ஐ திறக்க முடியவில்லை.");
                          }
                        }}
                        className="choice py-2 flex items-center gap-1"
                      >
                        📂 Browse
                      </button>
                      <button
                        type="button"
                        disabled={addingFolder || !newFolderPath.trim()}
                        onClick={async () => {
                          setAddingFolder(true);
                          try {
                            const res = await fetch("/api/folders", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ path: newFolderPath })
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "இணைப்பு தோல்வியடைந்தது");
                            setNewFolderPath("");
                            await loadFolders();
                            if (data.id) {
                              set("localFolderId", String(data.id));
                              // Automatically switch B-roll Source to personal when a folder is connected!
                              set("bRollSource", "personal");
                            }
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "பிழை ஏற்பட்டது");
                          } finally {
                            setAddingFolder(false);
                          }
                        }}
                        className="choice choice-active py-2"
                      >
                        {addingFolder ? "Scanning..." : "🔗 இணை"}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      உள்ளூர் விண்டோஸ் கணினியில் உள்ள வீடியோ ஃபோல்டரின் முழுமையான பாதையை (Absolute Path) உள்ளிடவும்.
                    </p>
                  </div>

                  {/* Story prompt input */}
                  <label className="block">
                    <span className="field-label">உங்கள் வீடியோவிற்கான கதை குறிப்பு (Story Prompt)</span>
                    <textarea
                      required={!sourceImage}
                      className="text-input min-h-32 resize-y"
                      placeholder="உதாரணம்: எங்கள் குடும்பத்துடன் கடற்கரைக்கு சென்றோம். குழந்தைகள் மகிழ்ச்சியாக விளையாடினார்கள்... (குறிப்பு: படத்தின் மீது Right Click செய்து Copy செய்த பின், இந்த பாக்ஸில் வைத்து Ctrl+V கொடுத்தும் பேஸ்ட் செய்யலாம்)"
                      value={form.sourceText}
                      onChange={(e) => set("sourceText", e.target.value)}
                      onPaste={handleImagePaste}
                    />
                  </label>
                  {sourceImage && (
                    <div className="relative mt-2 inline-block rounded-xl overflow-hidden border border-white/20 bg-slate-900/50 p-1 group">
                      <img src={sourceImage} className="max-h-40 rounded-lg object-contain" alt="Pasted source" />
                      <button
                        type="button"
                        onClick={() => setSourceImage(null)}
                        className="absolute top-2 right-2 bg-red-600/90 text-white rounded-full p-1.5 hover:bg-red-500 transition shadow-lg text-xs"
                        title="Remove Image"
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              {form.sourceType === "text" && (
                <>
                  <label className="block">
                    <span className="field-label">உங்கள் உரை / voice-over script</span>
                    <textarea
                      required={!sourceImage}
                      className="text-input min-h-40 resize-y"
                      placeholder="உங்கள் செய்தி, குறிப்பு அல்லது voice-over script-ஐ இங்கே paste செய்யவும்... (குறிப்பு: படத்தின் மீது Right Click செய்து Copy செய்த பின், இந்த பாக்ஸில் வைத்து Ctrl+V கொடுத்தும் பேஸ்ட் செய்யலாம்)"
                      value={form.sourceText}
                      onChange={(e) => set("sourceText", e.target.value)}
                      onPaste={handleImagePaste}
                    />
                  </label>
                  {sourceImage && (
                    <div className="relative mt-2 inline-block rounded-xl overflow-hidden border border-white/20 bg-slate-900/50 p-1 group">
                      <img src={sourceImage} className="max-h-40 rounded-lg object-contain" alt="Pasted source" />
                      <button
                        type="button"
                        onClick={() => setSourceImage(null)}
                        className="absolute top-2 right-2 bg-red-600/90 text-white rounded-full p-1.5 hover:bg-red-500 transition shadow-lg text-xs"
                        title="Remove Image"
                      >
                        🗑️ Remove
                      </button>
                    </div>
                  )}
                  {form.tier === "premium" && (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => set("scriptMode", "rewrite")} className={`choice ${form.scriptMode === "rewrite" ? "choice-active" : ""}`}>🪄 AI மெருகூட்டட்டும்</button>
                      <button type="button" onClick={() => set("scriptMode", "as-is")} className={`choice ${form.scriptMode === "as-is" ? "choice-active" : ""}`}>📖 அப்படியே வாசிக்கவும்</button>
                    </div>
                  )}
                  <p className="text-xs text-slate-400">
                    {form.tier === "free"
                      ? "Free tier-ல் script AI-ஆல் மாற்றப்படாது — நீங்கள் எழுதியதே அப்படியே voice-over ஆகும் (Gemini call இல்லை)."
                      : form.scriptMode === "as-is"
                      ? "நீங்கள் எழுதியதை மாற்றாமல் அப்படியே வாசிக்கும் — நிலைப்பாடு/tone script-ஐ பாதிக்காது."
                      : "உங்கள் உரையை அடிப்படையாகக் கொண்டு, தேர்ந்தெடுத்த நிலைப்பாடு மற்றும் tone-ல் AI புதிய தமிழ் script எழுதும்."}
                  </p>
                </>
              )}

              {form.sourceType === "voiceover" && (
                <>
                  <label className="block">
                    <span className="field-label">Voice-over audio file</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className="choice" onClick={() => audioFileInput.current?.click()}>
                        {audioFile ? "🔁 வேறு file தேர்வு செய்" : "⬆️ Audio file upload"}
                      </button>
                      {audioFile && <span className="text-xs text-slate-400">{audioFile.name} {audioDurationSeconds !== null && `· ${audioDurationSeconds.toFixed(1)}s`}</span>}
                    </div>
                    <input
                      ref={audioFileInput}
                      type="file"
                      accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) pickAudioFile(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">இந்த audio-வின் சரியான script (word-to-word)</span>
                    <textarea
                      required
                      className="text-input min-h-40 resize-y"
                      placeholder="Audio-வில் பேசப்படும் script-ஐ சரியாக இங்கே paste செய்யவும்..."
                      value={form.sourceText}
                      onChange={(e) => set("sourceText", e.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">English stock keywords (விருப்பம்)</span>
                    <input
                      className="text-input"
                      placeholder="city, temple"
                      value={form.stockKeywords}
                      onChange={(e) => set("stockKeywords", e.target.value)}
                    />
                  </label>
                  {form.tier === "premium" && (
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={form.allowGeminiKeywords} onChange={(e) => setForm((current) => ({ ...current, allowGeminiKeywords: e.target.checked }))} />
                      Improve stock search using Gemini <span className="text-xs text-amber-300/80">(API கட்டணம் உண்டு — default OFF)</span>
                    </label>
                  )}
                  {sceneCount !== null && <p className="text-xs text-emerald-300/80">≈ {sceneCount} unique 3-second scenes இந்த audio-க்கு தேவைப்படும்.</p>}
                  <p className="text-xs text-slate-400">இந்த மோட்-ல் Gemini script/TTS எதுவும் call ஆகாது — உங்கள் audio + script-ஐயே நேரடியாக video-ஆக render செய்யும்.</p>
                </>
              )}

              {/* B-roll Visuals Source selector */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <p className="text-sm font-semibold text-slate-200">🎬 B-roll கிளிப் ஆதாரம் (Visuals Source)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => set("bRollSource", "stock")}
                    className={`format-card text-left ${form.bRollSource === "stock" ? "format-active" : ""}`}
                  >
                    <strong>🌍 Stock Videos</strong>
                    <small className="mt-1 block text-slate-400">Pexels & Pixabay ஆன்லைன் வீடியோக்கள்</small>
                  </button>
                  
                  <button
                    type="button"
                    disabled={folders.length === 0}
                    onClick={() => set("bRollSource", "personal")}
                    className={`format-card text-left ${form.bRollSource === "personal" ? "format-active" : ""} ${folders.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <strong>📁 Personal Videos</strong>
                    <small className="mt-1 block text-slate-400">ஸ்கேன் செய்யப்பட்ட எனது லோக்கல் வீடியோ கிளிப்புகள்</small>
                  </button>

                  <button
                    type="button"
                    disabled={folders.length === 0}
                    onClick={() => set("bRollSource", "mix")}
                    className={`format-card text-left ${form.bRollSource === "mix" ? "format-active" : ""} ${folders.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <strong>🔀 Mix Both (பரிந்துரை)</strong>
                    <small className="mt-1 block text-slate-400">லோக்கல் கிளிப்புகளை முதலில் பயன்படுத்தி, பின் ஸ்டாக் வீடியோக்கள்</small>
                  </button>
                </div>
                {folders.length === 0 && (
                  <p className="text-[10px] text-amber-300/80">⚠️ லோக்கல் கிளிப்புகளைப் பயன்படுத்த முதலில் லோக்கல் வீடியோ ஃபோல்டரை இணைக்க வேண்டும்.</p>
                )}
              </div>
            </section>
            {form.sourceType !== "voiceover" && form.tier === "premium" && <section className="panel space-y-7"><div className="step-title"><span>2</span><div><h2>Review பாணியை வடிவமைக்கவும்</h2><p>AI எழுத வேண்டிய நிலைப்பாடு மற்றும் உணர்வு</p></div></div><ChoiceGroup label="நிலைப்பாடு" name="stance" value={form.stance} onChange={(v) => set("stance", v)} /><ChoiceGroup label="Tone" name="tone" value={form.tone} onChange={(v) => set("tone", v)} /><ChoiceGroup label="கதாபாத்திர பாணி" name="persona" value={form.persona} onChange={(v) => set("persona", v)} /><label className="block"><span className="field-label">கூடுதல் வழிமுறை (விருப்பம்)</span><textarea className="text-input min-h-24 resize-y" placeholder="உதாரணம்: தொடக்கத்தில் வலுவான hook சேர்க்கவும்..." value={form.customInstruction} onChange={(e) => set("customInstruction", e.target.value)} /></label></section>}
            <section className="panel space-y-7"><div className="step-title"><span>{form.sourceType === "voiceover" || form.tier === "free" ? 2 : 3}</span><div><h2>குரல் மற்றும் output</h2><p>Final video எப்படி இருக்க வேண்டும்?</p></div></div>
              <div className="space-y-3"><p className="text-sm font-semibold text-slate-200">{form.sourceType === "voiceover" ? "Script மொழி (keyword extraction-க்கு)" : "Output மொழி"}</p><div className="flex flex-wrap gap-2">{outputLanguageOptions.map((option) => <button key={option.value} type="button" onClick={() => set("outputLanguage", option.value)} className={`choice ${form.outputLanguage === option.value ? "choice-active" : ""}`}>{option.label}</button>)}</div></div>
              {form.sourceType !== "voiceover" && form.tier === "premium" && <div className="space-y-3"><p className="text-sm font-semibold text-slate-200">TTS முறை</p><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => set("ttsProvider", "local")} className={`format-card ${form.ttsProvider === "local" ? "format-active" : ""}`}><strong>Local Parler / Piper — இலவசம்</strong><small>API செலவு இல்லை · {form.outputLanguage === "ta" ? "Indic Parler-TTS (Premium Quality)" : `${outputLanguageOptions.find((o) => o.value === form.outputLanguage)?.label} Piper`}</small></button><button type="button" onClick={() => set("ttsProvider", "gemini")} className={`format-card ${form.ttsProvider === "gemini" ? "format-active" : ""}`}><strong>Gemini TTS</strong><small>மேம்பட்ட குரல் · API கட்டணம் உண்டு</small></button></div></div>}
              {form.sourceType !== "voiceover" && (form.ttsProvider === "local" || form.tier === "free") && (
                form.outputLanguage === "ta" ? (
                  <div className="space-y-2">
                    <span className="field-label text-slate-300">Local தமிழ் குரல் (Tamil Voice - Parler/Piper):</span>
                    <select
                      className="text-input text-sm"
                      value={form.voice.startsWith("ta_IN") || form.voice.startsWith("parler-") ? form.voice : "parler-jaya"}
                      onChange={(e) => set("voice", e.target.value)}
                    >
                      <option value="parler-jaya">👩 Jaya (Professional Female)</option>
                      <option value="parler-rasa">👩 Rasa (Natural Female)</option>
                      <option value="parler-ganga">👩 Ganga (Calm Female)</option>
                      <option value="parler-lekha">👩 Lekha (Energetic Female)</option>
                      <option value="parler-sundar">👨 Sundar (Professional Male)</option>
                      <option value="parler-karthik">👨 Karthik (Natural Male)</option>
                      <option value="parler-vasanth">👨 Vasanth (Calm Male)</option>
                      <option value="parler-arvind">👨 Arvind (Fast Male)</option>
                    </select>
                    <p className="text-[10px] text-slate-400">
                      குறிப்பு: தமிழ் மொழிக்கு AI4Bharat Indic Parler-TTS (உயர்தர குரல்) தானாகவே பயன்படுத்தப்படும். பிற மொழிகளுக்கு Piper பயன்படுத்தப்படும்.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-emerald-300/80">
                    Local Piper தற்போது {outputLanguageOptions.find((o) => o.value === form.outputLanguage)?.label} fixed voice-ஐப் பயன்படுத்தும்.
                  </p>
                )
              )}
              {form.sourceType !== "voiceover" && form.tier === "premium" && form.ttsProvider === "gemini" && (
                <ChoiceGroup label="குரல்" name="voice" value={form.voice} onChange={(v) => set("voice", v)} />
              )}
              <div className="space-y-3"><p className="text-sm font-semibold text-slate-200">Video வடிவம்</p><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => set("format", "9:16")} className={`format-card ${form.format === "9:16" ? "format-active" : ""}`}><span className="portrait-icon"/><strong>Shorts / Reels</strong><small>9:16 · 1080 × 1920</small></button><button type="button" onClick={() => set("format", "16:9")} className={`format-card ${form.format === "16:9" ? "format-active" : ""}`}><span className="landscape-icon"/><strong>Normal video</strong><small>16:9 · 1920 × 1080</small></button></div></div>
              {form.format === "9:16" && (
                <div className="space-y-2 rounded-lg border border-white/5 bg-white/5 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.splitShortsEnabled || false}
                      onChange={(e) => setForm(current => ({ ...current, splitShortsEnabled: e.target.checked }))}
                      className="rounded bg-white/10 border-white/20 text-emerald-400 focus:ring-emerald-400"
                    />
                    <span>📺 பிரிப்பு ஷார்ட்ஸ் (Split Shorts Layout) பயன்படுத்தவா?</span>
                  </label>
                  <p className="text-[10px] text-slate-400 ml-6">
                    இதை டிக் செய்தால்: மேல் பாதியில் Thumbnail இமேஜும், நடுவில் வீடியோ கிளிப்புகளும், கீழ் பாதியில் அட்ராக்டிவ் சிவப்பு நிற சப்ஸ்கிரைப் பேனரும் தானாகவே அமைக்கப்படும்.
                  </p>
                </div>
              )}
              {form.sourceType === "voiceover" ? <p className="text-xs text-slate-400">கால அளவு: Auto — உங்கள் audio-வின் நீளத்தை பொறுத்து (+2s tail).</p> : <ChoiceGroup label="கால அளவு" name="duration" value={form.duration} onChange={(v) => set("duration", v)} />}
              <p className="text-xs text-slate-400">குறிப்பு: voice-over சற்று நீளமானால் video-வும் voice முடியும் வரை நீளும் — பேச்சு நடுவில் வெட்டப்படாது.</p>
              <div className="space-y-4 border-t border-white/5 pt-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.ctaEnabled}
                    onChange={(e) => setForm((current) => ({ ...current, ctaEnabled: e.target.checked }))}
                    className="rounded bg-white/10 border-white/20 text-emerald-400 focus:ring-emerald-400"
                  />
                  <span>👍 Like, Subscribe, Comment விளம்பரம் சேர்க்கவா?</span>
                </label>
                {form.ctaEnabled && (
                  <div className="ml-6 space-y-2">
                    <span className="field-label text-slate-400">அனிமேஷன் காட்டும் இடம்:</span>
                    <select
                      className="text-input text-sm"
                      value={form.ctaPosition}
                      onChange={(e) => setForm((current) => ({ ...current, ctaPosition: e.target.value }))}
                    >
                      <option value="end">முடிவில் மட்டும் (இறுதி 5 விநாடிகள்)</option>
                      <option value="start">தொடக்கத்தில் மட்டும் (முதல் 5 விநாடிகள்)</option>
                      <option value="both">தொடக்கத்திலும் முடிவிலும்</option>
                      <option value="full">முழு வீடியோவிலும்</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="space-y-3 border-t border-white/5 pt-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoApprove}
                    onChange={(e) => setForm((current) => ({ ...current, autoApprove: e.target.checked }))}
                    className="rounded bg-white/10 border-white/20 text-emerald-400 focus:ring-emerald-400"
                  />
                  <span>⚡ Auto Approve — ஸ்கிரிப்ட்/சீன் ஒப்புதல் இல்லாமல் தானாகவே முடிக்கவும்</span>
                </label>
                <p className="text-[10px] text-slate-400 ml-6">
                  இதை டிக் செய்தால்: ஸ்கிரிப்ட் மற்றும் சீன்களை நீங்கள் சரிபார்க்காமலேயே வீடியோ தானாக render ஆகி, தேர்ந்தெடுக்கப்பட்ட YouTube சேனலில் நேரடியாக upload செய்யப்படும்.
                </p>
                {form.autoApprove && (
                  <div className="ml-6 space-y-2">
                    <span className="field-label text-slate-400">YouTube Privacy (auto-upload):</span>
                    <select
                      className="text-input text-sm"
                      value={form.autoApprovePrivacy}
                      onChange={(e) => setForm((current) => ({ ...current, autoApprovePrivacy: e.target.value }))}
                    >
                      {privacyOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </section>
            {liveEstimate && (
              <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-300">💰 மதிப்பீட்டு கட்டணம் (Estimated API Cost):</span>
                  <span className="text-sm font-bold text-amber-300">${liveEstimate.estimatedCost.toFixed(5)}</span>
                </div>
                {liveEstimate.estimatedCost > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-2 text-[10px] text-slate-400">
                    <div>📝 Script AI: <span className="text-slate-200">${liveEstimate.breakdown.script.toFixed(5)}</span></div>
                    <div>🏷️ Metadata: <span className="text-slate-200">${liveEstimate.breakdown.metadata.toFixed(5)}</span></div>
                    <div>🎙️ Gemini TTS: <span className="text-slate-200">${liveEstimate.breakdown.tts.toFixed(5)}</span></div>
                    <div>🔍 Keywords: <span className="text-slate-200">${liveEstimate.breakdown.keywords.toFixed(5)}</span></div>
                  </div>
                )}
              </div>
            )}
            <button disabled={status === "saving"} className="generate-button" type="submit"><span>{status === "saving" ? "தயாராகிறது..." : "Review video உருவாக்கு"}</span><b>→</b></button>
            {message && <div className={`status ${status === "error" ? "status-error" : ""}`}>{message}</div>}
          </>
        )}

        {status === "awaiting_script_approval" && (() => {
          let parsedHighlights: any[] | null = null;
          try {
            if (editableScript.trim().startsWith("[")) {
              parsedHighlights = JSON.parse(editableScript);
            }
          } catch {
            parsedHighlights = null;
          }

          return (
            <section className="panel space-y-4">
              <div className="step-title">
                <span>📝</span>
                <div>
                  <h2>வாக்கிய வடிவம் (Review Script)</h2>
                  <p>
                    {parsedHighlights 
                      ? "தேர்ந்தெடுக்கப்பட்ட காட்சிகளுக்கான வசனங்களை மாற்றியமைக்கவும் (அல்லது சொந்த வசனங்களை தட்டச்சு செய்யவும்)." 
                      : "AI உருவாக்கிய தமிழ் ஸ்கிரிப்ட். தேவையான மாற்றங்களைச் செய்யலாம்."}
                  </p>
                </div>
              </div>

              {parsedHighlights ? (
                <div className="space-y-4">
                  {parsedHighlights.map((moment: any, idx: number) => (
                    <div key={idx} className="rounded-xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2 text-xs font-semibold text-slate-400">
                        <span>விளக்கக் காட்சி #{idx + 1} ({((moment.startMs)/1000).toFixed(1)}s - {((moment.endMs)/1000).toFixed(1)}s)</span>
                      </div>
                      {moment.sourceSpeech && (
                        <div className="rounded border border-white/5 bg-slate-950/40 p-2.5 text-xs text-slate-300 leading-relaxed italic mb-2">
                          <span className="text-[10px] font-bold text-slate-500 block uppercase mb-1">📢 மூல உரை (Original Video Speech):</span>
                          "{moment.sourceSpeech}"
                        </div>
                      )}
                      <textarea
                        className="text-input text-sm min-h-20 resize-y"
                        value={moment.commentary}
                        onChange={(e) => {
                          const newText = e.target.value;
                          const updated = [...parsedHighlights!];
                          updated[idx].commentary = newText;
                          setEditableScript(JSON.stringify(updated));
                        }}
                        placeholder="இந்தக் காட்சிக்கு உங்களது சொந்த வசனத்தை தட்டச்சு செய்யவும்..."
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <label className="block">
                  <textarea
                    className="text-input min-h-60 resize-y font-mono text-sm leading-relaxed"
                    value={editableScript}
                    onChange={(e) => setEditableScript(e.target.value)}
                  />
                </label>
              )}

              {message && <div className="status">{message}</div>}
              
              <div className="border-t border-white/5 pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={submittingScript}
                  onClick={approveScript}
                  className="generate-button text-sm"
                >
                  <span>{submittingScript ? "அங்கீகரிக்கப்படுகிறது..." : "வாக்கிய வடிவம் அங்கீகரித்து தொடரவும்"}</span>
                  <b>→</b>
                </button>
              </div>
            </section>
          );
        })()}

        {status === "awaiting_scenes_approval" && (
          <section className="panel space-y-6">
            <div className="step-title"><span>🎬</span><div><h2>காட்சி வாரியான வடிவமைப்பு (Scene Storyboard)</h2><p>ஒவ்வொரு காட்சிக்குமான வாக்கியம், சொற்கள் மற்றும் தேர்ந்தெடுக்கப்பட்ட வீடியோக்கள்.</p></div></div>
            {actualCost !== null && (
              <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 space-y-2 text-xs text-slate-400">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>தற்போதைய மொத்த கட்டணம் (Total Cost so far):</span>
                  <span className="text-amber-300">${actualCost.toFixed(5)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-2 text-[10px]">
                  <div>📝 Script: ${(costBreakdown.script || 0).toFixed(5)}</div>
                  <div>🎙️ TTS: ${(costBreakdown.tts || 0).toFixed(5)}</div>
                  <div>🏷️ Metadata: ${(costBreakdown.metadata || 0).toFixed(5)}</div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {scenes.map((scene) => {
                const kwVal = Array.isArray(scene.keywords) ? scene.keywords.join(", ") : "";
                const suggested = Array.isArray(scene.suggestions) ? scene.suggestions : [];
                return (
                  <div key={scene.index} className="rounded-xl border border-white/10 bg-slate-950/30 p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Scene {scene.index + 1} ({scene.seconds} விநாடி)</span>
                      {scene.searching && <span className="text-xs text-emerald-400">தேடுகிறது...</span>}
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-3">
                        <label className="block">
                          <span className="field-label text-slate-400">காட்சி வாக்கியம்</span>
                          <textarea
                            rows={2}
                            className="text-input text-sm resize-none"
                            value={scene.text}
                            onChange={(e) => {
                              const val = e.target.value;
                              setScenes(prev => prev.map(s => s.index === scene.index ? { ...s, text: val } : s));
                            }}
                          />
                        </label>
                        
                        <label className="block">
                          <span className="field-label text-slate-400">தேடல் சொற்கள் (Keywords - கமா மூலம் பிரிக்கவும்)</span>
                          <input
                            type="text"
                            className="text-input text-xs"
                            value={kwVal}
                            onChange={(e) => updateSceneKeywords(scene.index, e.target.value)}
                          />
                        </label>
                        
                        <div className="flex gap-2">
                          <input
                            type="text"
                            id={`search-input-${scene.index}`}
                            placeholder="Search alternative clip..."
                            className="text-input text-xs flex-1"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const input = document.getElementById(`search-input-${scene.index}`) as HTMLInputElement;
                                if (input) searchStockForScene(scene.index, input.value, "video");
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="choice text-xs py-1.5 px-3"
                            onClick={() => {
                              const input = document.getElementById(`search-input-${scene.index}`) as HTMLInputElement;
                              if (input) searchStockForScene(scene.index, input.value, "video");
                            }}
                          >
                            🔍 தேடு
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <span className="field-label text-slate-400">தேர்ந்தெடுக்கப்பட்ட காட்சி கிளிப்</span>
                        {scene.chosenAsset ? (
                          <div className="relative overflow-hidden rounded-lg border border-white/10 aspect-video bg-black">
                            {scene.chosenAsset.kind === "image" ? (
                              <img className="w-full h-full object-cover" src={toProxyUrl(scene.chosenAsset.previewUrl || scene.chosenAsset.url)} alt="chosen asset" />
                            ) : (
                              <video className="w-full h-full object-cover" src={toProxyUrl(scene.chosenAsset.url)} muted loop playsInline onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
                            )}
                            <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-slate-300 capitalize">{scene.chosenAsset.provider}</span>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/15 aspect-video flex items-center justify-center text-xs text-slate-500">கிளிப் எதுவும் இல்லை</div>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            className="choice text-[10px] py-1.5 px-3 flex-1 flex items-center justify-center gap-1.5 bg-violet-600/10 hover:bg-violet-600/25 border-violet-500/20 text-violet-300 font-semibold"
                            onClick={() => {
                              const input = document.getElementById(`scene-upload-input-${scene.index}`) as HTMLInputElement;
                              input?.click();
                            }}
                          >
                            ⬆️ சொந்த clip/image upload
                          </button>
                          <input
                            type="file"
                            id={`scene-upload-input-${scene.index}`}
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !projectId) return;
                              
                              setScenes(prev => prev.map(s => s.index === scene.index ? { ...s, searching: true } : s));
                              
                              const body = new FormData();
                              body.append("file", file);
                              body.append("sceneIndex", String(scene.index));
                              
                              try {
                                const response = await fetch(`/api/projects/${projectId}/scenes/upload`, {
                                  method: "POST",
                                  body
                                });
                                const data = await response.json();
                                if (!response.ok) throw new Error(data.error || "Upload failed");
                                
                                const updatedAsset = {
                                  ...data,
                                  url: `${data.url}&v=${Date.now()}`,
                                  previewUrl: data.previewUrl ? `${data.previewUrl}&v=${Date.now()}` : undefined
                                };
                                setScenes(prev => prev.map(s => s.index === scene.index ? {
                                  ...s,
                                  chosenAsset: updatedAsset,
                                  searching: false
                                } : s));
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "பதிவேற்றம் தோல்வியடைந்தது");
                                setScenes(prev => prev.map(s => s.index === scene.index ? { ...s, searching: false } : s));
                              }
                              
                              e.target.value = "";
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {suggested.length > 0 && (
                      <div className="space-y-1 pt-2">
                        <span className="text-[10px] uppercase font-bold text-slate-500">பரிந்துரைகள் (கிளிக் செய்து மாற்றவும்)</span>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                          {suggested.map((asset: any) => {
                            const isSelected = scene.chosenAsset && scene.chosenAsset.id === asset.id;
                            return (
                              <button
                                key={asset.id}
                                type="button"
                                onClick={() => chooseSceneAsset(scene.index, asset)}
                                className={`relative overflow-hidden rounded-md border shrink-0 w-24 aspect-video bg-black/50 transition ${isSelected ? "border-emerald-400 scale-[0.97]" : "border-white/5 hover:border-white/20"}`}
                              >
                                {asset.kind === "image" ? (
                                  <img className="w-full h-full object-cover" src={toProxyUrl(asset.previewUrl || asset.url)} alt="suggested thumbnail" />
                                ) : (
                                  <video className="w-full h-full object-cover" src={toProxyUrl(asset.url)} muted loop playsInline onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {scene.index < scenes.length - 1 && (
                      <div className="border-t border-white/5 pt-4 mt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">⚡ Scene {scene.index + 1} ➔ {scene.index + 2} Transition</span>
                          
                          <button
                            type="button"
                            disabled={renderingPreviewIndex !== null}
                            onClick={() => runTransitionPreview(scene.index, scene.transition)}
                            className="choice text-[10px] py-1 px-2.5 bg-violet-600/10 border border-violet-500/20 text-violet-300 hover:bg-violet-600/20 transition flex items-center gap-1"
                          >
                            {renderingPreviewIndex === scene.index ? "⚡ Rendering..." : "⚡ Preview Transition"}
                          </button>
                        </div>
                        
                        {/* Recommendations */}
                        <div className="rounded-lg bg-slate-900/60 p-3 space-y-2">
                          <span className="text-[10px] text-slate-400 block font-semibold uppercase">AI Recommended:</span>
                          <div className="flex flex-wrap gap-2">
                            {recommendTransitions({
                              currentScene: { keywords: scene.keywords },
                              nextScene: { keywords: scenes[scene.index + 1]?.keywords || [] },
                              videoStyle: form.videoStyle || "documentary"
                            }).map(rec => {
                              const isSelected = scene.transition?.id === rec.transitionId;
                              return (
                                <button
                                  key={rec.transitionId}
                                  type="button"
                                  onClick={() => {
                                    const preset = transitionPresets.find(p => p.id === rec.transitionId);
                                    setScenes(prev => prev.map(s => s.index === scene.index ? {
                                      ...s,
                                      transition: {
                                        id: rec.transitionId,
                                        durationFrames: preset?.defaultDurationFrames ?? 15,
                                        intensity: preset?.defaultIntensity ?? 0.5,
                                        direction: preset?.supportsDirection ? "left" : undefined
                                      }
                                    } : s));
                                  }}
                                  title={rec.reason}
                                  className={`text-[10px] px-2.5 py-1 rounded border transition ${isSelected ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-bold" : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"}`}
                                >
                                  {rec.transitionId.replace(/_/g, " ")} ({Math.round(rec.score * 100)}%)
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Presets Browser & Sliders */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="block">
                              <span className="text-[10px] text-slate-400 block font-semibold uppercase mb-1">Select Transition:</span>
                              <select
                                className="text-input text-xs"
                                value={scene.transition?.id || "cross_dissolve"}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  const preset = transitionPresets.find(p => p.id === id);
                                  setScenes(prev => prev.map(s => s.index === scene.index ? {
                                    ...s,
                                    transition: {
                                      id,
                                      durationFrames: preset?.defaultDurationFrames ?? 15,
                                      intensity: preset?.defaultIntensity ?? 0.5,
                                      direction: preset?.supportsDirection ? "left" : undefined
                                    }
                                  } : s));
                                }}
                              >
                                {transitionPresets.map(preset => (
                                  <option key={preset.id} value={preset.id}>
                                    [{preset.category.toUpperCase()}] {preset.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            {scene.transition?.direction !== undefined && (
                              <label className="block">
                                <span className="text-[10px] text-slate-400 block font-semibold uppercase mb-1">Direction:</span>
                                <div className="flex gap-1.5">
                                  {["left", "right", "up", "down"].map(dir => (
                                    <button
                                      key={dir}
                                      type="button"
                                      onClick={() => {
                                        setScenes(prev => prev.map(s => s.index === scene.index ? {
                                          ...s,
                                          transition: { ...s.transition, direction: dir }
                                        } : s));
                                      }}
                                      className={`text-[9px] px-2 py-0.5 rounded border transition uppercase ${scene.transition.direction === dir ? "bg-violet-500/20 border-violet-500/40 text-violet-300 font-bold" : "bg-white/5 border-white/5 text-slate-400"}`}
                                    >
                                      {dir}
                                    </button>
                                  ))}
                                </div>
                              </label>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div>
                              <div className="flex justify-between text-[10px] text-slate-400 uppercase font-semibold">
                                <span>Duration:</span>
                                <span className="text-slate-200">{scene.transition?.durationFrames || 15} frames ({( (scene.transition?.durationFrames || 15) / 30 ).toFixed(2)}s)</span>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={45}
                                step={1}
                                value={scene.transition?.durationFrames || 15}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setScenes(prev => prev.map(s => s.index === scene.index ? {
                                    ...s,
                                    transition: { ...s.transition, durationFrames: val }
                                  } : s));
                                }}
                                className="w-full accent-emerald-400 bg-white/5 h-1 rounded-lg cursor-pointer"
                              />
                            </div>

                            <div>
                              <div className="flex justify-between text-[10px] text-slate-400 uppercase font-semibold">
                                <span>Intensity / Speed:</span>
                                <span className="text-slate-200">{Math.round((scene.transition?.intensity || 0.5) * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min={0.1}
                                max={1.0}
                                step={0.05}
                                value={scene.transition?.intensity || 0.5}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setScenes(prev => prev.map(s => s.index === scene.index ? {
                                    ...s,
                                    transition: { ...s.transition, intensity: val }
                                  } : s));
                                }}
                                className="w-full accent-emerald-400 bg-white/5 h-1 rounded-lg cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {message && <div className="status">{message}</div>}
          </section>
        )}

        {status === "queued" && (
          <section className="panel space-y-4 text-center py-10">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
            <h2 className="mt-4 text-xl font-bold text-white">வீடியோ தயாராகிறது...</h2>
            <p className="text-sm text-slate-400">தயவுசெய்து காத்திருக்கவும். பில்டர் மற்றும் FFmpeg மூலம் வீடியோ இறுதி வடிவம் பெறுகிறது.</p>
            {message && <div className="mt-4 rounded-lg bg-white/5 p-3 text-xs text-slate-300">{message}</div>}
          </section>
        )}

        {(status === "complete" || status === "queued") && projectId !== null && (
          <>
            <section className="panel space-y-4">
              <div className="step-title"><span>✓</span><div><h2>உங்கள் review video தயாராகிவிட்டது</h2><p>Preview செய்து MP4 file-ஐ சேமிக்கலாம்</p></div></div>
              <video key={videoUrl} className="mx-auto max-h-[620px] w-full rounded-xl bg-black" src={videoUrl} controls playsInline />
              {actualCost !== null && (
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[.03] p-4 space-y-2 text-sm">
                  <div className="flex justify-between font-bold text-white">
                    <span>💵 இறுதி மொத்த கட்டணம் (Final Total API Cost):</span>
                    <span className="text-amber-300">${actualCost.toFixed(5)}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">
                    <div>Script: <span className="text-slate-200">${(costBreakdown.script || 0).toFixed(5)}</span></div>
                    <div>TTS: <span className="text-slate-200">${(costBreakdown.tts || 0).toFixed(5)}</span></div>
                    <div>Metadata: <span className="text-slate-200">${(costBreakdown.metadata || 0).toFixed(5)}</span></div>
                    <div>Keywords: <span className="text-slate-200">${(costBreakdown.keywords || 0).toFixed(5)}</span></div>
                  </div>
                  <div className="text-[10px] text-slate-500">மதிப்பீட்டு கட்டணம் (Estimated): ${estimatedCost?.toFixed(5) || "0.00000"}</div>
                </div>
              )}
              <a className="generate-button" href={`/api/projects/${projectId}/video?download=1`} download><span>MP4 video சேமிக்கவும்</span><b>↓</b></a>
              <div className="space-y-4 rounded-xl border border-red-400/20 bg-red-400/[.05] p-4">
                <p className="text-sm font-semibold text-slate-200">📤 YouTube-க்கு upload</p>
                {!ytStatus?.configured && <p className="text-xs leading-5 text-slate-400">YouTube upload செயல்பட <code className="rounded bg-white/10 px-1">YOUTUBE_CLIENT_ID</code> மற்றும் <code className="rounded bg-white/10 px-1">YOUTUBE_CLIENT_SECRET</code>-ஐ <code className="rounded bg-white/10 px-1">.env.local</code>-ல் சேர்த்து server-ஐ restart செய்யவும்.</p>}
                {ytStatus?.configured && !ytStatus.connected && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 font-semibold text-amber-300">⚠️ YouTube சேனல் இணைக்கப்படவில்லை.</p>
                    <p className="text-xs text-slate-400">வீடியோவை அப்லோட் செய்ய உங்கள் கூகிள் அக்கவுண்டை இணைக்கவும்:</p>
                    <a className="choice choice-active inline-block" href="/api/youtube/auth">🔗 YouTube-உடன் இணை</a>
                  </div>
                )}
                {ytStatus?.connected && ytStatus.channel && <>
                  <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3">
                    {ytStatus.channel.thumbnail && <img className="h-8 w-8 rounded-full" src={ytStatus.channel.thumbnail} alt="channel" />}
                    <div>
                      <p className="text-xs font-semibold text-slate-300">அப்லோட் செய்யப்படும் சேனல்:</p>
                      <p className="text-sm font-bold text-white">{ytStatus.channel.title}</p>
                    </div>
                  </div>
                  <label className="block"><span className="field-label">Video title</span><input className="text-input" value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder="Video-வின் தலைப்பு..." maxLength={100} /></label>
                  <label className="block"><span className="field-label">Description (விருப்பம் — காலியாக விட்டால் script பயன்படும்)</span><textarea className="text-input min-h-20 resize-y" value={ytDescription} onChange={(e) => setYtDescription(e.target.value)} placeholder="Video description..." /></label>
                  <div className="flex flex-wrap gap-2">{privacyOptions.map((option) => <button key={option.value} type="button" onClick={() => setYtPrivacy(option.value)} className={`choice ${ytPrivacy === option.value ? "choice-active" : ""}`}>{option.label}</button>)}</div>
                  <div className="space-y-3 rounded-lg border border-white/5 bg-white/5 p-4">
                    <p className="field-label text-slate-300">Thumbnail (விருப்பம்)</p>
                    
                    {/* Prompt Box */}
                    <div className="space-y-2 mt-2">
                      <label className="block">
                        <span className="text-[10px] text-slate-400 block font-semibold uppercase mb-1">Thumbnail Prompt (AI பட தயாரிப்புக்கான பிராம்ட் - மாற்றியமைக்கலாம்):</span>
                        <textarea
                          rows={2}
                          className="text-input text-xs font-mono"
                          value={thumbnailPrompt}
                          onChange={(e) => setThumbnailPrompt(e.target.value)}
                          placeholder="இங்கு உங்களது Thumbnail-க்கான AI Prompts-ஐ தட்டச்சு செய்யவும்..."
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(thumbnailPrompt);
                            alert("Prompt நகலெடுக்கப்பட்டது (Copied to Clipboard)!");
                          }}
                          className="choice text-[10px] py-1 px-3.5"
                        >
                          📋 Prompt காப்பி செய் (Copy)
                        </button>
                        <button
                          type="button"
                          disabled={generatingThumbnail || !thumbnailPrompt.trim()}
                          onClick={generateThumbnail}
                          className="choice choice-active text-[10px] py-1 px-3.5 bg-emerald-600 hover:bg-emerald-500 border-emerald-500/20 text-white"
                        >
                          {generatingThumbnail ? "⌛ உருவாக்குகிறது..." : "✨ AI மூலம் உருவாக்கு ($0.03)"}
                        </button>
                      </div>
                    </div>

                    {/* Image Preview & Existing Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        {hasThumb ? (
                          <img 
                            className="max-h-40 w-full rounded-lg border border-white/10 object-cover aspect-video" 
                            src={`/api/projects/${projectId}/thumbnail?v=${thumbVersion}`} 
                            alt="thumbnail" 
                            onError={(e) => {
                              if (thumbnailPath) {
                                e.currentTarget.src = `/api/media-proxy?path=${encodeURIComponent(thumbnailPath)}&v=${Date.now()}`;
                              }
                            }}
                          />
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/10 aspect-video flex items-center justify-center text-xs text-slate-500 p-4 text-center">
                            படம் எதுவும் இல்லை
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center gap-2">
                        <button type="button" className="choice justify-center py-2" disabled={thumbBusy} onClick={() => thumbInput.current?.click()}>
                          {thumbBusy ? "சேமிக்கிறது..." : "⬆️ Image upload"}
                        </button>
                        <button type="button" className="choice justify-center py-2" disabled={thumbBusy} onClick={grabThumbFromVideo}>
                          🎞️ Video-லிருந்து எடு
                        </button>
                        {hasThumb && (
                          <button type="button" className="choice justify-center py-2 text-rose-400 hover:bg-rose-500/10 border-rose-500/20" onClick={removeThumb}>
                            ❌ நீக்கு (Remove)
                          </button>
                        )}
                      </div>
                    </div>

                    <input ref={thumbInput} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadThumb(file); e.target.value = ""; }} />
                    <p className="text-[10px] text-slate-400 mt-1">JPG/PNG, 2MB வரை. Thumbnail இருந்தால் upload-உடன் தானாக YouTube-ல் அமைக்கப்படும்.</p>
                  </div>
                  <button type="button" onClick={uploadToYt} disabled={ytUploading} className="generate-button"><span>{ytUploading ? "Upload ஆகிறது..." : "YouTube-க்கு upload செய்"}</span><b>📤</b></button>
                  {ytResult && <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm">✅ Upload முடிந்தது ({ytResult.privacyStatus}) — <a className="font-semibold underline" href={ytResult.url} target="_blank" rel="noreferrer">{ytResult.url}</a>{ytResult.thumbnail === "set" && <p className="mt-1 text-xs">🖼️ Thumbnail-உம் அமைக்கப்பட்டது.</p>}{ytResult.thumbnail && ytResult.thumbnail !== "set" && ytResult.thumbnail !== "none" && <p className="mt-1 text-xs text-amber-300">⚠️ Video upload ஆனது, ஆனால் thumbnail: {ytResult.thumbnail}</p>}<p className="mt-1 text-xs text-slate-400">YouTube Studio-ல் சரிபார்த்து நீங்களே publish செய்யலாம்.</p></div>}
                </>}
              </div>
            </section>
            <section className="panel space-y-5"><div className="step-title"><span>✎</span><div><h2>Voice-over மற்றும் clips-ஐ சரிபார்க்கவும்</h2><p>Clip-ஐ click செய்தால் பெரிதாக பார்த்து மாற்றலாம்</p></div></div>
              <div><p className="field-label">Voice-over மட்டும் கேட்க</p><audio className="w-full" src={`/api/projects/${projectId}/audio`} controls preload="none" /></div>
              {clips.length > 0 && <div className="space-y-3"><p className="field-label">பயன்படுத்தப்பட்ட clips ({clips.length}) — மாற்ற ஒரு clip-ஐ click செய்யவும்</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{clips.map((clip) => <button key={clip.index} type="button" onClick={() => openClipEditor(clip.index)} className="group relative overflow-hidden rounded-lg border border-white/10 transition hover:border-white/40">{clip.kind === "image" ? <img className="aspect-video w-full bg-black object-cover" src={`${clip.url}?v=${clipVersion}`} alt={`clip ${clip.index + 1}`} /> : <video className="aspect-video w-full bg-black object-cover" src={`${clip.url}?v=${clipVersion}`} muted loop playsInline onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />}<span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 py-0.5 text-xs">{clip.kind === "image" ? "🖼️" : "🎬"} Clip {clip.index + 1}</span><span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold opacity-0 transition group-hover:opacity-100">மாற்று ✎</span></button>)}</div></div>}
              {pendingRender && <button type="button" onClick={rerender} disabled={rerendering} className="generate-button"><span>{rerendering ? "Render ஆகிறது..." : "புதிய clips-உடன் மீண்டும் render"}</span><b>⟳</b></button>}
            </section>
            <div className="pt-4">
              <button
                type="button"
                onClick={() => { setStatus("idle"); setMessage(""); setProjectId(null); }}
                className="generate-button bg-slate-800 hover:bg-slate-700 text-white"
              >
                <span>➕ புதிய வீடியோ உருவாக்கு (New Video)</span>
              </button>
            </div>
          </>
        )}
      </form>
      <aside className="lg:sticky lg:top-6 lg:self-start"><div className="panel overflow-hidden p-0"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Live preview</h2><p className="text-xs text-slate-500">{form.format} · {form.sourceType === "voiceover" ? (audioDurationSeconds !== null ? `${Math.round(audioDurationSeconds)}s` : "Auto") : form.duration}</p></div><span className={`rounded-full px-3 py-1 text-xs ${form.tier === "free" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{form.tier === "free" ? "🆓 Free" : "💎 Premium"}</span></div><div className="preview-wrap"><div className={`preview ${previewClass}`}><div className="preview-glow"/><div className="preview-content"><span className="preview-badge">{form.sourceType === "voiceover" ? "Voice-over" : form.stance}</span><div><p className="text-[10px] uppercase tracking-[.25em] text-white/60">{outputLanguageOptions.find((o) => o.value === form.outputLanguage)?.label} வீடியோ review</p><h3 className="mt-2 text-xl font-black leading-tight">உங்கள் கதையை<br/>உங்கள் பாணியில் சொல்லுங்கள்</h3><p className="mt-3 text-xs text-white/65">{form.sourceType === "voiceover" ? "உங்கள் voice-over" : `${form.tone} · ${form.persona}`}</p></div><div className="subtitle-demo">Subtitles இங்கே தோன்றும்</div></div></div></div><div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center"><div className="p-4"><b className="block">{form.format}</b><small>வடிவம்</small></div><div className="p-4"><b className="block">{form.sourceType === "voiceover" ? (audioDurationSeconds !== null ? `${Math.round(audioDurationSeconds)}s` : "Auto") : form.duration}</b><small>நீளம்</small></div><div className="p-4"><b className="block">{outputLanguageOptions.find((o) => o.value === form.outputLanguage)?.label}</b><small>Output</small></div></div></div><div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-sm leading-6 text-amber-100/70"><strong className="text-amber-200">குறிப்பு:</strong> Clip-ஐ click செய்து videos/images தேடி மாற்றலாம்; சொந்த image-ஐயும் upload செய்யலாம் — static image தானாக மெதுவாக zoom ஆகும்.</div></aside>
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
    {/* Floating Sticky Bottom Action Bar */}
    {(status === "awaiting_script_approval" || status === "awaiting_scenes_approval") && (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-slate-950/80 backdrop-blur-xl py-4 shadow-2xl">
        <div className="mx-auto max-w-[1500px] px-5 lg:px-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                {status === "awaiting_script_approval" ? "படிநிலை 1: ஸ்கிரிப்ட் திருத்தம்" : "படிநிலை 2: சீன் ஸ்டோரிபோர்டு"}
              </span>
              <span className="text-xs text-slate-300 font-medium">
                {status === "awaiting_script_approval" ? "AI எழுதிய தமிழ் உரையை சரிபார்க்கவும்" : "ஒவ்வொரு காட்சிக்குமான வீடியோக்களை சரிபார்க்கவும்"}
              </span>
            </div>
            {actualCost !== null && (
              <div className="border-l border-white/10 pl-4 py-1">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">சேர்ந்த கட்டணம் (Actual Cost)</span>
                <span className="text-sm font-bold text-amber-300">${actualCost.toFixed(5)}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3 font-semibold">
            {status === "awaiting_script_approval" && (
              <>
                <button
                  type="button"
                  onClick={() => { setStatus("idle"); setMessage(""); }}
                  className="choice text-xs py-2.5 px-4"
                >
                  ← ரத்து செய்
                </button>
                <button
                  type="button"
                  onClick={approveScript}
                  disabled={submittingScript}
                  className="generate-button !py-2.5 !px-6"
                >
                  <span>{submittingScript ? "அங்கீகரிக்கப்படுகிறது..." : "ஸ்குரிப்ட் ஒப்புதல் செய் & தொடரவும்"}</span>
                  <b>✓</b>
                </button>
              </>
            )}
            
            {status === "awaiting_scenes_approval" && (
              <>
                <button
                  type="button"
                  onClick={() => { setStatus("awaiting_script_approval"); setMessage(""); }}
                  className="choice text-xs py-2.5 px-4"
                >
                  ← ஸ்குரிப்ட் எடிட்டர்
                </button>
                <button
                  type="button"
                  onClick={approveScenes}
                  disabled={submittingScenes}
                  className="generate-button !py-2.5 !px-6"
                >
                  <span>{submittingScenes ? "வீடியோ தயாராகிறது..." : "சீன்கள் ஒப்புதல் செய் & வீடியோ உருவாக்கு"}</span>
                  <b>→</b>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}

    {/* Sliding Project History Drawer */}
    <div
      className={`fixed top-0 right-0 h-full w-full max-w-[460px] bg-slate-950/95 border-l border-white/10 backdrop-blur-2xl shadow-2xl z-50 transition-transform duration-300 transform p-6 flex flex-col ${
        isHistoryOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">📂 வீடியோ வரலாறு (Project History)</h2>
          <p className="text-xs text-slate-400">உருவாக்கிய முந்தைய திட்டங்கள் பட்டியல்</p>
        </div>
        <button
          type="button"
          onClick={() => setIsHistoryOpen(false)}
          className="choice !rounded-full !w-8 !h-8 flex items-center justify-center border border-white/10 hover:bg-white/10 text-slate-300 font-semibold"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
        {loadingHistory && (
          <div className="text-center py-8 text-slate-400 text-xs">
            <span className="animate-spin inline-block mr-2">⟳</span> வரலாறுகள் ஏற்றப்படுகின்றன...
          </div>
        )}
        {!loadingHistory && historyProjects.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-xs border border-dashed border-white/10 rounded-xl p-4">
            வரலாற்றில் முந்தைய திட்டங்கள் எதுவும் இல்லை.
          </div>
        )}
        {!loadingHistory &&
          historyProjects.map((p) => {
            const isCompleted = p.status === "complete";
            return (
              <div
                key={p.id}
                className="group relative rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/20 mb-2">
                      திட்டம் #{p.id}
                    </span>
                    <h3 className="font-semibold text-sm text-slate-200 line-clamp-2 leading-snug group-hover:text-white transition">
                      {p.review_script?.slice(0, 70) || p.transcript?.slice(0, 70) || "வீдео உரை..."}...
                    </h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-2">
                      <span>வடிவம்: <strong className="text-slate-300">{p.aspect_ratio || "9:16"}</strong></span>
                      <span>பாணி: <strong className="text-slate-300 capitalize">{p.video_style || "documentary"}</strong></span>
                      {p.actual_cost > 0 && (
                        <span>API கட்டணம்: <strong className="text-amber-300">${p.actual_cost.toFixed(5)}</strong></span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                      isCompleted
                        ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                        : p.status === "failed"
                        ? "bg-red-400/10 text-red-400 border border-red-400/20"
                        : "bg-amber-400/10 text-amber-300 border border-amber-300/25 animate-pulse"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>

                <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
                  <button
                    type="button"
                    onClick={() => loadProjectIntoWorkspace(p.id)}
                    className="choice text-[11px] flex-1 py-1.5 justify-center bg-violet-600/10 hover:bg-violet-600/20 border border-violet-500/20 text-violet-300"
                  >
                    👁️ Studio-வில் லோட் செய்
                  </button>
                  {isCompleted && (
                    <a
                      href={`/api/projects/${p.id}/video?download=1`}
                      download
                      className="choice text-[11px] flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-300"
                    >
                      📥 MP4 ↓
                    </a>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
    {/* Transition Preview Modal */}
    {previewVideoUrl && (
      <div className="fixed inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md z-50 p-4">
        <div className="w-full max-w-lg bg-slate-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>⚡ Transition Preview</span>
            </h3>
            <button
              type="button"
              onClick={() => setPreviewVideoUrl(null)}
              className="text-slate-400 hover:text-white text-sm"
            >
              ✕ Close
            </button>
          </div>
          
          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/5">
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              loop
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
          
          <div className="text-[10px] text-slate-400 leading-relaxed text-center">
            குறிப்பு: இது 3 விநாடி நீளமுள்ள அனிமேஷன் மற்றும் Whoosh ஆடியோ preview ஆகும்.
          </div>
        </div>
      </div>
    )}
  </main>;
}
