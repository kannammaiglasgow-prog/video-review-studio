import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { config } from "@/lib/config";

const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

type StoredToken = { refreshToken: string; savedAt: string };
type ChannelInfo = { id: string; title: string; thumbnail?: string; customUrl?: string };

function oauthClient() {
  const { clientId, clientSecret } = config.youtubeOAuth;
  if (!clientId || !clientSecret) throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET .env.local-ல் சேர்க்கப்படவில்லை");
  return { clientId, clientSecret };
}

export function isYoutubeConfigured() {
  return Boolean(config.youtubeOAuth.clientId && config.youtubeOAuth.clientSecret);
}

export type ChannelType = "news" | "devotional" | "sanatana" | "story" | "english";

// Expected channel id for the English-stories channel (used to verify the right
// brand channel was connected during OAuth):
// https://studio.youtube.com/channel/UChYzuHgqdRL9AL5iNdJe9Ng ("English Stories")
export const ENGLISH_CHANNEL_ID = "UChYzuHgqdRL9AL5iNdJe9Ng";

function getTokenPath(channelType?: ChannelType) {
  if (channelType === "devotional") {
    return path.resolve(process.cwd(), "data/youtube-oauth-devotional.json");
  }
  if (channelType === "sanatana") {
    return path.resolve(process.cwd(), "data/youtube-oauth-sanatana.json");
  }
  if (channelType === "story") {
    return path.resolve(process.cwd(), "data/youtube-oauth-story.json");
  }
  if (channelType === "english") {
    return path.resolve(process.cwd(), "data/youtube-oauth-english.json");
  }
  return config.youtubeOAuth.tokenPath;
}

export function isYoutubeConnected(channelType?: ChannelType) {
  return fs.existsSync(getTokenPath(channelType));
}

export function youtubeAuthUrl(redirectUri: string, state: string) {
  const { clientId } = oauthClient();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  // select_account forces the account/brand-channel chooser (needed when one
  // Google account owns several channels, so the user can pick the exact one);
  // consent forces a fresh grant so the choice actually takes effect.
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeYoutubeCode(code: string, redirectUri: string, channelType?: ChannelType) {
  const { clientId, clientSecret } = oauthClient();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
  });
  const data = await response.json();
  if (!response.ok || !data.refresh_token) throw new Error(data?.error_description || "Google token exchange தோல்வியடைந்தது");
  const tokenPath = getTokenPath(channelType);
  await fsp.mkdir(path.dirname(tokenPath), { recursive: true });
  const stored: StoredToken = { refreshToken: data.refresh_token, savedAt: new Date().toISOString() };
  await fsp.writeFile(tokenPath, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function accessToken(channelType?: ChannelType) {
  const { clientId, clientSecret } = oauthClient();
  const tokenPath = getTokenPath(channelType);
  if (!fs.existsSync(tokenPath)) throw new Error("YouTube இணைக்கப்படவில்லை — முதலில் 'YouTube-உடன் இணை' செய்யவும்");
  const stored = JSON.parse(await fsp.readFile(tokenPath, "utf8")) as StoredToken;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: stored.refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    if (data?.error === "invalid_grant") {
      await fsp.rm(tokenPath, { force: true });
      throw new Error("YouTube அனுமதி காலாவதியாகிவிட்டது — மீண்டும் இணைக்கவும்");
    }
    throw new Error(data?.error_description || "YouTube token refresh தோல்வியடைந்தது");
  }
  return data.access_token as string;
}

export async function youtubeChannelInfo(channelType?: ChannelType): Promise<ChannelInfo> {
  const token = await accessToken(channelType);
  const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Channel தகவல் எடுக்க முடியவில்லை");
  const channel = data.items?.[0];
  if (!channel) throw new Error("இந்த account-ல் YouTube channel இல்லை");
  return { id: channel.id, title: channel.snippet?.title || "YouTube channel", thumbnail: channel.snippet?.thumbnails?.default?.url, customUrl: channel.snippet?.customUrl };
}

export async function disconnectYoutube(channelType?: ChannelType) {
  const tokenPath = getTokenPath(channelType);
  // Revoke the grant at Google first, so the NEXT connect shows a fresh consent
  // + brand-channel picker (essential for a Google account with several channels
  // — otherwise Google silently auto-approves to the primary channel).
  try {
    if (fs.existsSync(tokenPath)) {
      const stored = JSON.parse(await fsp.readFile(tokenPath, "utf8")) as StoredToken;
      if (stored?.refreshToken) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.refreshToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }).catch(() => {});
      }
    }
  } catch {
    /* ignore — still delete the local token below */
  }
  await fsp.rm(tokenPath, { force: true });
}

export async function setYoutubeThumbnail(videoId: string, filePath: string, channelType?: ChannelType) {
  const token = await accessToken(channelType);
  const data = await fsp.readFile(filePath);
  if (data.length > 2 * 1024 * 1024) throw new Error("Thumbnail 2MB-க்கு குறைவாக இருக்க வேண்டும்");
  const mime = /\.png$/i.test(filePath) ? "image/png" : "image/jpeg";
  const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mime, "Content-Length": String(data.length) },
    body: new Uint8Array(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 403) throw new Error("Thumbnail அமைக்க channel-ல் phone verification தேவை — youtube.com/verify-ல் verify செய்யவும்");
    throw new Error(error?.error?.message || `Thumbnail அமைக்க முடியவில்லை (${response.status})`);
  }
}

export type YoutubeUploadInput = { filePath: string; title: string; description: string; tags?: string[]; privacyStatus: "private" | "unlisted" | "public"; language?: "ta" | "en" };

export async function uploadToYoutube(input: YoutubeUploadInput, channelType?: ChannelType) {
  const token = await accessToken(channelType);
  const size = fs.statSync(input.filePath).size;
  const lang = input.language || "ta";
  const metadata = {
    snippet: { title: input.title.slice(0, 100), description: input.description.slice(0, 4900), tags: (input.tags || []).slice(0, 20), categoryId: "25", defaultLanguage: lang, defaultAudioLanguage: lang },
    status: { privacyStatus: input.privacyStatus, selfDeclaredMadeForKids: false },
  };
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    const error = await start.json().catch(() => ({}));
    throw new Error(error?.error?.message || `YouTube upload session தொடங்க முடியவில்லை (${start.status})`);
  }
  const location = start.headers.get("location");
  if (!location) throw new Error("YouTube upload URL கிடைக்கவில்லை");
  const uploadBody = Readable.toWeb(fs.createReadStream(input.filePath)) as ReadableStream;
  const uploadInit: RequestInit & { duplex: "half" } = { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(size) }, body: uploadBody, duplex: "half" };
  const upload = await fetch(location, uploadInit);
  const result = await upload.json().catch(() => ({}));
  if (!upload.ok || !result.id) throw new Error(result?.error?.message || `YouTube upload தோல்வியடைந்தது (${upload.status})`);
  return { videoId: result.id as string, url: `https://youtu.be/${result.id}`, privacyStatus: input.privacyStatus };
}
