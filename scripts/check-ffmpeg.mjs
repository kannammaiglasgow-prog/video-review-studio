import { spawnSync } from "node:child_process";

const executable = process.env.FFMPEG_PATH || "ffmpeg";
const result = spawnSync(executable, ["-version"], { encoding: "utf8" });
if (result.error || result.status !== 0) {
  console.error("FFmpeg கிடைக்கவில்லை. FFmpeg install செய்து PATH-ல் சேர்க்கவும்.");
  process.exit(1);
}
console.log(result.stdout.split("\n")[0]);
