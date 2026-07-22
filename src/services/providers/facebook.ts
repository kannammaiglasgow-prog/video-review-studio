import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

// Facebook Graph API — upload a rendered video to a Facebook Page the user
// manages. Personal-profile video upload via the API is not supported by Meta;
// Pages are. See setup steps in handover_notes.md / ask the user for their
// Meta Developer App credentials before this can be used.
const GRAPH_VERSION = "v19.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const GRAPH_VIDEO = `https://graph-video.facebook.com/${GRAPH_VERSION}`;

export type FacebookPage = { id: string; name: string; accessToken: string };
type StoredFacebookToken = { userAccessToken: string; pages: FacebookPage[]; savedAt: string };

function oauthClient() {
  const { appId, appSecret } = config.facebookOAuth;
  if (!appId || !appSecret) throw new Error("FACEBOOK_APP_ID / FACEBOOK_APP_SECRET .env.local-ல் சேர்க்கப்படவில்லை");
  return { appId, appSecret };
}

export function isFacebookConfigured() {
  return Boolean(config.facebookOAuth.appId && config.facebookOAuth.appSecret);
}

export function isFacebookConnected() {
  return fs.existsSync(config.facebookOAuth.tokenPath);
}

export function facebookAuthUrl(redirectUri: string, state: string) {
  const { appId } = oauthClient();
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  // pages_show_list: list the pages the user administers.
  // pages_manage_posts: required to publish a video to a Page.
  url.searchParams.set("scope", "pages_show_list,pages_manage_posts,pages_read_engagement");
  return url.toString();
}

async function readStoredToken(): Promise<StoredFacebookToken> {
  const tokenPath = config.facebookOAuth.tokenPath;
  if (!fs.existsSync(tokenPath)) throw new Error("Facebook இணைக்கப்படவில்லை — முதலில் Connect செய்யவும்");
  return JSON.parse(await fsp.readFile(tokenPath, "utf8")) as StoredFacebookToken;
}

/** code -> short-lived user token -> long-lived user token -> list of managed Pages + their (effectively long-lived) Page access tokens. */
export async function exchangeFacebookCode(code: string, redirectUri: string): Promise<FacebookPage[]> {
  const { appId, appSecret } = oauthClient();

  const shortUrl = new URL(`${GRAPH}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", appId);
  shortUrl.searchParams.set("redirect_uri", redirectUri);
  shortUrl.searchParams.set("client_secret", appSecret);
  shortUrl.searchParams.set("code", code);
  const shortRes = await fetch(shortUrl.toString());
  const shortData = await shortRes.json();
  if (!shortRes.ok || !shortData.access_token) throw new Error(shortData?.error?.message || "Facebook token exchange தோல்வி");

  const longUrl = new URL(`${GRAPH}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", appId);
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("fb_exchange_token", shortData.access_token);
  const longRes = await fetch(longUrl.toString());
  const longData = await longRes.json();
  const userAccessToken = longRes.ok && longData.access_token ? longData.access_token : shortData.access_token;

  const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`);
  const pagesData = await pagesRes.json();
  if (!pagesRes.ok) throw new Error(pagesData?.error?.message || "Facebook Pages எடுக்க முடியவில்லை");
  const pages: FacebookPage[] = (pagesData.data || []).map((p: { id: string; name: string; access_token: string }) => ({ id: p.id, name: p.name, accessToken: p.access_token }));
  if (pages.length === 0) throw new Error("இந்த Facebook account-ல் நீங்கள் admin ஆக இருக்கும் Page எதுவும் இல்லை");

  const stored: StoredFacebookToken = { userAccessToken, pages, savedAt: new Date().toISOString() };
  const tokenPath = config.facebookOAuth.tokenPath;
  await fsp.mkdir(path.dirname(tokenPath), { recursive: true });
  await fsp.writeFile(tokenPath, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
  return pages;
}

export async function listFacebookPages(): Promise<FacebookPage[]> {
  const stored = await readStoredToken();
  return stored.pages;
}

export async function disconnectFacebook() {
  await fsp.rm(config.facebookOAuth.tokenPath, { force: true });
}

export async function uploadToFacebook(input: { filePath: string; pageId: string; title: string; description: string }) {
  const pages = await listFacebookPages();
  const page = pages.find((p) => p.id === input.pageId);
  if (!page) throw new Error("இந்த Facebook Page இப்போது connect ஆகவில்லை — மீண்டும் Connect செய்யவும்");

  const data = await fsp.readFile(input.filePath);
  const form = new FormData();
  form.append("access_token", page.accessToken);
  form.append("title", input.title.slice(0, 255));
  form.append("description", input.description.slice(0, 5000));
  form.append("source", new Blob([data], { type: "video/mp4" }), path.basename(input.filePath));

  const response = await fetch(`${GRAPH_VIDEO}/${page.id}/videos`, { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok || !result.id) throw new Error(result?.error?.message || `Facebook upload தோல்வி (${response.status})`);
  return { videoId: result.id as string, pageId: page.id, url: `https://www.facebook.com/${page.id}/videos/${result.id}` };
}
