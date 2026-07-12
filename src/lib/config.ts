import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function defaultFfprobePath(ffmpegPath: string) {
  if (/ffmpeg(\.exe)?$/i.test(ffmpegPath)) return ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (_match, ext) => `ffprobe${ext || ""}`);
  return "ffprobe";
}

const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

export type OutputLanguage = "ta" | "en" | "hi";

export const config = {
  databasePath: path.resolve(root, process.env.DATABASE_PATH || "data/review-studio.sqlite"),
  mediaRoot: path.resolve(root, process.env.MEDIA_ROOT || "media"),
  ffmpegPath,
  ffprobePath: process.env.FFPROBE_PATH || defaultFfprobePath(ffmpegPath),
  ytdlpPath: process.env.YTDLP_PATH || "yt-dlp",
  piper: {
    executablePath: path.resolve(root, process.env.PIPER_EXECUTABLE_PATH || ".venv-local-tts/Scripts/piper.exe"),
    models: {
      ta: path.resolve(root, process.env.PIPER_MODEL_PATH_TA || process.env.PIPER_MODEL_PATH || "models/piper/ta_IN-rasa_female-medium.onnx"),
      en: path.resolve(root, process.env.PIPER_MODEL_PATH_EN || "models/piper/en_US-lessac-medium.onnx"),
      hi: path.resolve(root, process.env.PIPER_MODEL_PATH_HI || "models/piper/hi_IN-rohan-medium.onnx"),
    } satisfies Record<OutputLanguage, string>,
  },
  api: {
    gemini: process.env.GEMINI_API_KEY,
    pexels: process.env.PEXELS_API_KEY,
    pixabay: process.env.PIXABAY_API_KEY,
    youtube: process.env.YOUTUBE_API_KEY,
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT_ID,
  },
  youtubeOAuth: {
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    tokenPath: path.resolve(root, process.env.YOUTUBE_TOKEN_PATH || "data/youtube-oauth.json"),
  },
};

export function integrationStatus() {
  return {
    gemini: Boolean(config.api.gemini),
    pexels: Boolean(config.api.pexels),
    pixabay: Boolean(config.api.pixabay),
    youtube: Boolean(config.api.youtube),
    youtubeOAuthConfigured: Boolean(config.youtubeOAuth.clientId && config.youtubeOAuth.clientSecret),
    youtubeOAuthConnected: fs.existsSync(config.youtubeOAuth.tokenPath),
    googleTts: Boolean(config.api.googleCloudProject && process.env.GOOGLE_APPLICATION_CREDENTIALS),
    localTts: fs.existsSync(config.piper.executablePath) && fs.existsSync(config.piper.models.ta),
    localTtsLanguages: (Object.keys(config.piper.models) as OutputLanguage[]).filter((language) => fs.existsSync(config.piper.models[language])),
  };
}
