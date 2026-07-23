import { isAutoNewsEnabled, runAutoShortsPipeline, isAutoShortsEnabled, runSelectedRegionsAutoNews, getAutoNewsSchedule } from "./auto-news";
import { getAutoStorySettings, runAutoStoryPipeline, type StoryChannel } from "./auto-story";

let lastNewsRunKey = "";
let shortsSlotIndex = 0;
let lastShortsRunKey = "";
const lastStoryRunKey: Record<StoryChannel, string> = { story: "", english: "" };
let storyRunInProgress = false;

function pad(n: number) { return n.toString().padStart(2, "0"); }

function checkAndRun() {
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateKey = now.toDateString();
  const schedule = getAutoNewsSchedule();

  // ── Long-form news: configurable times (default 08:00 & 15:00) ────────────
  const newsRunKey = `${dateKey}-${hhmm}`;
  if (schedule.longVideoTimes.includes(hhmm) && lastNewsRunKey !== newsRunKey) {
    lastNewsRunKey = newsRunKey;
    if (!isAutoNewsEnabled()) {
      console.log(`[Scheduler] News automation is OFF. Skipping ${hhmm}.`);
    } else {
      console.log(`[Scheduler] ⏰ News trigger at ${hhmm} — regions: ${schedule.selectedRegions.join(", ")}`);
      runSelectedRegionsAutoNews(schedule.selectedRegions).catch(err => console.error("[Scheduler] News error:", err));
    }
  }

  // ── Shorts: configurable times (default 10/day) ────────────────────────────
  const shortsRunKey = `${dateKey}-${hhmm}`;
  if (schedule.shortsTimes.includes(hhmm) && lastShortsRunKey !== shortsRunKey) {
    lastShortsRunKey = shortsRunKey;
    if (!isAutoShortsEnabled()) {
      console.log(`[Scheduler] Shorts automation is OFF. Skipping ${hhmm}.`);
    } else {
      const slot = schedule.shortsTimes.indexOf(hhmm);
      console.log(`[Scheduler] 📱 Shorts trigger at ${hhmm} — Slot ${slot}`);
      runAutoShortsPipeline(slot >= 0 ? slot : shortsSlotIndex++).catch(err => console.error("[Scheduler] Shorts error:", err));
    }
  }

  // ── Story-channel Idea Engine (Tamil Story + English Stories) ──────────────
  // Runs are heavy (script + TTS + render, several minutes each) so they're
  // serialized one-at-a-time rather than overlapped if both channels' times coincide.
  for (const channel of ["story", "english"] as StoryChannel[]) {
    const runKey = `${dateKey}-${hhmm}`;
    const settings = getAutoStorySettings(channel);
    if (settings.times.includes(hhmm) && lastStoryRunKey[channel] !== runKey) {
      lastStoryRunKey[channel] = runKey;
      if (!settings.enabled) {
        console.log(`[Scheduler] Story automation (${channel}) is OFF. Skipping ${hhmm}.`);
      } else if (storyRunInProgress) {
        console.log(`[Scheduler] Story automation (${channel}) skipped at ${hhmm} — another story run is still in progress.`);
      } else {
        console.log(`[Scheduler] 📖 Story Idea Engine trigger (${channel}) at ${hhmm}`);
        storyRunInProgress = true;
        runAutoStoryPipeline(channel)
          .catch(err => console.error(`[Scheduler] Story error (${channel}):`, err))
          .finally(() => { storyRunInProgress = false; });
      }
    }
  }
}

console.log("[Scheduler] 🟢 Auto News + Shorts + Story Idea Engine Scheduler started!");
console.log("[Scheduler] Schedule is configurable via /auto-news (News/Shorts) and each channel's dashboard page (Story/English) — reads times fresh from DB every minute.");

checkAndRun();
setInterval(checkAndRun, 60000); // check every minute
