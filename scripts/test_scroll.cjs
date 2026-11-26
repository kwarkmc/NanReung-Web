const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, devices } = require('playwright');

const url = process.argv[2] ?? pathToFileURL(path.join(__dirname, '../docs/scroll/index.html')).href;

function sample(element) {
  const style = getComputedStyle(element);
  const offset = style.transform === 'none' ? 0 : new DOMMatrix(style.transform).m42;
  const bounds = element.getBoundingClientRect();
  return { opacity: Number(style.opacity), offset, top: bounds.top - offset, visible: bounds.top < innerHeight };
}

async function position(page, element, viewportFraction) {
  const { top } = await element.evaluate(sample);
  await page.evaluate(({ top, viewportFraction }) => {
    window.scrollBy(0, top - innerHeight * viewportFraction);
  }, { top, viewportFraction });
  // Hold still long enough to distinguish a scroll-linked effect from the old timed fade.
  await page.waitForTimeout(500);
}

async function testPhone(browser, device) {
  const context = await browser.newContext(devices[device]);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.ok(response.ok(), `${device}: preview HTTP ${response.status()}`);
    assert.equal(await page.locator('main > .book-page').count(), 31);

    const heading = page.locator('#page-03 .chapter-header');
    const content = page.locator('#page-03 .layout-2');
    await position(page, heading, 0.86);
    const nearEdge = await heading.evaluate(sample);
    assert.ok(nearEdge.visible && nearEdge.opacity < 0.45 && nearEdge.offset > 26,
      `${device}: heading must look visibly faded and lowered while held near the bottom: ${JSON.stringify(nearEdge)}`);

    await position(page, heading, 0.7);
    const halfway = await heading.evaluate(sample);
    const bodyHalfway = await content.evaluate(sample);
    assert.ok(halfway.opacity > nearEdge.opacity + 0.2 && halfway.offset < nearEdge.offset - 12,
      `${device}: heading should become clearer and move upward with the scroll`);
    assert.ok(bodyHalfway.opacity < halfway.opacity && bodyHalfway.offset > halfway.offset,
      `${device}: the later body block should follow the heading`);

    await position(page, heading, 0.4);
    assert.equal((await heading.evaluate(sample)).opacity, 1);
    assert.equal((await content.evaluate(sample)).offset, 0);

    await position(page, heading, 0.86);
    const reversed = await heading.evaluate(sample);
    assert.ok(Math.abs(reversed.opacity - nearEdge.opacity) < 0.03 && Math.abs(reversed.offset - nearEdge.offset) < 2,
      `${device}: scrolling backwards should restore the same reveal state`);

    const session = await context.newCDPSession(page);
    const swipe = await page.evaluate(() => ({
      startScroll: scrollY,
      x: innerWidth / 2,
      y: Math.round(innerHeight * 0.8)
    }));
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipe.x, y: swipe.y }] });
    const swipeFrames = [];
    for (let distance = 24; distance <= 312; distance += 24) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: swipe.x, y: swipe.y - distance }]
      });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      swipeFrames.push((await heading.evaluate(sample)).opacity);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    assert.ok(await page.evaluate(() => scrollY) > swipe.startScroll + 100, `${device}: swipe must move the page`);
    assert.ok(swipeFrames.some((opacity) => opacity > nearEdge.opacity + 0.12 && opacity < 0.95),
      `${device}: touch swipe should show an intermediate frame: ${swipeFrames}`);

    await page.waitForFunction(() => getComputedStyle(document.querySelector('#page-03 .chapter-header')).opacity === '1',
      undefined, { timeout: 2500 });
    await position(page, heading, 0.86);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal((await heading.evaluate(sample)).opacity, 1);
    assert.equal((await heading.evaluate(sample)).offset, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const portraitLink = page.locator('#page-02 a[href="#page-08"]');
    await portraitLink.tap();
    await page.waitForURL(/#page-08$/);
    await page.waitForFunction(() => document.querySelector('#page-08 img').naturalWidth > 0);

    await page.keyboard.press('End');
    const endLabel = page.locator('#page-31 .epilogue-label');
    await page.waitForFunction(() => {
      const label = document.querySelector('#page-31 .epilogue-label');
      return label.getBoundingClientRect().bottom <= innerHeight && getComputedStyle(label).opacity === '1';
    }, undefined, { timeout: 2500 });
    assert.equal((await endLabel.evaluate(sample)).offset, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
    assert.deepEqual(errors, []);
    console.log(`${device}: visible frames ${nearEdge.opacity.toFixed(2)} → ${halfway.opacity.toFixed(2)} → 1; touch swipe, reverse scroll, reduced motion, and profile link passed`);
  } finally {
    await context.close();
  }
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    for (const device of ['iPhone 13', 'Pixel 7']) {
      await testPhone(browser, device);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
