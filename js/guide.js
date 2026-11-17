// Page « Guide » : lancement de la simulation, et date du dernier jeu de données publié.
// Chargé après i18n.js et format.js.

// Quand le bouton se fixe en haut de l'écran, il se déploie (voir css/page.css) : un repère juste au-dessus de lui donne sa position d'origine.
// La transition de largeur a besoin de deux valeurs chiffrées : on mesure la largeur du bouton replié avec une copie invisible.
(() => {
  const bar = document.querySelector(".open-map-sticky");
  const button = bar && bar.querySelector(".map-button");
  const text = button && button.querySelector(".map-button-text");
  const sentinel = document.querySelector(".open-map-sentinel");
  if (!button || !text || !sentinel) return;
  const ghost = document.createElement("span");
  ghost.className = "map-button map-button-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.textContent = text.textContent;
  bar.appendChild(ghost);
  const measure = () => button.style.setProperty("--mb-w", `${Math.ceil(ghost.getBoundingClientRect().width) + 2}px`);
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  // Sur téléphone, la barre d'adresse qui se réduit en défilant déclenche des « resize » qui ne changent que la hauteur : on ne mesure que si la largeur change
  let measuredWidth = window.innerWidth;
  window.addEventListener("resize", () => { if (window.innerWidth !== measuredWidth) { measuredWidth = window.innerWidth; measure(); } });
  // Déploiement : dès que le bouton se fixe en haut (le repère passe au-dessus du bord de l'écran) en descendant. Repli : en remontant, 180 px avant
  // que le bouton ait retrouvé sa place, pour qu'il soit déjà replié quand il se détache et qu'il ne descende pas encore plein sur la page.
  const FOLD_ZONE = 180;
  let last = window.scrollY;
  let direction = 0; // dernier sens net de défilement : 1 vers le bas, -1 vers le haut
  let pending = false;
  // Le premier bouton « Ouvrir la carte » s'efface quand celui du bas de page est à l'écran. Calculé ici, à chaque défilement, plutôt que par un observateur
  // d'intersection : après un retour en haut par un toucher sur l'heure de l'iPhone, l'observateur pouvait ne jamais rappeler, et le bouton restait caché.
  const bottom = [...document.querySelectorAll(".open-map")].pop();
  const hideWhenBottomVisible = () => {
    if (!bottom || bottom === bar) return;
    const r = bottom.getBoundingClientRect();
    bar.classList.toggle("is-hidden", r.top < window.innerHeight && r.bottom > 0);
  };
  const sync = () => { bar.classList.toggle("is-stuck", sentinel.getBoundingClientRect().top < 0); hideWhenBottomVisible(); }; // position d'arrivée (rechargement, retour sur la page)
  const update = () => {
    pending = false;
    hideWhenBottomVisible();
    const y = window.scrollY;
    const top = sentinel.getBoundingClientRect().top;
    if (Math.abs(y - last) > 1) { direction = y > last ? 1 : -1; last = y; }
    if (top >= 0 || (direction < 0 && top > -FOLD_ZONE)) bar.classList.remove("is-stuck"); // replié (le bouton a retrouvé sa place, ou va la retrouver)
    else if (direction > 0) bar.classList.add("is-stuck");
  };
  window.addEventListener("scroll", () => { if (!pending) { pending = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener("pageshow", sync);
  sync();
})();

// Simulation : jour et heure passent par le sessionStorage de l'onglet, pas par l'adresse
(() => {
  const holidayBox = document.getElementById("sim-holiday");
  const vacationBox = document.getElementById("sim-vacation");
  const form = document.getElementById("sim-form");
  // les boutons annoncent « · férié » et « · vacances » tant que les cases sont cochées (le navigateur peut les restaurer au retour sur la page)
  const syncOptions = () => {
    form.classList.toggle("is-holiday", holidayBox.checked);
    form.classList.toggle("is-vacation", vacationBox.checked);
  };
  holidayBox.addEventListener("change", syncOptions);
  vacationBox.addEventListener("change", syncOptions);
  window.addEventListener("pageshow", syncOptions);
  syncOptions();
  const start = (day, time) => {
    const holiday = holidayBox.checked;
    const vacation = vacationBox.checked;
    const [h, m] = time.split(":").map(Number);
    try {
      sessionStorage.setItem("simulation", JSON.stringify({ day: +day, h, m, holiday, vacation, ts: Date.now() }));
      if (!sessionStorage.getItem("simulation")) throw new Error();
    } catch {
      document.getElementById("sim-error").hidden = false;
      return;
    }
    location.assign(document.getElementById("sim-form").dataset.mapUrl); // la carte, dans la langue de cette page
  };
  document.querySelectorAll(".sim-quick button").forEach((b) => b.addEventListener("click", () => start(b.dataset.day, b.dataset.time)));
  document.getElementById("sim-custom-form").addEventListener("submit", (e) => {
    e.preventDefault();
    start(document.getElementById("sim-day").value, document.getElementById("sim-time").value);
  });
})();

// Date du dernier jeu de données publié (sans conséquence si indisponible)
fetch("data/index.json", { cache: "no-store" }).then((r) => r.json()).then((i) => {
  const d = i.datasets.find((x) => x.date === i.latest);
  if (d) document.getElementById("dataset-info").textContent = tr("guide.latestData", { date: fmtDay(d.date), count: numberFormat(d.count) });
}).catch(() => {});
