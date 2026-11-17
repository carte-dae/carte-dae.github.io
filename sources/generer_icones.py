#!/usr/bin/env python3
"""Décline le logo en icônes (favicon, Apple, Android, partage) dans icons/, à partir de generer_logos.py.

Trois variantes de dessin, selon la taille d'affichage :
  - complète : carré vert, croix, France et éclair (grandes tailles) ;
  - simple   : sans la croix (illisible en petit), France agrandie, sans liseré (16 à 48 px) ;
  - maskable : variante complète, réduite pour rester dans la zone sûre (Android découpe l'icône en cercle, carré arrondi…).
Les PNG sont dessinés par Google Chrome en mode sans fenêtre (aucune bibliothèque Python requise).
Lancer depuis la racine du projet : python3 -B sources/generer_icones.py
Seulement les images de partage (une par langue, texte tiré de lang/<langue>.json) : python3 -B sources/generer_icones.py --partage
Seulement le logo animé de la page Guide (templates/partials/logo-anime.html, sans Chrome) : python3 -B sources/generer_icones.py --logo-anime
"""
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
from html import escape
from pathlib import Path

import generer_logos as g

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

POLY, SHAPE = g.courbes(g.COURBES_NE)
CX, CY = g.centroid(POLY)
BOLT_SCALE = 0.82
BOLT_T = (CX - g.BOLT_CENTER[0] + g.BOLT_CENTER[0] * (1 - BOLT_SCALE), CY - g.BOLT_CENTER[1] + g.BOLT_CENTER[1] * (1 - BOLT_SCALE))
xs, ys = [p[0] for p in POLY], [p[1] for p in POLY]
FRANCE_BOX = (min(xs), min(ys), max(xs), max(ys))
FULL_BOX = (FRANCE_BOX[0], 20.393, 179.9, FRANCE_BOX[3])  # France + croix (x 132,7 à 179,9 ; y 20,4 à 67,6)


def drawing(box, fraction, cross, stroke):
    """Dessin (France, éclair, éventuellement la croix) centré dans 200 × 200 : le plus grand côté de `box` occupe `fraction`."""
    bx0, by0, bx1, by1 = box
    s = 200 * fraction / max(bx1 - bx0, by1 - by0)
    tx, ty = 100 - s * (bx0 + bx1) / 2, 100 - s * (by0 + by1) / 2
    edge = f";stroke:#fff;stroke-width:{stroke};stroke-linejoin:round" if stroke else ""
    cross_path = f'<path d="{g.CROSS}" fill="#fff"/>' if cross else ""
    return (f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f})">{cross_path}'
            f'<path d="{SHAPE}" style="fill:#fff{edge}"/>'
            f'<path d="{g.BOLT}" transform="translate({BOLT_T[0]:.2f} {BOLT_T[1]:.2f}) scale({BOLT_SCALE})" fill="{g.GREEN}"/></g>')


def icon(kind, radius=0):
    """SVG 200 × 200 : fond vert (plein cadre si radius = 0, sinon coins arrondis sur fond transparent) + dessin."""
    if kind == "complete":
        art = drawing(FULL_BOX, 0.78, True, 3)
    elif kind == "simple":
        art = drawing(FRANCE_BOX, 0.78, False, 0)
    else:  # maskable : le dessin tient dans le cercle central de 80 % de la largeur
        art = drawing(FULL_BOX, 0.56, True, 3)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="{radius}" fill="{g.GREEN}"/>{art}</svg>')


def render(svg, size, path, width=None, height=None):
    """Dessine un SVG en PNG (fond transparent) avec Chrome."""
    width, height = width or size, height or size
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "p.html"
        page.write_text(f'<!doctype html><meta charset="utf-8"><style>html,body{{margin:0;background:transparent}}svg{{display:block;width:{width}px;height:{height}px}}</style>{svg}', encoding="utf-8")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
                        f"--window-size={width},{height}", f"--screenshot={path}", page.as_uri()],
                       check=True, capture_output=True)


def ico(pngs, path):
    """Fichier .ico contenant des PNG (format accepté par tous les navigateurs actuels)."""
    data = [(int.from_bytes(p.read_bytes()[16:20], "big"), p.read_bytes()) for p in pngs]
    head = struct.pack("<HHH", 0, 1, len(data))
    offset, entries, blobs = 6 + 16 * len(data), b"", b""
    for size, blob in data:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset + len(blobs))
        blobs += blob
    path.write_bytes(head + entries + blobs)


def og_texts(lang):
    """Nom du site et accroche dans la langue (lang/<langue>.json, section « page »), pour l'image de partage."""
    page = json.loads((ROOT / "lang" / f"{lang}.json").read_text(encoding="utf-8"))["page"]
    return page["site.name"], page["og.tagline"]


