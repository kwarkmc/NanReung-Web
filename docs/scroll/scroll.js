const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const visualViewport = window.visualViewport;
const revealSelector = [
  ".chapter-header", ".chapter-header-2",
  ".chapter-content-2 > :not(.section-rule, .chapter-divider)",
  ".layout-16 > *"
].join(", ");
const chapters = Array.from(document.querySelectorAll(".book-page"), (section) => ({
  section,
  reveals: Array.from(section.querySelectorAll(revealSelector), (element) => ({
    element, progress: 1, offset: 0
  }))
}));

let frame;

function updateReveal() {
  frame = undefined;
  if (motionPreference.matches) return;

  const height = visualViewport?.height ?? window.innerHeight;
  const top = visualViewport?.offsetTop ?? 0;
  const bottom = top + height;
  const remainingScroll = Math.max(0, document.documentElement.scrollHeight - (window.scrollY + bottom));
  const changes = [];

  for (const { section, reveals } of chapters) {
    const bounds = section.getBoundingClientRect();
    if (bounds.bottom < top || bounds.top > bottom) continue;

    for (const reveal of reveals) {
      // Remove the previous visual shift so each frame measures the same layout position.
      const layoutTop = reveal.element.getBoundingClientRect().top - reveal.offset;
      const distance = bottom - layoutTop;
      // Complete the reveal at the document end, even if a block is close to the footer.
      const range = Math.min(height * 0.75, distance + remainingScroll);
      const progress = distance <= 0 ? 0 : Math.min(1, distance / range);
      if (progress !== reveal.progress) changes.push({ reveal, progress });
    }
  }

  for (const { reveal, progress } of changes) {
    const eased = progress * progress * (3 - 2 * progress);
    reveal.progress = progress;
    reveal.offset = 52 * (1 - eased);
    reveal.element.style.setProperty("--reveal-offset", `${reveal.offset}px`);
    reveal.element.style.setProperty("--reveal-opacity", 0.12 + 0.88 * eased);
  }
}

function scheduleReveal() {
  if (frame === undefined && !motionPreference.matches) {
    frame = requestAnimationFrame(updateReveal);
  }
}

window.addEventListener("scroll", scheduleReveal, { passive: true });
window.addEventListener("resize", scheduleReveal);
window.addEventListener("pageshow", scheduleReveal);
visualViewport?.addEventListener("resize", scheduleReveal);
visualViewport?.addEventListener("scroll", scheduleReveal, { passive: true });
motionPreference.addEventListener("change", scheduleReveal);
scheduleReveal();
