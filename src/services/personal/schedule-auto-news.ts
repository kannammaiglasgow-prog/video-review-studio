import { isAutoNewsEnabled, runAutoShortsPipeline, isAutoShortsEnabled, runSelectedRegionsAutoNews, getAutoNewsSchedule } from "./auto-news";
import { getAutoStorySettings, runAutoStoryPipeline, type StoryChannel } from "./auto-story";

let lastNewsRunKey = "";
let shortsSlotIndex = 0;
let lastShortsRunKey = "";
const lastStoryRunKey: Record<StoryChannel, string> = { story: "", english: "", devotional: "" };
const lastStoryShortsRunKey: Record<StoryChannel, string> = { story: "", english: "", devotional: "" };
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
  // Runs are heavy (script + TTS + render, several minutes each) so long-form
  // and Shorts are serialized one-at-a-time (shared flag) rather than overlapped
  // if multiple channels/formats' times coincide.
  for (const channel of ["story", "english", "devotional"] as StoryChannel[]) {
    const runKey = `${dateKey}-${hhmm}`;
    const settings = getAutoStorySettings(channel);

    if (settings.times.includes(hhmm) && lastStoryRunKey[channel] !== runKey) {
      lastStoryRunKey[channel] = runKey;
      if (!settings.enabled) {
        console.log(`[Scheduler] Story automation (${channel}) is OFF. Skipping ${hhmm}.`);
      } else if (storyRunInProgress) {
        console.log(`[Scheduler] Story automation (${channel}) skipped at ${hhmm} — another story run is still in progress.`);
      } else {
        console.log(`[Scheduler] 📖 Story Idea Engine trigger (${channel}, long) at ${hhmm}`);
        storyRunInProgress = true;
        runAutoStoryPipeline(channel, "long")
          .catch(err => console.error(`[Scheduler] Story error (${channel}, long):`, err))
          .finally(() => { storyRunInProgress = false; });
      }
    }

    if (settings.shortsTimes.includes(hhmm) && lastStoryShortsRunKey[channel] !== runKey) {
      lastStoryShortsRunKey[channel] = runKey;
      if (!settings.shortsEnabled) {
        console.log(`[Scheduler] Story Shorts automation (${channel}) is OFF. Skipping ${hhmm}.`);
      } else if (storyRunInProgress) {
        console.log(`[Scheduler] Story Shorts automation (${channel}) skipped at ${hhmm} — another story run is still in progress.`);
      } else {
        console.log(`[Scheduler] 📱 Story Idea Engine trigger (${channel}, short) at ${hhmm}`);
        storyRunInProgress = true;
        runAutoStoryPipeline(channel, "short")
          .catch(err => console.error(`[Scheduler] Story error (${channel}, short):`, err))
          .finally(() => { storyRunInProgress = false; });
      }
    }
  }
}

console.log("[Scheduler] 🟢 Auto News + Shorts + Story Idea Engine Scheduler started!");
console.log("[Scheduler] Schedule is configurable via /auto-news (News/Shorts) and each channel's dashboard page (Story/English) — reads times fresh from DB every minute.");

checkAndRun();
setInterval(checkAndRun, 60000); // check every minute