def og_image(lang):
    """Image de partage 1200 × 630 : logo complet à gauche, nom du site et accroche à droite, dans la langue de la page."""
    name, tagline = og_texts(lang)
    logo = icon("complete", 36).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">', '<svg x="70" y="95" width="440" height="440" viewBox="0 0 200 200">')
    text = (f'<foreignObject x="580" y="95" width="560" height="440"><div xmlns="http://www.w3.org/1999/xhtml" style="height:440px;display:flex;flex-direction:column;justify-content:center;'
            f'font-family:Helvetica Neue,Arial,sans-serif;color:#1d1d1f"><div style="font-size:68px;font-weight:700;line-height:1.18;overflow-wrap:break-word">{escape(name)}</div>'
            f'<div style="font-size:34px;color:#555;margin-top:26px">{escape(tagline)}</div>'
            f'<div style="width:140px;height:8px;border-radius:4px;background:{g.GREEN};margin-top:34px"></div></div></foreignObject>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#fff"/>{logo}{text}</svg>'


def og_images():
    """Une image de partage par langue : icons/og-<langue>.png."""
    for lang in sorted(p.stem for p in (ROOT / "lang").glob("*.json")):
        render(og_image(lang), 0, OUT / f"og-{lang}.png", 1200, 630)


def pinned_tab():
    """Silhouette monochrome (Safari épinglé) : France pleine, éclair découpé."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill-rule="evenodd" fill="#000" d="{SHAPE}"/>'
            f'<path d="{g.BOLT}" transform="translate({BOLT_T[0]:.2f} {BOLT_T[1]:.2f}) scale({BOLT_SCALE})" fill="#fff"/></svg>')


# ---------- Logo animé de la page Guide ----------
# Même dessin que icons/icon-192.png (icon("complete", 36)), avec des éléments qui s'animent en CSS (css/page.css, classes « la-… ») :
# ondes, contour vert qui monte autour de l'éclair, clignotements, puis choc (cœur et rayons orange, éclair jaune). Tout est découpé par le
# contour de la France. Sans animation (réduction des animations demandée), il ne reste que le logo d'origine.
HEART_ISO = ("m56.258 65.861c-18.603 0.19378-35.268 18.7-30.23 43.116 3.7787 18.7 23.641 42.922 58.231 66.37 34.59-23.544 54.452-47.767 58.231-66.37 "
             "5.0383-24.513-11.53-42.922-30.23-43.116-9.5921-0.19378-21.607 4.9414-28.001 17.15-6.3948-12.208-18.409-17.343-28.001-17.15z")  # cœur de l'ISO 7010 E010
HEART_CURVES = [((-18.603, 0.19378), (-35.268, 18.7), (-30.23, 43.116)), ((3.7787, 18.7), (23.641, 42.922), (58.231, 66.37)),
                ((34.59, -23.544), (54.452, -47.767), (58.231, -66.37)), ((5.0383, -24.513), (-11.53, -42.922), (-30.23, -43.116)),
                ((-9.5921, -0.19378), (-21.607, 4.9414), (-28.001, 17.15)), ((-6.3948, -12.208), (-18.409, -17.343), (-28.001, -17.15))]
OUTLINE = 3.0        # épaisseur du contour vert de la charge, en unités de l'éclair (environ 1 px à 64 px)
OUTLINE_TIP = 3.2    # les deux pointes fines sont plafonnées à ce multiple de l'épaisseur : elles restent aiguës sans s'allonger
HEART_SCALE = 0.48
RAYS = 12


def bolt_outline():
    """Contour décalé de l'éclair, uniforme sur les côtés, aux pointes aiguës plafonnées (coordonnées de l'éclair, avant sa transformation)."""
    pts = g.BOLT_PTS
    sign = 1 if sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) > 0 else -1
    out = []
    for i, q in enumerate(pts):
        a, b = pts[i - 1], pts[(i + 1) % len(pts)]
        t1 = ((q[0] - a[0]) / math.hypot(q[0] - a[0], q[1] - a[1]), (q[1] - a[1]) / math.hypot(q[0] - a[0], q[1] - a[1]))
        t2 = ((b[0] - q[0]) / math.hypot(b[0] - q[0], b[1] - q[1]), (b[1] - q[1]) / math.hypot(b[0] - q[0], b[1] - q[1]))
        n1, n2 = (t1[1] * sign, -t1[0] * sign), (t2[1] * sign, -t2[0] * sign)
        k = OUTLINE / (1 + n1[0] * n2[0] + n1[1] * n2[1])
        mx, my = (n1[0] + n2[0]) * k, (n1[1] + n2[1]) * k
        length = math.hypot(mx, my)
        if length > OUTLINE * OUTLINE_TIP:
            mx, my = mx / length * OUTLINE * OUTLINE_TIP, my / length * OUTLINE * OUTLINE_TIP
        out.append((q[0] + mx, q[1] + my))
    return "M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in out) + "Z"


def heart_geometry(cx, cy):
    """Cœur ISO centré sur (cx, cy) : transformation du tracé, et rayons radiaux (perpendiculaires au cercle circonscrit, donc jamais croisés)."""
    dense, cur = [], (56.258, 65.861)
    for c1, c2, e in HEART_CURVES:
        p0 = cur
        a, b, p3 = (p0[0] + c1[0], p0[1] + c1[1]), (p0[0] + c2[0], p0[1] + c2[1]), (p0[0] + e[0], p0[1] + e[1])
        for k in range(80):
            t = k / 80
            dense.append(tuple((1 - t) ** 3 * p0[i] + 3 * (1 - t) ** 2 * t * a[i] + 3 * (1 - t) * t ** 2 * b[i] + t ** 3 * p3[i] for i in (0, 1)))
        cur = p3
    hx, hy = (min(p[0] for p in dense) + max(p[0] for p in dense)) / 2, (min(p[1] for p in dense) + max(p[1] for p in dense)) / 2
    sc = HEART_SCALE
    placed = [((x - hx) * sc + cx, (y - hy) * sc + cy) for x, y in dense]
    # cercle circonscrit : centre sur l'axe, à égale distance de la pointe du bas et des deux points les plus larges
    left = min(p[0] for p in dense)
    yc = ((left - hx) ** 2 + 108.977 ** 2 - 175.347 ** 2) / (2 * (108.977 - 175.347))
    ccx, ccy = cx, (yc - hy) * sc + cy
    lines = []
    for k in range(RAYS):
        theta = 2 * math.pi * (k + 0.5) / RAYS - math.pi / 2
        lo, hi = 0.0, 80.0
        for _ in range(40):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if g.inside(placed, (ccx + mid * math.cos(theta), ccy + mid * math.sin(theta))) else (lo, mid)
        r1, r2 = lo + 3.4, lo + 8.6
        lines.append(f'<line x1="{ccx + r1 * math.cos(theta):.1f}" y1="{ccy + r1 * math.sin(theta):.1f}" x2="{ccx + r2 * math.cos(theta):.1f}" y2="{ccy + r2 * math.sin(theta):.1f}"/>')
    return f"translate({cx:.2f} {cy:.2f}) scale({sc}) translate({-hx:.3f} {-hy:.3f})", "".join(lines)


def logo_anime(suffix="", size=96, animated=True, prefix="la", svg_class="logo-anim"):
    """SVG en ligne du logo de la page Guide : le logo complet, plus (si `animated`) les éléments animés, invisibles tant que le CSS ne les anime pas.
    `suffix` rend unique l'identifiant du découpage quand le logo figure deux fois dans la page (titre et bouton fixé) ;
    `prefix` et `svg_class` nomment les classes (« la » pour le site, « aedw » pour le code que le générateur de lien donne aux autres sites)."""
    bx0, by0, bx1, by1 = FULL_BOX
    scale = 200 * 0.78 / max(bx1 - bx0, by1 - by0)
    tx, ty = 100 - scale * (bx0 + bx1) / 2, 100 - scale * (by0 + by1) / 2
    bolt_t = f"translate({BOLT_T[0]:.2f} {BOLT_T[1]:.2f}) scale({BOLT_SCALE})"
    head = f'<svg class="{svg_class}" viewBox="0 0 200 200" width="{size}" height="{size}" aria-hidden="true" focusable="false">'
    frame = (f'<rect width="200" height="200" rx="36" fill="{g.GREEN}"/>'
             f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})"><path d="{g.CROSS}" fill="#fff"/>'
             f'<path d="{SHAPE}" style="fill:#fff;stroke:#fff;stroke-width:3;stroke-linejoin:round"/>')
    bolt = f'<path d="{g.BOLT}" transform="{bolt_t}" fill="{g.GREEN}"/>'
    if not animated:
        return f"{head}{frame}{bolt}</g></svg>"
    cx, cy = g.centroid([(x * BOLT_SCALE + BOLT_T[0], y * BOLT_SCALE + BOLT_T[1]) for x, y in g.BOLT_PTS])  # centre de gravité de l'éclair
    heart_t, rays = heart_geometry(cx, cy)
    wave = f'cx="{cx:.2f}" cy="{cy:.2f}" r="14" fill="none" stroke="{g.GREEN}" stroke-width="2.4"'
    return (f'{head}<defs><clipPath id="{prefix}-france{suffix}"><path d="{SHAPE}"/></clipPath></defs>{frame}'
            f'<g clip-path="url(#{prefix}-france{suffix})"><circle class="{prefix}-wave1" {wave}/><circle class="{prefix}-wave2" {wave}/>'
            f'<path class="{prefix}-big" d="{bolt_outline()}" transform="{bolt_t}" fill="{g.GREEN}"/>'
            f'<g class="{prefix}-zap" fill="none" stroke="#ff8a00" stroke-linecap="round"><path d="{HEART_ISO}" transform="{heart_t}" stroke-width="{2.0 / HEART_SCALE:.2f}" stroke-linejoin="round"/>'
            f'<g stroke-width="1.9">{rays}</g></g>'
            f'{bolt}<path class="{prefix}-flash" d="{g.BOLT}" transform="{bolt_t}" fill="#ffd21f"/></g></g></svg>')


def widget_animation_css():
    """Le CSS de l'animation du logo (css/page.css), repris tel quel pour le code donné aux autres sites : une seule source, deux noms de classes."""
    lines = (ROOT / "css" / "page.css").read_text(encoding="utf-8").split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith(".logo-anim { --cycle"))
    end = next(i for i, l in enumerate(lines) if i > start and l.startswith("@media (prefers-reduced-motion: reduce) { .logo-anim *"))
    return "\n".join(lines[start:end + 1]).replace(".logo-anim", ".aedw-svg").replace("la-", "aedw-")


