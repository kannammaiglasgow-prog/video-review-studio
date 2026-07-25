import { geminiText, parseJson } from "./generator";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetches a news/article URL server-side and asks Gemini to pull out just the
 * real headline + body text from the page's raw text — naive tag-stripping
 * leaves nav/ads/related-links/comments mixed in, and a fixed CSS selector
 * can't generalize across arbitrary sites, so an LLM extraction pass is used
 * instead. Output feeds the same "story" textarea as pasted text, so the rest
 * of the pipeline (script generation, scenes, TTS) is unchanged. */
export async function extractArticleFromUrl(url: string): Promise<{ title: string; article: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("சரியான URL இல்லை");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("சரியான URL இல்லை");

  const response = await fetch(parsed.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      "Accept-Language": "ta,en;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Page fetch தோல்வி (${response.status})`);
  const html = await response.text();
  const text = stripHtml(html).slice(0, 20_000);
  if (text.length < 200) throw new Error("பக்கத்தில் இருந்து போதுமான உரை கிடைக்கவில்லை");

  const prompt = `The text below was extracted (HTML tags stripped) from a news article webpage. It is mixed together with site navigation, ads, related-article links, comments, cookie notices, and footer boilerplate.

Find and return ONLY the actual news article's headline and full body text, in its ORIGINAL language (do not translate). Keep the full original wording of the article body — do not summarize or shorten it. Ignore everything else (menus, ads, "related articles", comments, cookie notices, footer, author/byline boilerplate, social share prompts).

Page text:
${text}

Return ONLY JSON (escape newlines inside strings as \\n): {"title": "...", "article": "..."}`;

  const raw = await geminiText(prompt, 0.1);
  const data = parseJson<{ title?: string; article?: string }>(raw);
  const article = typeof data.article === "string" ? data.article.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (article.length < 50) throw new Error("இந்த page-ல் இருந்து article-ஐ கண்டறிய முடியவில்லை — வேறு link முயற்சிக்கவும்");
  return { title, article };
}
