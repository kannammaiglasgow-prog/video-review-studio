import { runAllRegionsAutoNews, isAutoNewsEnabled, runAutoShortsPipeline, isAutoShortsEnabled } from "./auto-news";

let lastNewsRun = "";
let shortsHourIndex = 0;
let lastShortsRun = "";

function pad(n: number) { return n.toString().padStart(2, "0"); }

function checkAndRun() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const dateKey = now.toDateString();
  const hourKey = `${dateKey}-${pad(hours)}`;

  // ── Long-form news: 8 AM & 3 PM ───────────────────────────────────────────
  if ((hours === 8 || hours === 15) && minutes === 0 && lastNewsRun !== hourKey) {
    lastNewsRun = hourKey;
    if (!isAutoNewsEnabled()) {
      console.log(`[Scheduler] News automation is OFF. Skipping ${hours}:00.`);
    } else {
      console.log(`[Scheduler] ⏰ News trigger at ${hours}:00 — Starting...`);
      runAllRegionsAutoNews().catch(err => console.error("[Scheduler] News error:", err));
    }
  }

  // ── Shorts: every hour (10 shorts per day across all 5 regions) ───────────
  if (minutes === 0 && lastShortsRun !== hourKey) {
    lastShortsRun = hourKey;
    if (!isAutoShortsEnabled()) {
      console.log(`[Scheduler] Shorts automation is OFF. Skipping hour ${hours}.`);
    } else {
      console.log(`[Scheduler] 📱 Shorts trigger at ${hours}:00 — Slot ${shortsHourIndex}`);
      const currentSlot = shortsHourIndex;
      shortsHourIndex = (shortsHourIndex + 1) % 10;
      runAutoShortsPipeline(currentSlot).catch(err => console.error("[Scheduler] Shorts error:", err));
    }
  }
}

console.log("[Scheduler] 🟢 Auto News + Shorts Scheduler started!");
console.log("[Scheduler] News Schedule : 8:00 AM & 3:00 PM (UK time) — 5 regions");
console.log("[Scheduler] Shorts Schedule: Every hour — 10 Shorts/day — all regions combined");

checkAndRun();
setInterval(checkAndRun, 60000); // check every minute