def write_logo_anime():
    partials = ROOT / "templates" / "partials"
    (partials / "logo-anime.html").write_text(logo_anime() + "\n", encoding="utf-8")                      # titre de la page
    (partials / "logo-anime-bouton.html").write_text(logo_anime("-bouton", 58) + "\n", encoding="utf-8")   # bouton fixé en haut (cadre blanc de 1 px autour)
    (partials / "logo-anime-bouton-bas.html").write_text(logo_anime("-bas", 58) + "\n", encoding="utf-8")  # bouton du bas de page, identique
    (ROOT / "js" / "widget-logo.js").write_text(widget_logo_js(), encoding="utf-8")


def widget_logo_js():
    """Logos et animation du générateur de lien (js/widget.js), au format que les autres sites recevront : classes « aedw »."""
    dump = lambda value: json.dumps(value, ensure_ascii=False)
    return ("// Logos et animation du générateur de lien vers la carte (js/widget.js). Fichier GÉNÉRÉ par sources/generer_icones.py --logo-anime : ne pas le modifier à la main.\n"
            f"const WIDGET_LOGO_ANIMATED = {dump(logo_anime('', 56, True, 'aedw', 'aedw-svg'))};\n"
            f"const WIDGET_LOGO_STATIC = {dump(logo_anime('', 56, False, 'aedw', 'aedw-svg'))};\n"
            f"const WIDGET_ANIMATION_CSS = {dump(widget_animation_css())};\n")


