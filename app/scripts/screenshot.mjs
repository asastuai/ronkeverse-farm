// Takes screenshots of the running app for visual review.
// Usage: node scripts/screenshot.mjs [iteration-name]
import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ITERATION = process.argv[2] || "baseline";
const BASE_URL = process.env.SCREENSHOT_URL || "http://localhost:3030";
const OUT_DIR = resolve(__dirname, `../../screenshots/${ITERATION}`);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

const PAGES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

async function settle(page, ms = 1500) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`📸 Capturing screenshots → ${OUT_DIR}`);
  console.log(`🌐 URL base: ${BASE_URL}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"],
  });

  for (const [viewportName, vp] of Object.entries(VIEWPORTS)) {
    for (const { name, path } of PAGES) {
      const page = await browser.newPage();
      await page.setViewport(vp);
      const url = `${BASE_URL}${path}`;
      console.log(`  → ${viewportName} ${name} ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await settle(page, 2000);

      // Full-page screenshot
      const fileName = `${viewportName}-${name}-full.png`;
      await page.screenshot({
        path: resolve(OUT_DIR, fileName),
        fullPage: true,
      });

      // Above-the-fold screenshot
      const foldFileName = `${viewportName}-${name}-fold.png`;
      await page.screenshot({
        path: resolve(OUT_DIR, foldFileName),
        fullPage: false,
      });

      // Specific interactions for /about (FAQ open state)
      if (name === "about") {
        // Click 2nd FAQ item to expand it
        const faqButtons = await page.$$("section button");
        if (faqButtons.length > 1) {
          await faqButtons[1].click();
          await settle(page, 600);
          await page.screenshot({
            path: resolve(OUT_DIR, `${viewportName}-about-faq-open.png`),
            fullPage: false,
          });
        }
      }

      await page.close();
    }
  }

  await browser.close();
  console.log(`✓ Done. Screenshots saved to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
