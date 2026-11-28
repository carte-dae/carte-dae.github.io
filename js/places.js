// Lien direct vers la carte : ?cp=75002 (code postal) ou ?code_insee=75102 (code INSEE d'une commune).
// La table des communes (data/places.json) n'est lue que si l'adresse contient l'un des deux. Chargé avant app.js.
const PLACES_URL = "data/places.json";
const PLACE_ZOOM = 14;
const DAE_ZOOM = 18; // lien vers un défibrillateur précis : même niveau que « Voir sur la carte »

// Valeurs lisibles de l'adresse : { cp, insee }, chacune absente (null) si elle n'a pas la forme attendue
function parsePlaceParams(search) {
  const q = new URLSearchParams(search);
  const cp = (q.get("cp") || "").trim();
  const insee = (q.get("code_insee") || "").trim().toUpperCase();
  return {
    cp: /^\d{5}$/.test(cp) ? cp : null,
    insee: /^(\d{5}|2[AB]\d{3})$/.test(insee) ? insee : null,
  };
}

// Lien vers un défibrillateur : ?gps_dae=43.59947,1.43335 (latitude, longitude) et, facultatif, &id_dae=12345 (identifiant de la base,
// pour choisir parmi plusieurs appareils à la même position). { gps: [lat, lon] | null, id: nombre | null } ; l'id n'est lu qu'avec un gps valide.
function parseDaeParams(search) {
  const q = new URLSearchParams(search);
  const m = /^(-?\d{1,3}(?:\.\d{1,15})?),(-?\d{1,3}(?:\.\d{1,15})?)$/.exec((q.get("gps_dae") || "").replace(/\s+/g, ""));
  const lat = m ? Number(m[1]) : NaN;
  const lon = m ? Number(m[2]) : NaN;
  const ok = Boolean(m) && lat >= -22 && lat <= 52 && lon >= -64 && lon <= 56 && !(lat === 0 && lon === 0); // mêmes règles que les données
  const id = (q.get("id_dae") || "").trim();
  return { gps: ok ? [lat, lon] : null, id: ok && /^\d{1,12}$/.test(id) ? Number(id) : null };
}

// Points [latitude, longitude] à montrer, ou null. Le code INSEE (une seule commune) prime ; le code postal ne sert que s'il est absent ou inconnu.
function resolvePlace(search, table) {
  const { cp, insee } = parsePlaceParams(search);
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  if (insee && own(table.c, insee)) return [[table.c[insee][1], table.c[insee][0]]];
  if (cp && own(table.p, cp)) {
    const points = table.p[cp].filter((code) => own(table.c, code)).map((code) => [table.c[code][1], table.c[code][0]]);
    if (points.length) return points;
  }
  return null;
}

// Adresse sans cp, code_insee, gps_dae ni id_dae (les autres paramètres restent) : « ?a=1&cp=75002 » -> « ?a=1 », « ?cp=75002 » -> « »
function withoutPlaceParams(search) {
  const q = new URLSearchParams(search);
  q.delete("cp");
  q.delete("code_insee");
  q.delete("gps_dae");
  q.delete("id_dae");
  const rest = q.toString();
  return rest ? `?${rest}` : "";
}

// Adresse équivalente à un lieu mémorisé { cp, insee, gps, id } (« ?cp=75002&code_insee=75102 »), pour le retrouver sans le paramètre de l'adresse
function placeSearch(place) {
  const q = new URLSearchParams();
  if (place && place.cp) q.set("cp", place.cp);
  if (place && place.insee) q.set("code_insee", place.insee);
  if (place && place.gps) q.set("gps_dae", place.gps.join(","));
  if (place && place.gps && place.id) q.set("id_dae", place.id);
  const text = q.toString();
  return text ? `?${text}` : "";
}

// Adresse équivalente au lieu mémorisé (texte JSON { cp, insee, gps, id, ts }), ou null s'il est absent, abîmé ou plus ancien que `maxAgeMs`
function rememberedPlace(raw, now, maxAgeMs) {
  try {
    const v = JSON.parse(raw);
    if (!v || !(now - v.ts < maxAgeMs)) return null;
    return placeSearch(v) || null;
  } catch { return null; }
}