def main():
    if "--logo-anime" in sys.argv[1:]:  # seulement le logo animé de la page Guide (aucun PNG, donc pas besoin de Chrome)
        write_logo_anime()
        return
    if not Path(CHROME).exists():
        raise SystemExit("Google Chrome est nécessaire pour dessiner les PNG.")
    if "--partage" in sys.argv[1:]:  # seulement les images de partage, sans toucher aux autres icônes
        og_images()
        return
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir()
    (OUT / "favicon.svg").write_text(icon("simple", 36) + "\n", encoding="utf-8")
    (OUT / "safari-pinned-tab.svg").write_text(pinned_tab() + "\n", encoding="utf-8")
    for n in (16, 32, 48):
        render(icon("simple", 44 if n > 16 else 40), n, OUT / f"favicon-{n}.png")
    ico([OUT / f"favicon-{n}.png" for n in (16, 32, 48)], OUT / "favicon.ico")
    for n in (120, 152, 167, 180):  # Apple : plein cadre (iOS arrondit lui-même les coins)
        render(icon("complete"), n, OUT / f"apple-touch-icon-{n}.png")
    shutil.copy(OUT / "apple-touch-icon-180.png", OUT / "apple-touch-icon.png")
    for n in (192, 512):  # Android / Chrome
        render(icon("complete", 36), n, OUT / f"icon-{n}.png")
        render(icon("maskable"), n, OUT / f"icon-maskable-{n}.png")
    render(icon("complete", 36), 150, OUT / "mstile-150.png")  # Windows
    og_images()
    write_logo_anime()
    (OUT / "manifest.webmanifest").write_text(
        '{\n  "name": "Trouver un défibrillateur",\n  "short_name": "DAE France",\n  "lang": "fr",\n  "start_url": "../",\n'
        '  "display": "browser",\n  "background_color": "#ffffff",\n  "theme_color": "#237F52",\n  "icons": [\n'
        '    {"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},\n'
        '    {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},\n'
        '    {"src": "icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable"},\n'
        '    {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}\n  ]\n}\n', encoding="utf-8")


if __name__ == "__main__":
    main()
