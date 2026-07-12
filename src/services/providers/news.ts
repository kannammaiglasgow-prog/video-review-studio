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

export async function fetchNewsArticle(url: string): Promise<NewsArticle> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`News page-ஐ படிக்க முடியவில்லை (HTTP ${response.status})`);
  const html = removeBlocks(await response.text(), ["script", "style", "noscript", "svg", "iframe", "form"]);

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
