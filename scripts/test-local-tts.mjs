import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const executable = path.resolve(root, ".venv-local-tts/Scripts/piper.exe");
const model = path.resolve(root, "models/piper/ta_IN-rasa_female-medium.onnx");
const output = path.resolve(root, "media/piper-test.wav");

for (const [label, file] of [["Piper executable", executable], ["Tamil model", model]]) {
  if (!fs.existsSync(file)) {
    console.error(`${label} கிடைக்கவில்லை: ${file}`);
    process.exit(1);
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true });

const child = spawn(executable, ["--model", model, "--output_file", output], {
  windowsHide: true,
  stdio: ["pipe", "inherit", "inherit"],
  env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
});
child.stdin.end("வணக்கம். இது ரிவ்யூ ஸ்டுடியோவின் இலவச தமிழ் குரல் சோதனை.", "utf8");
child.on("error", (error) => { console.error(error.message); process.exit(1); });
child.on("close", (code) => {
  if (code !== 0 || !fs.existsSync(output)) process.exit(code || 1);
  console.log(`Tamil voice sample தயாராகிவிட்டது: ${output}`);
});
