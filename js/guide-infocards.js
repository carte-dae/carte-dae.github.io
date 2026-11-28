// Page « Guide », section « Lire une fiche » : cinq défibrillateurs fictifs, avec leur point et leur fiche, tels que la carte les dessine (js/dae-view.js).
// Le texte qui accompagne chaque exemple est écrit dans le contenu de la page (content/guide.<langue>.html), dans les éléments .infocard-example[data-infocard].
// Chargé après dae-view.js et guide-examples.js.

(() => {
  const host = document.querySelectorAll(".infocard-example[data-infocard]");
  if (!host.length) return;
  // Dans js/guide-examples.js, les dates sont des écarts en jours avec aujourd'hui : les exemples ne passent pas de « à jour » à « périmé » avec le temps
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const DATES = ["dtLcad", "dtLcped", "dtBat", "dtMaint"];
  // Les boutons de la fiche sont ceux de la carte, mais ne font rien : la page ne les traite pas
  const actions = `<a class="primary" href="#lire">${tr("card.go")}</a><button type="button" class="share-btn">${tr("share.button")}</button>`;
  const problem = `<p class="popup-problem"><button type="button" class="card-problem">${tr("card.problem")}</button></p>`;
  host.forEach((el) => {
    const source = GUIDE_EXAMPLES[Number(el.dataset.infocard)];
    if (!source) return;
    const d = { ...source, flags: 0 };
    DATES.forEach((k) => { if (d[k] !== undefined) d[k] = day(d[k]); });
    d.maint = maintenanceLevel(d);
    el.insertAdjacentHTML("afterbegin", `<span class="infocard-marker">${aedMarkerSvg(d)}</span><div class="infocard">${popupHtml(d, actions, problem)}</div>`);
  });
  document.addEventListener("click", (e) => { if (e.target.closest(".infocard a, .infocard button")) e.preventDefault(); });
})();
