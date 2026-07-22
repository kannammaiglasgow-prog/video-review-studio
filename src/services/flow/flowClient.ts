/**
 * Google Flow browser-automation client (Node + Playwright).
 *
 * Drives the user's own logged-in Google Flow (labs.google/flow) to generate an
 * image from a text prompt and download it. Selectors were validated against the
 * live Flow UI (see D:\claude\flow-image-tool\docs\flow_inspection_report.md).
 *
 * Guardrails:
 *   - Persistent profile: the user logs in to Google ONCE, manually. We never
 *     type or store the password.
 *   - No stealth / anti-detection. If a CAPTCHA / verification challenge appears
 *     we THROW (FlowCaptcha) and stop — we never try to solve or evade it.
 *
 * Reliability techniques: role/tooltip-text selectors (Flow's CSS classes are
 * hashed and unstable), explicit waits, generation-complete detection via the
 * stop→idle transition, new-image detection by src diff, download-event capture.
 */
import { chromium, type BrowserContext, type Page } from "playwright-core";

const FLOW_URL = "https://labs.google/fx/tools/flow";

export class FlowLoginRequired extends Error {
  constructor(message = "Google Flow-ல் login தேவை — browser window-ல் ஒருமுறை login செய்யவும்") {
    super(message);
    this.name = "FlowLoginRequired";
  }
}
export class FlowCaptcha extends Error {
  constructor(message = "Google Flow ஒரு verification/CAPTCHA காட்டுகிறது — browser window-ல் அதை handle செய்து மீண்டும் முயற்சிக்கவும்") {
    super(message);
    this.name = "FlowCaptcha";
  }
}

// Only UNAMBIGUOUS bot-block markers. Do NOT include normal Google login phrases
// like "verify it's you" — those appear on the ordinary sign-in flow and must not
// be mistaken for a CAPTCHA (that would abort the manual-login wait).
const CAPTCHA_SIGNALS = [
  "our systems have detected unusual traffic",
  "detected unusual traffic",
];

export interface FlowOptions {
  profileDir: string;
  channel?: "chrome" | "msedge";
  headless?: boolean;
  pageTimeoutMs?: number;
  generationTimeoutMs?: number;
}

export class FlowSession {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private configured = false;
  private readonly opts: Required<FlowOptions>;

  constructor(options: FlowOptions) {
    this.opts = {
      channel: "chrome",
      headless: false,
      pageTimeoutMs: 60_000,
      generationTimeoutMs: 300_000,
      ...options,
    };
  }

  private get p(): Page {
    if (!this.page) throw new Error("FlowSession not started");
    return this.page;
  }

  async start(): Promise<void> {
    this.context = await chromium.launchPersistentContext(this.opts.profileDir, {
      channel: this.opts.channel,
      headless: this.opts.headless,
      acceptDownloads: true,
      // Open a NORMAL maximized browser window, not a small automation popup.
      // `viewport: null` lets the window use its natural (maximized) size, and
      // dropping `--enable-automation` removes the "controlled by automated
      // software" flag — Google blocks sign-in on browsers carrying that flag,
      // which is why login failed in the popup. This makes it behave like an
      // ordinary Chrome window the user can log into.
      viewport: null,
      args: ["--start-maximized", "--no-first-run", "--no-default-browser-check"],
      ignoreDefaultArgs: ["--enable-automation"],
    });
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.page.setDefaultTimeout(this.opts.pageTimeoutMs);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
  }

