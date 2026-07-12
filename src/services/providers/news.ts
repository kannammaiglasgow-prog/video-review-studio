import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type NewsArticle = { title: string; text: string };

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

function decodeEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&[a-z]+;/gi, (match) => entities[match.toLowerCase()] ?? " ");
}

function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function removeBlocks(html: string, tags: string[]) {
  let output = html;
  for (const tag of tags) output = output.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  return output.replace(/<!--[\s\S]*?-->/g, " ");
}

function extractParagraphs(html: string) {
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripTags(match[1]))
    .filter((text) => text.length >= 40 && !/cookie|subscribe|advertisement/i.test(text));
  return paragraphs.join("\n");
}

function privateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

async function assertPublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("http/https news URL மட்டும் பயன்படுத்தவும்");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Local/private URL அனுமதிக்கப்படவில்லை");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("Local/private URL அனுமதிக்கப்படவில்லை");
}

async function fetchPublicPage(input: string) {
  let url = new URL(input);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("News page redirect செல்லுபடியாகவில்லை");
      url = new URL(location, url);
      continue;
    }
    return response;
  }
  throw new Error("News page அதிக redirects கொடுத்தது");
}

export async function fetchNewsArticle(url: string): Promise<NewsArticle> {
  const response = await fetchPublicPage(url);
  if (!response.ok) throw new Error(`News page-ஐ படிக்க முடியவில்லை (HTTP ${response.status})`);
  if (!/^text\/(html|plain)/i.test(response.headers.get("content-type") || "text/html")) throw new Error("இந்த URL ஒரு HTML news page அல்ல");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > 5 * 1024 * 1024) throw new Error("News page மிகவும் பெரியது");
  const rawHtml = await response.text();
  if (Buffer.byteLength(rawHtml, "utf8") > 5 * 1024 * 1024) throw new Error("News page மிகவும் பெரியது");
  const html = removeBlocks(rawHtml, ["script", "style", "noscript", "svg", "iframe", "form"]);

  const title = stripTags(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
    || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || "செய்தி"
  );

  const cleaned = removeBlocks(html, ["nav", "header", "footer", "aside"]);
  const articleBlocks = [...cleaned.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)].map((match) => extractParagraphs(match[1]));
  let text = articleBlocks.sort((a, b) => b.length - a.length)[0] || "";
  if (text.length < 300) text = extractParagraphs(cleaned);
  if (text.length < 200) throw new Error("இந்த page-ல் போதுமான article உரை கிடைக்கவில்லை — வேறு news URL முயற்சிக்கவும்");

  return { title, text: text.slice(0, 20_000) };
}
