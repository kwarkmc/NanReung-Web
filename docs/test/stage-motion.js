if (window.gsap && window.ScrollTrigger) {
  gsap.registerPlugin(ScrollTrigger);
  const motion = gsap.matchMedia();

  motion.add("(prefers-reduced-motion: no-preference)", () => {
    const sections = document.querySelectorAll(
      ".stage-book .stage-chapter, .stage-book .stage-profile, .stage-cast .cast-scene"
    );
    for (const section of sections) {
      const photo = section.querySelector(".portrait-image, .cast-portrait");
      const details = section.querySelector(".cast-copy, .chapter-content-2");
      const heading = section.querySelector(".chapter-header, .chapter-header-2");
      const reveal = gsap.timeline({
        scrollTrigger: {
          trigger: section, start: "top bottom", end: "clamp(top 25%)", scrub: true
        }
      });

      if (photo) reveal.fromTo(photo, { scale: 0.96, opacity: 0.4 }, { scale: 1, opacity: 1, duration: 1, ease: "power1.out" }, 0);
      if (heading) reveal.fromTo(heading, { y: 17, opacity: 0.5 }, { y: 0, opacity: 1, duration: 0.8, ease: "power1.out" }, 0);
      if (details) {
        // For book photos the photo lives inside the copy group; animate its siblings independently.
        const copy = photo && details.contains(photo)
          ? Array.from(details.children).filter((element) => !element.contains(photo))
          : details;
        reveal.fromTo(copy, { y: 22, opacity: 0.56 }, { y: 0, opacity: 1, duration: 0.78, ease: "power1.inOut" }, 0.22);
      }
    }

    if (document.fonts) document.fonts.ready.then(() => ScrollTrigger.refresh());
  });
}
