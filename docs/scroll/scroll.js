const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const elements = document.querySelectorAll(
  ".chapter-header, .chapter-header-2, .chapter-content-2 > :not(.section-rule, .chapter-divider), #page-31 .layout-16 > *"
);
const animations = new Set();
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting || motionPreference.matches) continue;

    const animation = entry.target.animate(
      [
        { opacity: 0.65, transform: "translateY(12px)" },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    observer.unobserve(entry.target);
  }
});

function updateMotion() {
  if (motionPreference.matches) {
    observer.disconnect();
    animations.forEach((animation) => animation.cancel());
  } else {
    elements.forEach((element) => observer.observe(element));
  }
}

motionPreference.addEventListener("change", updateMotion);
updateMotion();
