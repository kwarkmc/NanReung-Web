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

async function checkButtonFonts(page) {
  const session = await page.context().newCDPSession(page);
  try {
    await page.evaluate(() => document.fonts.ready);
    await session.send("DOM.enable");
    await session.send("CSS.enable");
    const { root } = await session.send("DOM.getDocument");
    for (const [selector, family] of [[".copy-31", "NanumMyeongjo"], [".copy-33", "Pretendard"]]) {
      const { nodeId } = await session.send("DOM.querySelector", {nodeId: root.nodeId, selector});
      const { fonts } = await session.send("CSS.getPlatformFontsForNode", {nodeId});
      assert.ok(fonts.some(font => font.isCustomFont && font.glyphCount > 0 &&
        font.familyName.replace(/\s/g, "").startsWith(family)),
        JSON.stringify({selector, fonts}));
    }
  } finally {
    await session.detach();
  }
}

async function opening(page, name) {
  await page.waitForSelector(".poster-runway.is-animated");
  const sample = async fraction => {
    await page.evaluate(t => {
      const runway = document.querySelector(".poster-runway");
      scrollTo(0, t * (runway.offsetHeight - runway.firstElementChild.offsetHeight));
    }, fraction);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return page.evaluate(() => {
      const style = sel => getComputedStyle(document.querySelector(sel));
      return {
        pinned: Math.abs(document.querySelector(".poster-pin").getBoundingClientRect().top) <= 1,
        cover: Number(style(".stage-cover").opacity),
        flight: Number(style(".poster-flight").opacity),
        lettering: Number(style(".stage-art").opacity),
        title: Number(style(".cover-heading").opacity),
        turn: document.querySelector(".mask-spin").style.transform,
        haze: Number(style(".poster-atmosphere").opacity),
        background: style(".poster-pin").backgroundColor
      };
    });
  };
  const first = await sample(0);
  assert.equal(first.background, "rgb(0, 0, 0)");
  assert.equal(first.cover, 0);
  assert.equal(first.flight, 1);
  await screenshot(page, name + "-opening");
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const input = await page.context().newCDPSession(page);
    await input.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: 140, y: 340}]});
    for (const y of [315, 285, 255, 225, 195, 165]) {
      await input.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: 140, y}]});
      await page.waitForTimeout(45);
    }
    await page.waitForFunction(() => scrollY > 40 && document.querySelector(".poster-atmosphere").checkVisibility() &&
      parseFloat(getComputedStyle(document.querySelector(".poster-atmosphere")).opacity) > 0);
    await page.waitForTimeout(150);
    await input.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
    await input.detach();
  }
  const middle = await sample(.34);
  assert.ok(middle.pinned, "poster must stay in the viewport throughout the turn");
  assert.ok(middle.haze > .4 && middle.cover > 0 && middle.cover < 1);
  assert.match(middle.turn, /rotateY\(1(?:79|80)/);
  await screenshot(page, name + "-turn");
  await page.locator(".poster-scene").evaluate(image => image.decode());
  const landed = await sample(.75);
  assert.equal(landed.flight, 0);
  assert.equal(landed.cover, 1);
  assert.equal(landed.title, 0);
  assert.equal(landed.lettering, 0);
  await screenshot(page, name + "-landed");
  await sample(.91);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".stage-art")).opacity) > .45);
  const lettering = await sample(.91);
  assert.ok(lettering.lettering > .45 && lettering.lettering < .55);
  assert.deepEqual(await sample(.75), landed);
  await sample(1);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".stage-art")).opacity) === 1);
  const end = await sample(1);
  assert.equal(end.lettering, 1);
  assert.ok(end.pinned);
  assert.equal(end.cover, 1);
  assert.equal(end.flight, 0);
  assert.match(end.turn, /rotateY\(360deg\)/);
  assert.deepEqual(await sample(0), first);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForSelector(".poster-flight", {state: "hidden"});
  assert.equal(await page.locator(".stage-cover").evaluate(el => el.inert), false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForSelector(".poster-runway.is-animated");
  await sample(1);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".stage-art")).opacity) === 1);
}

