import path from "node:path";

const root = process.cwd();

export const config = {
  databasePath: path.resolve(root, process.env.DATABASE_PATH || "data/review-studio.sqlite"),
  mediaRoot: path.resolve(root, process.env.MEDIA_ROOT || "media"),
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  ytdlpPath: process.env.YTDLP_PATH || "yt-dlp",
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
    googleTts: Boolean(config.api.googleCloudProject && process.env.GOOGLE_APPLICATION_CREDENTIALS),
  };
}
