#!/usr/bin/env python3
"""Génère le logo à partir du pictogramme ISO 7010 E010 (Wikimedia Commons, CC0).

La France métropolitaine (sans la Corse) y remplace le cœur, en larges courbes.
Lancer depuis la racine du projet : python3 sources/generer_logos.py
"""
import math
from pathlib import Path

CROSS = "m132.73 36.116h47.168v15.723h-47.168zm15.723-15.723h15.723v47.168h-15.723z"
BOLT = "M99.18 80.69l-16.278 33.427h20.638l-36.14 42.05 13.952-32.943h-20.056z"  # éclair d'origine
GREEN = "#237F52"


def centroid(pts):
    """Centre de gravité de la surface du polygone."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        k = x0 * y1 - x1 * y0
        a += k
        cx += (x0 + x1) * k
        cy += (y0 + y1) * k
    return cx / (3 * a), cy / (3 * a)


def inside(pts, pt):
    x, y = pt
    n, hit = len(pts), False
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            hit = not hit
    return hit


# éclair d'origine : sommets absolus et centre de son rectangle englobant
BOLT_PTS = [(99.18, 80.69), (82.902, 114.117), (103.54, 114.117), (67.4, 156.167), (81.352, 123.224), (61.296, 123.224)]
BOLT_CENTER = (82.4, 118.43)


def svg(points, note, shape, bolt_scale=0.82):
    cx, cy = centroid(points)  # l'éclair est centré sur le centre de gravité de la France
    shift = (cx - BOLT_CENTER[0], cy - BOLT_CENTER[1])
    placed = [(BOLT_CENTER[0] + (x - BOLT_CENTER[0]) * bolt_scale + shift[0], BOLT_CENTER[1] + (y - BOLT_CENTER[1]) * bolt_scale + shift[1]) for x, y in BOLT_PTS]
    assert all(inside(points, q) for q in placed), f"l'éclair déborde de la France : {note}"
    tx, ty = shift[0] + BOLT_CENTER[0] * (1 - bolt_scale), shift[1] + BOLT_CENTER[1] * (1 - bolt_scale)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<!-- {note} Dérivé du pictogramme ISO 7010 E010 (Wikimedia Commons, CC0). -->
<svg width="400px" height="400px" version="1.1" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
 <rect width="200" height="200" style="fill:#ffffff"/>
 <rect x="5" y="5" width="190" height="190" style="fill:{GREEN}"/>
 <path d="{CROSS}" style="fill:#ffffff"/>
 <path d="{shape}" style="fill:#ffffff;stroke:#ffffff;stroke-width:3;stroke-linejoin:round"/>
 <path d="{BOLT}" transform="translate({tx:.1f} {ty:.1f}) scale({bolt_scale})" style="fill:{GREEN}"/>
</svg>
'''


# Courbes ajustées sur le contour de la France métropolitaine (sans la Corse). Le contour est coupé aux angles notables (Dunkerque, Wissembourg, Bâle, Genève, Menton,
# Toulon, Camargue, Cerbère, Hendaye, Gironde, Loire, pointe du Raz, Brest, cap Fréhel, Mont-Saint-Michel, Cotentin, Le Havre),
# et chaque tronçon est remplacé par une seule courbe de Bézier cubique (moindres carrés) : de larges courbes, des angles nets.
# Chaque ligne : (départ, contrôle 1, contrôle 2, arrivée), en coordonnées du logo.
COURBES_NE = [
    ((138.4, 108.0), (132.2, 109.8), (126.7, 116.8), (124.9, 124.9)),
    ((124.9, 124.9), (137.2, 121.0), (127.8, 149.3), (137.3, 157.4)),
    ((137.3, 157.4), (132.5, 157.9), (130.0, 166.9), (124.3, 166.0)),
    ((124.3, 166.0), (118.8, 165.6), (116.5, 160.4), (111.8, 162.3)),
    ((111.8, 162.3), (104.6, 155.2), (94.6, 168.2), (98.7, 174.6)),
    ((98.7, 174.6), (84.0, 172.4), (65.6, 172.4), (54.8, 162.5)),
    ((54.8, 162.5), (63.0, 152.4), (58.5, 144.6), (61.1, 134.6)),
    ((61.1, 134.6), (71.2, 148.5), (54.8, 118.7), (51.6, 112.8)),
    ((51.6, 112.8), (55.1, 111.2), (38.5, 106.0), (29.2, 102.2)),
    ((29.2, 102.2), (31.3, 100.2), (32.7, 98.2), (30.5, 97.9)),
    ((30.5, 97.9), (25.0, 92.9), (47.2, 91.7), (49.0, 94.4)),
    ((49.0, 94.4), (54.1, 95.6), (52.8, 93.3), (57.9, 94.5)),
    ((57.9, 94.5), (57.3, 91.9), (55.4, 85.0), (54.2, 81.0)),
    ((54.2, 81.0), (56.1, 81.7), (57.9, 80.2), (59.5, 81.1)),
    ((59.5, 81.1), (58.8, 86.8), (68.7, 86.3), (71.9, 84.7)),
    ((71.9, 84.7), (75.6, 84.1), (85.2, 65.7), (93.3, 63.4)),
    ((93.3, 63.4), (108.6, 77.5), (118.9, 83.2), (143.0, 90.2)),
    ((143.0, 90.2), (140.4, 95.2), (136.5, 102.3), (138.4, 108.0)),
]


def courbes(segments):
    """Rend le tracé SVG et un échantillon de points (pour centrer et vérifier l'éclair)."""
    d = "M%.1f %.1f" % segments[0][0]
    poly = []
    for p0, c1, c2, p3 in segments:
        d += "C%.1f %.1f %.1f %.1f %.1f %.1f" % (c1 + c2 + p3)
        for i in range(1, 21):
            t = i / 20
            poly.append(tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * e for a, b, c, e in zip(p0, c1, c2, p3)))
    return poly, d + "Z"


if __name__ == "__main__":
    poly, shape = courbes(COURBES_NE)
    out = {
        "logo-dae-france.svg": svg(poly, "France en larges courbes, ajustées sur le contour de la métropole, sans la Corse.", shape),
    }
    root = Path(__file__).resolve().parent
    for name, content in out.items():
        (root / name).write_text(content, encoding="utf-8")
