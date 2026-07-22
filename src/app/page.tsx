"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoStyleConfig } from "@/lib/config";

export default function StyleSelection() {
  const [styles, setStyles] = useState<VideoStyleConfig[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string>("documentary");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/styles")
      .then((r) => r.json())
      .then((data) => {
        setStyles(data.styles || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleContinue = () => {
    router.push(`/create?style=${selectedStyle}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="logo-mark">▶</div>
            <div>
              <p className="text-lg font-bold tracking-tight">Video Style & Format Selection</p>
              <p className="text-xs text-slate-400">வீடியோ உருவாக்கத்திற்கான பாணியைத் தேர்ந்தெடுக்கவும்</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/sivan-arul")}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 border border-orange-500/20 text-white transition flex items-center gap-1.5"
            >
              🕉️ சிவன் அருள் (Sivan Arul)
            </button>
            <button
              onClick={() => router.push("/sivan-arul/story-to-video")}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-pink-500 hover:from-violet-500 hover:to-pink-400 border border-violet-500/20 text-white transition flex items-center gap-1.5"
            >
              📖 Story to Video
            </button>
            <button
              onClick={() => router.push("/auto-news")}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition flex items-center gap-1.5"
            >
              📰 செய்தி ஆட்டோமேஷன் (Auto News)
            </button>
            <button
              onClick={() => router.push("/create")}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition flex items-center gap-1.5"
            >
              📂 கடைசித் திட்டம் (Last Project)
            </button>
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Local mode
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1500px] px-5 py-10 lg:px-10 flex flex-col justify-between">
        <section className="text-center max-w-3xl mx-auto mb-10">
          <p className="eyebrow">உருவாக்கப் பாணி</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
            வீடியோ தயாரிப்பு பாணி (Video Style)
          </h1>
          <p className="mt-4 text-slate-400 text-sm sm:text-base leading-7">
            உங்கள் வீடியோ எந்தப் பாணியில் அமைய வேண்டும் என்பதைத் தேர்ந்தெடுக்கவும். நீங்கள் தேர்ந்தெடுக்கும் பாணியானது அதன் ஸ்கிரிப்ட் கட்டமைப்பு, கேமரா அசைவு, இசை மற்றும் எடிட்டிங் முறையைக் கட்டுப்படுத்தும்.
          </p>
        </section>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-400/25 border-t-violet-400" />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {styles.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => setSelectedStyle(style.id)}
                className={`flex flex-col text-left p-6 rounded-2xl border transition-all duration-300 relative group overflow-hidden ${
                  selectedStyle === style.id
                    ? "border-violet-500 bg-violet-950/20 shadow-lg shadow-violet-950/30 scale-[1.02]"
                    : "border-white/5 bg-slate-900/40 hover:border-white/10 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-4xl">{style.icon}</span>
                  <div className="flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-0.5 text-[10px] text-violet-300 font-semibold">
                    Retention: {style.estimatedViewerRetention}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-2 group-hover:text-violet-300 transition-colors">
                  {style.name}
                </h3>
                <p className="text-xs text-slate-400 leading-5 mb-4 flex-1">
                  {style.description}
                </p>
                <div className="border-t border-white/5 pt-3 mt-auto w-full">
                  <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold">Example Use Cases</p>
                  <div className="flex flex-wrap gap-1.5">
                    {style.exampleUseCases.map((useCase: string, idx: number) => (
                      <span key={idx} className="bg-white/5 rounded px-2 py-0.5 text-[9px] text-slate-300">
                        {useCase}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-12 flex justify-center sticky bottom-6 z-10">
          <button
            onClick={handleContinue}
            disabled={loading}
            className="px-8 py-4 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-extrabold rounded-full shadow-lg shadow-violet-600/30 transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-2 text-base"
          >
            தொடரவும் (Continue to Generate Video)
            <span className="text-xl">→</span>
          </button>
        </div>
      </main>
    </div>
  );
}