async function fastButtonSwipe(page, name) {
  await page.locator(".poster-scene").evaluate(image => image.decode());
  await page.evaluate(() => {
    window.buttonFrames = [];
    function record(time) {
      const opacity = sel => Number(getComputedStyle(document.querySelector(sel)).opacity);
      window.buttonFrames.push({time, flight: opacity(".poster-flight"), ink: opacity(".stage-art")});
      if (opacity(".stage-art") < 1 && window.buttonFrames.length < 900) requestAnimationFrame(record);
    }
    requestAnimationFrame(record);
  });
  const input = await page.context().newCDPSession(page);
  const height = page.viewportSize().height;
  const gesture = (async () => {
    for (let swipe = 0; swipe < 4; swipe++) {
      await input.send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x: 150, y: height * .9}]});
      for (const fraction of [.72, .5, .28, .08]) {
        await input.send("Input.dispatchTouchEvent", {type: "touchMove", touchPoints: [{x: 150, y: height * fraction}]});
      }
      await input.send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
      if (await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 1)) break;
    }
  })();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".poster-flight")).opacity) === 0);
  await page.waitForTimeout(220);
  const rect = await page.locator(".stage-art").boundingBox();
  const landed = await page.screenshot({clip: rect, scale: "css"});
  await gesture;
  await input.detach();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".stage-art")).opacity) === 1);
  const frames = await page.evaluate(() => window.buttonFrames);
  const start = frames.find(f => f.flight === 0);
  const visible = frames.find(f => f.ink > 0);
  assert.ok(start && visible);
  const held = Math.round(visible.time - start.time);
  console.log(name + " fast swipe: clean poster held " + held + "ms");
  assert.ok(held >= 600, "fast swipe skipped clean poster: " + held + "ms");
  // Compare the captured pixels to the same crop with only the decoded clean plate showing.
  const reference = await page.screenshot({clip: rect, scale: "css", style: ".stage-art { visibility: hidden !important; }"});
  assert.ok(landed.equals(reference), "landed screenshot must match the clean image");
  const final = await page.screenshot({clip: rect, scale: "css"});
  assert.ok(!landed.equals(final), "final poster must show lettering");
  if (capture) {
    await fs.mkdir(capture, {recursive: true});
    await fs.writeFile(path.join(capture, name + "-swipe-landed.png"), landed);
  }
}

async function testDevice(browser, name, device) {
  const context = await contextFor(browser, device);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await pageText(page, "/test/");
    if (device.hasTouch) {
      await fastButtonSwipe(page, name);
      await page.evaluate(() => scrollTo(0, 0));
    }
    await opening(page, name);
    await photoReady(page.locator(".stage-art"));
    const art = await page.locator(".stage-art").boundingBox();
    const rail = await page.locator(".book-pagination").boundingBox();
    const viewport = page.viewportSize();
    const expectedWidth = Math.min(viewport.width, (viewport.height - 48) * 1449 / 2050);
    assert.ok(Math.abs(art.width - expectedWidth) < 2, name + " poster should fill the available width or height");
    assert.ok(art.y >= -1 && art.y + art.height <= rail.y + 1 && rail.y + rail.height <= viewport.height + 1);
    const posterLink = page.getByRole("link", { name: /공연 포스터 크게 보기/ });
    assert.match(await posterLink.getAttribute("href"), /poster\.webp$/);
    assert.match(await posterLink.locator(".stage-art").getAttribute("alt"), /한양예술극장/);
    await noOverflow(page);
    await screenshot(page, name + "-cover");
    await page.getByRole("link", { name: /다음/ }).click();
    await page.waitForURL("**/test/02.html");
    await noOverflow(page);
    await screenshot(page, name + "-contents");
    await page.getByRole("link", { name: /박정호/ }).click();
    await page.waitForURL("**/test/08.html");
    await photoReady(page.locator(".portrait-image"));
    await checkButtonFonts(page);
    await noOverflow(page);
    await screenshot(page, name + "-profile");

    await pageText(page, "/test/casting/");
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

    await pageText(page, "/test/casting/scroll/");
    await page.locator(".cast-card").first().click();
    assert.equal(new URL(page.url()).hash, "#cast-01");
    await noOverflow(page);
    await screenshot(page, name + "-cast-scroll");
    await pageText(page, "/test/scroll/");
    assert.equal(await page.locator("main .book-page").count(), 31);
    await page.waitForFunction(() => window.ScrollTrigger && ScrollTrigger.getAll().length > 0);
    await noOverflow(page);

    for (const route of ["/casting/", "/casting/scroll/"]) {
      const selector = route === "/casting/" ? "main, dialog" : "main";
      const before = [];
      const after = [];
      await pageText(page, route);
      for (const item of await page.locator(selector).all()) before.push((await item.textContent()).replace(/\s+/g, " ").trim());
      await pageText(page, "/test" + route);
      assert.equal(await page.locator(".stage-bar, .stage-sections, .stage-modes").count(), 0);
      await page.locator(".poster-cue").evaluateAll(nodes => nodes.forEach(node => node.textContent = ""));
      await noOverflow(page);
      for (const item of await page.locator(selector).all()) after.push((await item.textContent()).replace(/\s+/g, " ").trim());
      assert.deepEqual(after, before, route + " copy differs");
    }
    await pageText(page, "/test/scroll/");
    await opening(page, name + "-scroll");
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

