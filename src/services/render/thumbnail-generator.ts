import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { config } from "@/lib/config";
import { database } from "@/lib/database";
import { searchStockImages } from "../providers/stock-media";

// Helper to balance Tamil title into two lines
export function splitTamilTitle(title: string): { line1: string; line2: string } {
  const separators = ["|", "—", "-"];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep).map(p => p.trim());
      return { line1: parts[0], line2: parts[1] || "" };
    }
  }
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return { line1: title, line2: "" };
  }
  const mid = Math.ceil(words.length / 2);
  return {
    line1: words.slice(0, mid).join(" "),
    line2: words.slice(mid).join(" ")
  };
}

export interface ThumbnailOptions {
  projectId: number;
  keyword: string;
  title: string;
  footerText?: string;
  aspectRatio?: "9:16" | "16:9";
}

export async function generateAutoThumbnail(options: ThumbnailOptions): Promise<string> {
  const db = database();
  const projectId = options.projectId;
  const aspect = options.aspectRatio || "16:9";
  const orientation = aspect === "9:16" ? "portrait" : "landscape";
  const { line1, line2 } = splitTamilTitle(options.title);
  
  // Default footer text
  const dateStr = new Date().toLocaleDateString("ta-IN", { day: "numeric", month: "long", year: "numeric" });
  const footerText = options.footerText || `செய்திகள்  |  ${dateStr}  |  காலை செய்திகள்`;

  const projectDir = path.join(config.mediaRoot, "projects", String(projectId));
  await fs.mkdir(projectDir, { recursive: true });
  
  const bgPath = path.join(projectDir, "bg_temp.jpg").replaceAll("\\", "/");
  const htmlPath = path.join(projectDir, "thumbnail_temp.html").replaceAll("\\", "/");
  const localFileName = `thumbnail_${Date.now()}.jpg`;
  const outputPath = path.join(projectDir, localFileName).replaceAll("\\", "/");

  console.log(`[AutoThumbnail] Generating for project #${projectId} with title "${options.title}"`);

  // 1. Search stock images based on the keyword
  let bgUrl = "";
  try {
    const searchTerms = [options.keyword, "abstract background", "spiritual background", "news studio"];
    for (const term of searchTerms) {
      if (!term) continue;
      const images = await searchStockImages(term, orientation, 5).catch(() => []);
      if (images && images.length > 0) {
        // Choose a random one from top 3 for variety
        const idx = Math.floor(Math.random() * Math.min(images.length, 3));
        bgUrl = images[idx].url;
        break;
      }
    }
  } catch (err) {
    console.error("[AutoThumbnail] Stock image search failed:", err);
  }

  // Fallback if no URL is found: use a solid grey color in HTML
  let useSolidBg = !bgUrl;

  // 2. Download background image
  if (bgUrl) {
    try {
      const response = await fetch(bgUrl, { signal: AbortSignal.timeout(60_000) });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(bgPath, buffer);
        console.log(`[AutoThumbnail] Background image downloaded successfully`);
      } else {
        useSolidBg = true;
      }
    } catch (err) {
      console.warn("[AutoThumbnail] Background download failed, using solid fallback:", err);
      useSolidBg = true;
    }
  }

  // 3. Write HTML file for layout
  const bgStyle = useSolidBg 
    ? "background: linear-gradient(135deg, #1e0b36 0%, #0d041e 100%);"
    : `background-image: url('bg_temp.jpg'); background-size: cover; background-position: center;`;

  const canvasWidth = aspect === "9:16" ? 720 : 1280;
  const canvasHeight = aspect === "9:16" ? 1280 : 720;
  
  // Custom font styling variables depending on aspect ratio
  const titleFontSize = aspect === "9:16" ? "80px" : "130px";
  const bottomOffset = aspect === "9:16" ? "140px" : "90px";
  const footerHeight = aspect === "9:16" ? "90px" : "65px";
  const footerFontSize = aspect === "9:16" ? "20px" : "26px";

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Mukta+Malar:wght@800&display=swap');
  body {
    margin: 0;
    padding: 0;
    width: ${canvasWidth}px;
    height: ${canvasHeight}px;
    ${bgStyle}
    font-family: 'Mukta Malar', sans-serif;
    color: white;
    overflow: hidden;
    position: relative;
  }
  /* Shadow overlay for contrast */
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0.4) 100%);
  }
  .title-container {
    position: absolute;
    bottom: ${bottomOffset};
    left: 40px;
    right: 40px;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }
  .title-1 {
    font-size: ${titleFontSize};
    font-weight: 800;
    color: white;
    text-shadow: 
      -4px -4px 0 #000,  
       4px -4px 0 #000,
      -4px  4px 0 #000,
       4px  4px 0 #000,
       0px 0px 30px rgba(255, 0, 0, 0.9),
       0px 0px 15px rgba(255, 0, 0, 0.9);
    line-height: 1.15;
    letter-spacing: 1px;
    word-break: keep-all;
  }
  .title-2 {
    font-size: ${titleFontSize};
    font-weight: 800;
    color: #ffe600; /* Yellow */
    text-shadow: 
      -4px -4px 0 #000,  
       4px -4px 0 #000,
      -4px  4px 0 #000,
       4px  4px 0 #000,
       0px 0px 30px rgba(255, 0, 0, 0.9),
       0px 0px 15px rgba(255, 0, 0, 0.9);
    line-height: 1.15;
    letter-spacing: 1px;
    margin-top: 10px;
    word-break: keep-all;
  }
  .footer {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: ${footerHeight};
    background-color: #0b0f1e;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${footerFontSize};
    color: white;
    font-weight: 800;
    letter-spacing: 1px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 10;
  }
</style>
</head>
<body>
  <div class="overlay"></div>
  <div class="title-container">
    <div class="title-1">${line1}</div>
    ${line2 ? `<div class="title-2">${line2}</div>` : ""}
  </div>
  <div class="footer">
    ${footerText}
  </div>
</body>
</html>`;

  await fs.writeFile(htmlPath, htmlContent, "utf8");

  // 4. Invoke Headless Chrome to capture screenshot
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const chromeProfileDir = path.join(config.mediaRoot, ".thumbnail-chrome-profile").replaceAll("\\", "/");
  const cmd = `"${chromePath}" --headless --disable-gpu --user-data-dir="${chromeProfileDir}" --no-first-run --virtual-time-budget=8000 --screenshot="${outputPath}" --window-size=${canvasWidth},${canvasHeight} "file:///${htmlPath}"`;

  await new Promise<void>((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // 5. Clean up temporary files
  await fs.unlink(htmlPath).catch(() => {});
  if (!useSolidBg) {
    await fs.unlink(bgPath).catch(() => {});
  }

  // 6. Update database path
  db.prepare("UPDATE projects SET thumbnail_path=? WHERE id=?").run(outputPath, projectId);
  console.log(`[AutoThumbnail] Output thumbnail generated successfully at: ${outputPath}`);

  return outputPath;
}
