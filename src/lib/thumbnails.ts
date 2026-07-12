import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

export function projectMediaDir(projectId: number) {
  return path.join(config.mediaRoot, String(projectId));
}

export function thumbnailPath(projectId: number) {
  for (const extension of [".jpg", ".png"]) {
    const filePath = path.join(projectMediaDir(projectId), `thumbnail${extension}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}