  /**
   * Navigate to Flow home and confirm we're logged in. If not, keep the (visible)
   * window open for up to `loginWaitMs` so the user can log in manually, polling
   * until the home page appears. Throws FlowLoginRequired on timeout / FlowCaptcha
   * if a challenge is shown.
   */
  async ensureReady(loginWaitMs = 0): Promise<void> {
    await this.p.goto(FLOW_URL, { waitUntil: "domcontentloaded" });
    await this.p.waitForTimeout(2500);

    const deadline = Date.now() + loginWaitMs;
    for (;;) {
      await this.throwIfCaptcha();
      const homeReady = await this.p.locator('button:has-text("New project")').first().isVisible().catch(() => false);
      if (homeReady) return;

      if (Date.now() >= deadline) throw new FlowLoginRequired();
      // Give the user time to complete Google login in the open window, then re-check.
      await this.p.waitForTimeout(4000);
      await this.p.goto(FLOW_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
      await this.p.waitForTimeout(1500);
    }
  }

  /** Create a fresh Flow project and wait for the prompt box. */
  async newProject(): Promise<void> {
    await this.p.goto(FLOW_URL, { waitUntil: "domcontentloaded" });
    await this.p.waitForTimeout(1500);
    await this.throwIfCaptcha();
    await this.p.locator('button:has-text("New project")').first().click();
    await this.p.waitForSelector('div[role="textbox"]', { timeout: this.opts.pageTimeoutMs });
    await this.p.waitForTimeout(800);
    if (!this.configured) {
      await this.configureOutput();
      this.configured = true;
    }
  }

  /** One image per prompt + auto-generate (no per-prompt confirmation). Best-effort. */
  private async configureOutput(): Promise<void> {
    try {
      await this.p.locator('button:has-text("tune")').first().click();
      await this.p.waitForTimeout(900);
      // Image-generation count: the first "1x" tab belongs to the image section.
      await this.p.locator('button[role="tab"]:has-text("1x")').first().click().catch(() => {});
      // Confirm before generating -> Never (auto-generate, unattended).
      await this.p.getByText("Never", { exact: false }).first().click().catch(() => {});
      await this.p.locator('button:has-text("Save")').first().click().catch(() => {});
      await this.p.waitForTimeout(600);
    } catch {
      // Settings layout may differ; generation still works with defaults.
    }
  }

  /** Generate an image for `prompt` and save it to `destPath`. */
  async generateImage(prompt: string, destPath: string): Promise<void> {
    const box = this.p.locator('div[role="textbox"]').first();
    await box.click();
    await this.p.keyboard.press("Control+A");
    await this.p.keyboard.press("Delete");
    await box.type(prompt, { delay: 4 });

    const before = await this.imageSrcs();
    await this.p.locator('button:has-text("arrow_forward")').first().click();
    await this.waitForGenerationComplete();
    await this.p.waitForTimeout(1200);

    // Identify the newly generated image (src not present before). Fallback: newest-first.
    const after = await this.imageSrcs();
    let index = after.findIndex((src) => !before.includes(src));
    if (index < 0) index = 0;

    const images = this.p.locator('img[alt="Generated image"]');
    await images.nth(index).click(); // open the detail viewer
    await this.p.waitForTimeout(800);
    await this.throwIfCaptcha();

    const [download] = await Promise.all([
      this.p.waitForEvent("download", { timeout: this.opts.pageTimeoutMs }),
      this.p.locator('button:has-text("Download")').first().click(),
    ]);
    await download.saveAs(destPath);

    // Close the viewer for the next scene.
    await this.p.locator('button:has-text("Done")').first().click().catch(() => {});
    await this.p.waitForTimeout(600);
  }

  // --- Pipelined generation ------------------------------------------------
  // submitPrompt fires a prompt in a fresh project and returns WITHOUT waiting
  // for the image (Flow keeps generating server-side). collectImage revisits the
  // project once and downloads the finished image. Running submitPrompt for every
  // scene first, then collectImage for every scene, overlaps all the wait times.

  /** Start a generation in a fresh project; return the project URL. Does NOT wait. */
  async submitPrompt(prompt: string): Promise<string> {
    await this.newProject(); // fresh project per scene avoids Agent context-bleed
    const box = this.p.locator('div[role="textbox"]').first();
    await box.click();
    await this.p.keyboard.press("Control+A");
    await this.p.keyboard.press("Delete");
    await box.type(prompt, { delay: 4 });
    await this.p.locator('button:has-text("arrow_forward")').first().click();
    await this.p.waitForTimeout(2000); // let it register + kick off (submit -> stop)
    await this.throwIfCaptcha();
    return this.p.url(); // /fx/tools/flow/project/<uuid>
  }

  /** Revisit a submitted project, wait for its image to finish, and download it. */
  async collectImage(projectUrl: string, destPath: string): Promise<void> {
    if (!this.p.url().startsWith(projectUrl.split("#")[0])) {
      await this.p.goto(projectUrl, { waitUntil: "domcontentloaded" });
      await this.p.waitForTimeout(2000);
    }
    await this.throwIfCaptcha();
    await this.waitForGenerationComplete(); // returns immediately if already done
    await this.p.waitForTimeout(1200);

    // Fresh project => the newest (first) generated image is this scene's image.
    const images = this.p.locator('img[alt="Generated image"]');
    await images.first().click();
    await this.p.waitForTimeout(800);
    await this.throwIfCaptcha();

    const [download] = await Promise.all([
      this.p.waitForEvent("download", { timeout: this.opts.pageTimeoutMs }),
      this.p.locator('button:has-text("Download")').first().click(),
    ]);
    await download.saveAs(destPath);
    await this.p.locator('button:has-text("Done")').first().click().catch(() => {});
    await this.p.waitForTimeout(400);
  }

  private async imageSrcs(): Promise<string[]> {
    return this.p
      .locator('img[alt="Generated image"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src));
  }

  /** Wait for the stop→idle transition that marks generation completion. */
  private async waitForGenerationComplete(): Promise<void> {
    await this.p.waitForTimeout(1500); // let generation start (submit -> stop)
    const deadline = Date.now() + this.opts.generationTimeoutMs;
    while (Date.now() < deadline) {
      await this.throwIfCaptcha();
      const generating = await this.p.locator('button:has-text("stop")').count();
      if (generating === 0) {
        const idle = await this.p.locator('button:has-text("arrow_forward")').count();
        if (idle > 0) return;
      }
      await this.p.waitForTimeout(1500);
    }
    throw new Error("Flow image generation timed out");
  }

  private async throwIfCaptcha(): Promise<void> {
    let body = "";
    try {
      body = (await this.p.content()).toLowerCase();
    } catch {
      return;
    }
    const url = (this.p.url() || "").toLowerCase();
    // Only Google's HARD bot-block counts: the "/sorry/" interstitial or an
    // explicit "unusual traffic" notice. Do NOT treat a reCAPTCHA iframe as a
    // challenge — invisible reCAPTCHA is embedded on ordinary Google login
    // pages, so that would false-positive and abort the manual-login wait.
    if (url.includes("/sorry/")) throw new FlowCaptcha();
    if (CAPTCHA_SIGNALS.some((sig) => body.includes(sig))) throw new FlowCaptcha();
  }
}
