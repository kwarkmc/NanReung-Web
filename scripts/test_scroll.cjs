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

async function checkWorkDescription(container) {
  const paragraph = container.locator(".program-essay p").filter({ hasText: "토끼 동요" });
  assert.doesNotMatch(await paragraph.textContent(), /<br\b/i);
  assert.equal(await paragraph.locator("br + br").count(), 1);
}

async function testPhone(browser, device) {
  const context = await browser.newContext(devices[device]);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    assert.ok(response.ok(), `${device}: preview HTTP ${response.status()}`);
    assert.equal(await page.locator('main > .book-page').count(), 19);

    assert.match(await page.locator('#page-03').innerText(), /트리거워닝/);
    assert.match(await page.locator('#page-05').innerText(), /가면 속 두 남자/);
    await checkWorkDescription(page.locator('#page-05'));
    const heading = page.locator('#page-04 .chapter-header');
    const content = page.locator('#page-04 blockquote');
    await position(page, heading, 0.86);
    const nearEdge = await heading.evaluate(sample);
    assert.ok(nearEdge.visible && nearEdge.opacity < 0.45 && nearEdge.offset > 26,
      `${device}: heading must look visibly faded and lowered while held near the bottom: ${JSON.stringify(nearEdge)}`);

    await position(page, heading, 0.5);
    const halfway = await heading.evaluate(sample);
    const bodyHalfway = await content.evaluate(sample);
    assert.ok(halfway.opacity > nearEdge.opacity + 0.2 && halfway.opacity < 0.9 && halfway.offset > 8,
      `${device}: heading should be visibly mid-transition at halfway: ${JSON.stringify(halfway)}`);
    assert.ok(bodyHalfway.opacity < halfway.opacity && bodyHalfway.offset > halfway.offset,
      `${device}: the later body block should follow the heading`);

    await position(page, heading, 0.3);
    assert.ok((await heading.evaluate(sample)).opacity < 0.995,
      `${device}: heading should still be transitioning after traveling 70% of the viewport`);
    await position(page, heading, 0.248);
    assert.equal((await heading.evaluate(sample)).opacity, 1);
    await position(page, content, 0.248);
    assert.equal((await content.evaluate(sample)).offset, 0);

    await position(page, heading, 0.86);
    const reversed = await heading.evaluate(sample);
    assert.ok(Math.abs(reversed.opacity - nearEdge.opacity) < 0.03 && Math.abs(reversed.offset - nearEdge.offset) < 2,
      `${device}: scrolling backwards should restore the same reveal state`);

    const session = await context.newCDPSession(page);
    const swipe = await page.evaluate(() => ({
      startScroll: scrollY,
      x: innerWidth / 2,
      y: Math.round(innerHeight * 0.8),
      distance: innerHeight * 0.7
    }));
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipe.x, y: swipe.y }] });
    const swipeFrames = [];
    for (let distance = 24; distance <= swipe.distance; distance += 24) {
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

    await page.waitForFunction(() => getComputedStyle(document.querySelector('#page-04 .chapter-header')).opacity === '1',
      undefined, { timeout: 2500 });
    await position(page, heading, 0.86);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal((await heading.evaluate(sample)).opacity, 1);
    assert.equal((await heading.evaluate(sample)).offset, 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const portraitLink = page.locator('#page-02 a[href="#page-08"]');
    await portraitLink.tap();
    await page.waitForURL(/#page-08$/, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelector('#page-08 .program-portrait').naturalWidth >= 1100);
    assert.ok(await page.locator('#page-08 .program-content').evaluate(content =>
      content.querySelector('.program-portrait').getBoundingClientRect().bottom <=
      content.querySelector('h2').getBoundingClientRect().top), 'profile copy must follow the photo without overlap');

    await page.keyboard.press('End');
    const endLabel = page.locator('#page-19 .scroll-action');
    await page.waitForFunction(() => {
      const label = document.querySelector('#page-19 .scroll-action');
      return label.getBoundingClientRect().bottom <= innerHeight && getComputedStyle(label).opacity === '1';
    }, undefined, { timeout: 2500 });
    assert.equal((await endLabel.evaluate(sample)).offset, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width);
    assert.deepEqual(errors, []);
    await page.goto(new URL('../03.html', url).href, { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('h1').innerText(), /트리거워닝/);
    await page.getByRole('link', { name: /다음/ }).tap();
    await page.waitForURL(/04\.html$/, { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('h1').innerText(), /시놉시스/);
    await page.getByRole('link', { name: /다음/ }).tap();
    await page.waitForURL(/05\.html$/);
    await checkWorkDescription(page.locator('main'));

    await page.goto(new URL('../02.html', url).href);
    assert.equal(await page.locator('.book-contents-link').count(), 19);
    await page.getByRole('link', {name: /함께 만든 이들/}).tap();
    await page.waitForURL(/18\.html$/);
    assert.equal(await page.locator('.program-credits dt').count(), 44);
    await page.getByRole('link', {name: /다음/}).tap();
    await page.waitForURL(/19\.html$/);
    const gallery = page.locator('.program-gallery img');
    assert.equal(await gallery.count(), 20);
    for (const image of await gallery.all()) {
      await image.evaluate(async img => { img.loading = 'eager'; await img.decode(); });
    }
    await page.getByRole('link', {name: /다음/}).tap();
    await page.waitForURL(target => !/\/19\.html$/.test(target.pathname));
    await page.locator('.program-poster').evaluate(img => img.decode());
    await page.getByRole('link', {name: /이전/}).tap();
    await page.waitForURL(/19\.html$/);
    console.log(`${device}: opacity ${halfway.opacity.toFixed(2)} at halfway, 1 at three quarters; touch swipe, reverse scroll, reduced motion, and profile link passed`);
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
