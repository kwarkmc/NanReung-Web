const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, devices } = require("playwright");
const { cast, grid } = require("./casting_data.json");

const board = process.argv[2] ?? pathToFileURL(path.join(__dirname, "../docs/casting/index.html")).href;
const scroll = process.argv[3] ?? pathToFileURL(path.join(__dirname, "../docs/casting/scroll/index.html")).href;

function imageDecoded(image) {
  return image.evaluate((element) => element.decode().then(() => ({
    width: element.naturalWidth,
    height: element.naturalHeight,
  })));
}

async function testCasting(browser, device) {
  const context = await browser.newContext(devices[device]);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    assert.ok((await page.goto(board)).ok());
    const cards = page.locator(".cast-card");
    assert.equal(await cards.count(), 12);
    const dialog = page.getByRole("dialog");

    for (const [index, number] of grid.entries()) {
      assert.deepEqual(await imageDecoded(cards.nth(index).locator("img")), { width: 62, height: 82 });
      await cards.nth(index).tap();
      const actor = cast[number - 1];
      assert.equal(await dialog.getByRole("heading").innerText(), actor.name);
      assert.deepEqual(await imageDecoded(dialog.locator(".cast-detail:visible img")), { width: 302, height: 282 });
      await dialog.getByRole("button", { name: "프로필 닫기" }).tap();
      assert.equal(await dialog.count(), 0);
    }

    await cards.first().tap();
    await dialog.getByRole("button", { name: /이전/ }).tap();
    assert.equal(await dialog.getByRole("heading").innerText(), cast.at(-1).name);
    await dialog.getByRole("button", { name: /다음/ }).tap();
    assert.equal(await dialog.getByRole("heading").innerText(), cast[0].name);
    await page.keyboard.press("ArrowRight");
    assert.equal(await dialog.getByRole("heading").innerText(), cast[1].name);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.count(), 0);

    assert.ok((await page.goto(scroll)).ok());
    assert.equal(await page.locator(".cast-scene").count(), 12);
    await page.locator(".cast-card").first().tap();
    assert.equal(new URL(page.url()).hash, "#cast-01");

    const portrait = page.locator("#cast-02 img");
    async function placePortrait(fraction) {
      await portrait.evaluate((element, fraction) => {
        const offset = new DOMMatrix(getComputedStyle(element).transform).m42;
        window.scrollBy(0, element.getBoundingClientRect().top - offset - innerHeight * fraction);
      }, fraction);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return portrait.evaluate((element) => Number(getComputedStyle(element).opacity));
    }

    const entering = await placePortrait(0.77);
    const midway = await placePortrait(0.5);
    assert.ok(entering < midway && midway < 0.95);
    assert.equal(await placePortrait(0.22), 1);
    assert.ok(Math.abs(await placePortrait(0.77) - entering) < 0.03);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await portrait.evaluate((element) => getComputedStyle(element).opacity), "1");

    await page.locator("#cast-12 a").tap();
    assert.equal(new URL(page.url()).hash, "#casting-list");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
    assert.deepEqual(errors, []);
    console.log(device + ": 12 cards and portraits, cyclic dialog, anchor navigation, scroll fade and reduced motion passed");
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    for (const face of ["iPhone 13", "Pixel 7"]) await testCasting(browser, face);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
