const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium, devices } = require("playwright");

const docs = path.join(__dirname, "../docs");
const base = process.argv[2] || "https://local-stage.invalid";
const capture = process.env.PREVIEW_SCREENSHOTS;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };

async function contextFor(browser, device) {
  const context = await browser.newContext(device);
  if (!process.argv[2]) {
    await context.route(base + "/**", async route => {
      const request = new URL(route.request().url()).pathname;
      const file = path.join(docs, request, request.endsWith("/") ? "index.html" : "");
      try {
        await route.fulfill({ body: await fs.readFile(file), contentType: types[path.extname(file)] });
      } catch {
        await route.fulfill({ status: 404 });
      }
    });
  }
  return context;
}

async function photoReady(locator) {
  await locator.scrollIntoViewIfNeeded();
  const image = await locator.elementHandle();
  await locator.page().waitForFunction(node => node.complete && node.naturalWidth > 0, image, { timeout: 10000 });
  await image.evaluate(node => node.decode());
}

async function screenshot(page, name) {
  if (!capture) return;
  await fs.mkdir(capture, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(capture, name + ".png"), animations: "disabled", scale: "css" });
}

async function pageText(page, route, selector = "main") {
  const response = await page.goto(base + route, { waitUntil: "domcontentloaded" });
  assert.ok(response.ok(), route + " returned " + response.status());
  return (await page.locator(selector).textContent()).replace(/\s+/g, " ").trim();
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({ screen: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  assert.ok(sizes.document <= sizes.screen + 1, JSON.stringify({ url: page.url(), ...sizes }));
}

async function testDevice(browser, name, device) {
  const context = await contextFor(browser, device);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await pageText(page, "/test/");
    await photoReady(page.locator(".stage-art"));
    const posterLink = page.getByRole("link", { name: /공연 포스터 크게 보기/ });
    assert.match(await posterLink.getAttribute("href"), /poster\.webp$/);
    assert.match(await posterLink.locator("img").getAttribute("alt"), /한양예술극장/);
    await noOverflow(page);
    await screenshot(page, name + "-cover");
    await page.getByRole("link", { name: /다음/ }).click();
    await page.waitForURL("**/test/02.html");
    await noOverflow(page);
    await screenshot(page, name + "-contents");
    await page.getByRole("link", { name: /박정호/ }).click();
    await page.waitForURL("**/test/08.html");
    await photoReady(page.locator(".portrait-image"));
    await noOverflow(page);
    await screenshot(page, name + "-profile");

    await page.locator(".stage-sections").getByText("캐스팅보드").click();
    await page.waitForURL("**/test/casting/");
    assert.equal(await page.locator(".cast-card").count(), 12);
    await photoReady(page.locator(".cast-card img").first());
    await noOverflow(page);
    await screenshot(page, name + "-casting");
    const dialog = page.getByRole("dialog");
    for (const card of await page.locator(".cast-card").all()) {
      await card.click();
      const photo = dialog.locator(".cast-detail:visible img");
      await photoReady(photo);
      assert.equal(await photo.evaluate(image => getComputedStyle(image).objectFit), "contain");
      assert.ok(await dialog.evaluate(node => node.scrollHeight <= node.clientHeight + 1));
      if (await dialog.getByRole("heading").innerText() === "박정호") await screenshot(page, name + "-dialog");
      await page.keyboard.press("Escape");
      assert.equal(await dialog.count(), 0);
    }
    await page.locator(".cast-card").first().click();
    await dialog.getByRole("button", { name: /이전/ }).click();
    assert.equal(await dialog.getByRole("heading").innerText(), "이효림");
    await dialog.getByRole("button", { name: /다음/ }).click();
    assert.equal(await dialog.getByRole("heading").innerText(), "박정호");
    await page.keyboard.press("Escape");

    await page.locator(".stage-modes").getByText("스크롤").click();
    await page.waitForURL("**/test/casting/scroll/");
    await page.locator(".cast-card").first().click();
    assert.equal(new URL(page.url()).hash, "#cast-01");
    await noOverflow(page);
    await screenshot(page, name + "-cast-scroll");
    await page.locator(".stage-sections").getByText("프로그램북").click();
    await page.waitForURL("**/test/scroll/");
    await page.locator("main > .book-page").first().waitFor({ state: "attached" });
    assert.equal(await page.locator("main > .book-page").count(), 31);
    await page.waitForFunction(() => window.ScrollTrigger && ScrollTrigger.getAll().length > 0);
    await noOverflow(page);

    for (const route of ["/", "/02.html", "/03.html", "/04.html", "/06.html", "/08.html", "/29.html", "/31.html", "/scroll/", "/casting/", "/casting/scroll/"]) {
      const selector = route === "/casting/" ? "main, dialog" : "main";
      const before = [];
      const after = [];
      await pageText(page, route);
      for (const item of await page.locator(selector).all()) before.push((await item.textContent()).replace(/\s+/g, " ").trim());
      await pageText(page, "/test" + route);
      await noOverflow(page);
      for (const item of await page.locator(selector).all()) after.push((await item.textContent()).replace(/\s+/g, " ").trim());
      assert.deepEqual(after, before, route + " copy differs");
    }
    await pageText(page, "/test/scroll/");
    const heading = page.locator("#page-04 .chapter-header");
    const place = async fraction => {
      await page.locator("#page-04").evaluate((node, value) => window.scrollBy(0, node.getBoundingClientRect().top - innerHeight * value), fraction);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return heading.evaluate(node => Number(getComputedStyle(node).opacity));
    };
    const entry = await place(0.84);
    const full = await place(0.2);
    const reversed = await place(0.84);
    assert.ok(entry < 0.9 && full > 0.99 && Math.abs(reversed - entry) < 0.04);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await heading.evaluate(node => getComputedStyle(node).opacity), "1");
    assert.deepEqual(errors, []);
    console.log(name + ": routes, copy, 12 dialogs, navigation, no overflow, scroll motion and reduced motion verified");
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    await testDevice(browser, "mobile", { ...devices["iPhone 13"], viewport: { width: 390, height: 780 } });
    await testDevice(browser, "desktop", { viewport: { width: 1440, height: 900 } });
    await testDevice(browser, "compact", { ...devices["iPhone 13"], viewport: { width: 320, height: 480 } });
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
