const dialog = document.querySelector(".casting-dialog");
const profiles = Array.from(dialog.querySelectorAll("[data-profile]"));
const counter = dialog.querySelector("output");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let current = 0;
let backdropPressed = false;

function showProfile(index) {
  profiles[current].hidden = true;
  current = (index + profiles.length) % profiles.length;
  const profile = profiles[current];
  profile.hidden = false;
  dialog.setAttribute("aria-labelledby", profile.querySelector("h2").id);
  counter.value = profile.dataset.profile + " / " + profiles.length;
  dialog.scrollTop = 0;

  if (dialog.open && !motion.matches) {
    profile.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
  }
}

for (const card of document.querySelectorAll("[data-actor]")) {
  card.addEventListener("click", () => {
    showProfile(Number(card.dataset.actor) - 1);
    dialog.showModal();
  });
}

for (const button of dialog.querySelectorAll("[data-step]")) {
  button.addEventListener("click", () => showProfile(current + Number(button.dataset.step)));
}

dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
dialog.addEventListener("pointerdown", (event) => {
  backdropPressed = event.target === dialog;
});
dialog.addEventListener("click", (event) => {
  if (backdropPressed && event.target === dialog) dialog.close();
  backdropPressed = false;
});
dialog.addEventListener("keydown", (event) => {
  const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (step) {
    event.preventDefault();
    showProfile(current + step);
  }
});
