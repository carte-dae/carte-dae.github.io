// Contact (page « Guide ») : l'adresse n'existe pas en clair dans la page ni dans ce fichier ; elle est assemblée au clic.
// Un ralentisseur contre les collecteurs d'adresses qui lisent le texte des pages, pas une protection : toute personne qui lit ce script la retrouve.
// T est une table de caractères (qui ressemble à une adresse, volontairement) ; M et A sont des positions dans T.
(() => {
  const T = "gkiaybecwtvmoudl@rsianocu.cool";
  const M = [11, 3, 2, 15, 9, 27];
  const A = [20, 15, 15, 6, 0, 6, 14, 29, 4, 25, 3, 25, 14, 6, 10, 16, 0, 11, 20, 2, 29, 25, 7, 12, 11];
  const build = (ix) => ix.map((i) => T[i]).join("");
  const link = document.getElementById("contact-link");
  if (!link) return;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    if (!e.isTrusted) return; // ignore les clics fabriqués par du code (.click())
    const address = build(A);
    // l'adresse remplace le lien, en texte simple : lisible et copiable même si la messagerie ne s'ouvre pas
    const text = document.createElement("span");
    text.id = "contact-address";
    text.textContent = address;
    link.replaceWith(text);
    location.href = build(M) + ":" + address; // ouvre la messagerie si elle est configurée
  });
})();
