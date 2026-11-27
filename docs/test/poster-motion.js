(() => {
  const runway = document.querySelector(".poster-runway");
  const pin = runway.querySelector(".poster-pin");
  const cover = pin.querySelector(".stage-cover");
  const poster = cover.querySelector(".stage-art");
  const mask = pin.querySelector(".mask-spin");
  const flight = pin.querySelector(".poster-flight");
  const cue = pin.querySelector(".poster-cue");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = value => Math.min(1, Math.max(0, value));
  function fade(value, from, to) {
    const t = clamp((value - from) / (to - from));
    return t * t * (3 - 2 * t);
  }

  let frame = 0;
  function draw() {
    frame = 0;
    if (!runway.classList.contains("is-animated")) return;
    const distance = runway.offsetHeight - pin.offsetHeight;
    const progress = clamp(-runway.getBoundingClientRect().top / Math.max(1, distance));
    const target = poster.getBoundingClientRect();
    const view = flight.getBoundingClientRect();
    const landing = fade(progress, 0.19, 0.98);
    const x = target.left + target.width * .77 - (view.left + view.width / 2);
    const y = target.top + target.height * .74 - (view.top + view.height / 2);
    const lift = -view.height * .09 * (1 - landing);
    const scale = 1 + (target.width * .64 / mask.offsetWidth - 1) * landing;
    mask.style.transform = 'translate3d(' + x * landing + 'px,' + (lift + y * landing) +
      'px,0) scale(' + scale + ') rotateZ(' + 29 * landing + 'deg) rotateY(' + 360 * progress + 'deg)';
    flight.style.opacity = 1 - fade(progress, .77, 1);
    pin.style.setProperty("--cover-light", fade(progress, .25, .95));
    pin.style.setProperty("--haze", fade(progress, .02, .62) * (1 - fade(progress, .67, 1)));
    const edge = fade(progress, .22, 1) * 145;
    pin.style.setProperty("--ink-start", (edge - 40) + "%");
    pin.style.setProperty("--ink-end", edge + "%");
    cue.style.opacity = 1 - fade(progress, .01, .23);
    cue.style.visibility = progress >= .23 ? "hidden" : "visible";
    cover.inert = progress < .92;
    pin.style.backgroundColor = progress === 1 ? "var(--stage-black)" :
      'rgb(' + [23,9,10].map(v => Math.round(v * fade(progress,.72,1))).join(",") + ')';
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function configure() {
    runway.classList.toggle("is-animated", !reduced.matches);
    cover.inert = false;
    draw();
    window.ScrollTrigger?.refresh();
  }
  cue.addEventListener("click", () => {
    window.scrollBy({ top: runway.getBoundingClientRect().top + runway.offsetHeight - pin.offsetHeight, behavior: "smooth" });
  });
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  addEventListener("pageshow", schedule);
  new ResizeObserver(schedule).observe(poster);
  reduced.addEventListener("change", configure);
  if (document.fonts) document.fonts.ready.then(schedule);
  configure();
  mask.querySelector("img").decode().catch(() => {
    reduced.removeEventListener("change", configure);
    runway.classList.remove("is-animated");
    cover.inert = false;
    window.ScrollTrigger?.refresh();
  });
})();
