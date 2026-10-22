"""Object catalog + pixel geometry.

Each entry is one auction object.  Variants that share a `silhouette` share
*identical geometry* (same draw function) and therefore an identical
silhouette in the preview: that is the trap pair.  Only the palette differs,
so nothing about the value leaks before the reveal.

Resolution: 24x24 sprites, anchored bottom-centre at (12, 23).
"""

from canvas import Canvas

SPRITE = 24


# --------------------------------------------------------------------------
# geometry
# --------------------------------------------------------------------------
def sil_tv(c: Canvas):
    c.line(10, 2, 7, 0, "metal")
    c.line(14, 2, 17, 0, "metal")
    c.rect(2, 3, 20, 16, "base")
    c.rect(2, 3, 20, 2, "light")
    c.rect(2, 17, 20, 2, "shadow")
    c.rect(4, 5, 13, 10, "dark")
    c.rect(5, 6, 11, 8, "screen")
    c.rect(5, 6, 11, 1, "glass")
    c.rect(6, 7, 2, 2, "glass")
    c.rect(18, 5, 3, 3, "dark")
    c.dot(19, 6, "metal")
    c.dot(19, 8, "metal")
    c.rect(18, 10, 3, 2, "dark")
    c.rect(19, 10, 1, 2, "metal")
    c.rect(4, 19, 4, 2, "base")
    c.rect(16, 19, 4, 2, "base")
    c.rect(4, 21, 4, 1, "shadow")
    c.rect(16, 21, 4, 1, "shadow")


def sil_radio(c: Canvas):
    c.rect(7, 4, 10, 1, "metal")
    c.rect(7, 4, 1, 4, "metal")
    c.rect(16, 4, 1, 4, "metal")
    c.rect(3, 7, 18, 14, "base")
    c.rect(3, 7, 18, 2, "light")
    c.rect(3, 19, 18, 2, "shadow")
    c.rect(5, 10, 8, 10, "dark")
    for y in range(11, 19, 2):
        for x in range(6, 12, 2):
            c.dot(x, y, "metal")
    c.rect(15, 9, 4, 4, "screen")
    c.rect(15, 9, 4, 1, "glass")
    c.rect(15, 14, 4, 1, "dark")
    c.rect(17, 15, 2, 2, "metal")
    c.rect(4, 21, 3, 1, "shadow")
    c.rect(17, 21, 3, 1, "shadow")


def sil_toolbox(c: Canvas):
    c.rect(7, 3, 10, 1, "metal")
    c.rect(7, 3, 1, 5, "metal")
    c.rect(16, 3, 1, 5, "metal")
    c.rect(2, 8, 20, 4, "base")
    c.rect(2, 8, 20, 1, "light")
    c.rect(2, 12, 20, 9, "base2")
    c.rect(2, 12, 20, 1, "shadow")
    c.rect(2, 20, 20, 1, "shadow")
    c.rect(5, 11, 3, 2, "metal")
    c.rect(16, 11, 3, 2, "metal")
    c.rect(4, 21, 4, 1, "shadow")
    c.rect(16, 21, 4, 1, "shadow")


def sil_drill(c: Canvas):
    c.rect(6, 8, 11, 7, "base")
    c.rect(6, 8, 11, 2, "light")
    c.rect(6, 13, 11, 2, "shadow")
    c.rect(17, 9, 3, 5, "metal")
    c.rect(20, 11, 3, 1, "metal")
    c.rect(8, 15, 5, 7, "base")
    c.rect(8, 15, 5, 1, "light")
    c.rect(8, 20, 5, 2, "shadow")
    c.rect(13, 14, 2, 3, "accent")
    c.rect(7, 6, 9, 2, "dark")


def sil_chair(c: Canvas):
    c.rect(5, 3, 4, 11, "base")
    c.rect(5, 3, 4, 1, "light")
    c.rect(5, 6, 4, 1, "shadow")
    c.rect(5, 9, 4, 1, "shadow")
    c.rect(5, 13, 14, 3, "base2")
    c.rect(5, 13, 14, 1, "light")
    c.rect(5, 15, 14, 1, "shadow")
    c.rect(6, 16, 2, 7, "metal")
    c.rect(16, 16, 2, 7, "metal")
    c.rect(7, 19, 10, 1, "metal")


def sil_lamp(c: Canvas):
    c.poly([(5, 4), (19, 4), (16, 12), (8, 12)], "base")
    c.poly([(6, 5), (10, 5), (9, 11), (8, 11)], "light")
    c.rect(11, 12, 2, 7, "metal")
    c.rect(11, 12, 1, 7, "light")
    c.rect(10, 11, 4, 1, "glass")
    c.rect(7, 19, 10, 3, "base2")
    c.rect(7, 19, 10, 1, "light")
    c.rect(7, 21, 10, 1, "shadow")


def sil_vase(c: Canvas):
    c.rect(9, 2, 6, 2, "base2")
    c.rect(10, 3, 4, 5, "base")
    c.ellipse(7, 7, 17, 20, "base")
    c.rect(10, 5, 4, 1, "accent")
    c.ellipse(9, 16, 15, 20, "shadow")
    c.ellipse(8, 8, 10, 14, "light")


def sil_comic(c: Canvas):
    c.rect(5, 3, 14, 18, "base")
    c.rect(5, 3, 1, 18, "light")
    c.rect(18, 3, 1, 18, "shadow")
    c.rect(6, 4, 12, 16, "accent")
    c.rect(7, 6, 10, 8, "paper")
    c.rect(7, 6, 10, 1, "dark")
    c.rect(7, 16, 10, 1, "dark")
    c.rect(7, 18, 6, 1, "light")


def sil_jacket(c: Canvas):
    c.rect(3, 7, 3, 9, "base")
    c.rect(18, 7, 3, 9, "base")
    c.rect(3, 13, 3, 3, "shadow")
    c.rect(18, 13, 3, 3, "shadow")
    c.poly([(6, 6), (9, 3), (15, 3), (18, 6), (18, 10), (16, 10), (16, 21), (8, 21), (8, 10), (6, 10)], "base")
    c.rect(6, 5, 12, 1, "light")
    c.poly([(9, 3), (12, 7), (15, 3)], "accent")
    c.rect(11, 7, 1, 14, "dark")
    c.dot(12, 8, "metal")
    c.rect(8, 19, 8, 2, "shadow")
    c.rect(8, 10, 8, 1, "shadow")


def sil_sneaker(c: Canvas):
    c.poly([(3, 18), (3, 14), (5, 12), (9, 11), (10, 8), (14, 8), (16, 11), (19, 13), (21, 15), (21, 18)], "base")
    c.rect(4, 11, 4, 4, "light")
    c.rect(3, 18, 19, 3, "paper")
    c.rect(4, 20, 17, 1, "grey3")
    c.rect(5, 17, 15, 1, "shadow")
    c.rect(10, 9, 4, 1, "shadow")
    c.rect(10, 11, 4, 1, "shadow")
    c.rect(10, 13, 4, 1, "shadow")
    c.rect(16, 14, 3, 2, "accent")


def sil_trophy(c: Canvas):
    c.poly([(7, 3), (17, 3), (15, 11), (9, 11)], "base")
    c.rect(9, 3, 2, 8, "light")
    c.rect(4, 5, 3, 1, "metal")
    c.rect(4, 5, 1, 4, "metal")
    c.rect(4, 8, 3, 1, "metal")
    c.rect(17, 5, 3, 1, "metal")
    c.rect(19, 5, 1, 4, "metal")
    c.rect(17, 8, 3, 1, "metal")
    c.rect(11, 11, 2, 4, "metal")
    c.rect(11, 11, 1, 4, "light")
    c.rect(7, 15, 10, 2, "base2")
    c.rect(6, 17, 12, 3, "base2")
    c.rect(6, 19, 12, 1, "shadow")
    c.rect(10, 16, 4, 1, "dark")


def sil_mixer(c: Canvas):
    c.rect(3, 19, 18, 3, "base2")
    c.rect(3, 19, 18, 1, "light")
    c.rect(3, 21, 18, 1, "shadow")
    c.rect(17, 8, 3, 12, "base2")
    c.rect(6, 5, 14, 5, "base")
    c.rect(6, 5, 14, 1, "light")
    c.rect(6, 9, 14, 1, "shadow")
    c.rect(4, 6, 3, 2, "base2")
    c.poly([(7, 11), (16, 11), (15, 17), (8, 17)], "base")
    c.rect(7, 11, 9, 1, "light")
    c.rect(9, 13, 1, 4, "metal")
    c.rect(11, 13, 1, 4, "metal")
    c.rect(13, 13, 1, 4, "metal")
    c.rect(8, 7, 2, 2, "accent")


def sil_crate(c: Canvas):
    c.rect(3, 6, 18, 15, "wood")
    c.rect(3, 6, 18, 1, "light")
    c.rect(3, 20, 18, 1, "shadow")
    c.rect(3, 10, 18, 1, "dark")
    c.rect(3, 14, 18, 1, "dark")
    c.line(4, 7, 19, 19, "dark")
    c.rect(5, 8, 6, 3, "paper")
    c.rect(5, 8, 6, 1, "dark")
    c.rect(16, 11, 4, 4, "gold")
    c.rect(17, 9, 2, 2, "metal")
    c.dot(17, 12, "dark")


SHAPES = {
    "sil_tv": sil_tv,
    "sil_radio": sil_radio,
    "sil_toolbox": sil_toolbox,
    "sil_drill": sil_drill,
    "sil_chair": sil_chair,
    "sil_lamp": sil_lamp,
    "sil_vase": sil_vase,
    "sil_comic": sil_comic,
    "sil_jacket": sil_jacket,
    "sil_sneaker": sil_sneaker,
    "sil_trophy": sil_trophy,
    "sil_mixer": sil_mixer,
    "sil_crate": sil_crate,
}


# --------------------------------------------------------------------------
# palette roles per variant
# --------------------------------------------------------------------------
ROLES = {
    "tv_bw": dict(base="grey2", light="grey3", shadow="grey1", dark="ink", metal="grey4",
                  screen="night", glass="grey3", accent="grey4"),
    "tv_studio": dict(base="blue2", light="blue3", shadow="blue1", dark="ink", metal="grey4",
                      screen="night", glass="teal3", accent="gold1"),
    "radio_plastic": dict(base="red3", light="red4", shadow="red2", dark="ink", metal="grey3",
                          screen="teal1", glass="teal3", accent="yellow1", base2="red2"),
    "radio_bakelite": dict(base="brown3", light="brown4", shadow="brown2", dark="ink", metal="grey4",
                           screen="brown1", glass="green4", accent="gold1", base2="brown2"),
    "toolbox_rusty": dict(base="orange2", light="orange3", shadow="brown2", dark="ink", metal="grey2",
                          accent="red3", base2="brown3"),
    "toolbox_pro": dict(base="red3", light="red4", shadow="red2", dark="ink", metal="grey4",
                        accent="yellow1", base2="red2"),
    "drill_corded": dict(base="orange3", light="yellow1", shadow="orange1", dark="ink", metal="grey3",
                         accent="grey1", base2="orange2"),
    "chair_folding": dict(base="grey2", light="grey3", shadow="grey1", dark="ink", metal="grey3",
                          accent="teal2", base2="grey1"),
    "chair_designer": dict(base="brown4", light="brown5", shadow="brown3", dark="ink", metal="gold1",
                           accent="red3", base2="brown3"),
    "lamp_tiffany": dict(base="green2", light="green4", shadow="green1", dark="ink", metal="gold1",
                         glass="yellow1", accent="purple3", base2="green1"),
    "vase_repro": dict(base="red3", light="red4", shadow="red2", dark="ink", accent="yellow1",
                       base2="teal2"),
    "vase_ming": dict(base="blue3", light="blue4", shadow="blue2", dark="ink", accent="white",
                      base2="blue1"),
    "comic_slab": dict(base="grey3", light="grey4", shadow="grey2", dark="ink", accent="red3",
                       paper="grey4"),
    "jacket_work": dict(base="blue2", light="blue3", shadow="blue1", dark="ink", accent="orange2",
                        metal="grey2"),
    "jacket_leather": dict(base="brown2", light="brown3", shadow="brown1", dark="ink", accent="gold1",
                            metal="gold2"),
    "sneakers_boxed": dict(base="grey4", light="white", shadow="grey3", dark="ink", accent="red3",
                           paper="white", grey3="grey3"),
    "trophy_participant": dict(base="grey2", light="grey3", shadow="grey1", dark="ink",
                               metal="grey3", base2="brown3"),
    "trophy_champions": dict(base="gold1", light="gold2", shadow="brown3", dark="ink",
                             metal="gold2", base2="brown3"),
    "mixer_basic": dict(base="grey4", light="white", shadow="grey3", dark="ink", metal="grey2",
                        accent="red3", base2="grey2"),
    "mixer_vintage": dict(base="pink1", light="pink2", shadow="red2", dark="ink", metal="gold1",
                          accent="teal3", base2="red3"),
    "crate_locked": dict(base="brown4", light="brown5", shadow="brown3", dark="ink", paper="grey4",
                         gold="gold1", metal="grey3", wood="brown4", base2="brown3"),
    "crate_cardboard": dict(base="brown3", light="brown4", shadow="brown2", dark="ink", paper="brown6",
                            gold="brown5", metal="grey2", wood="brown3", base2="brown2"),
}


# --------------------------------------------------------------------------
# catalog
# --------------------------------------------------------------------------
CATALOG = [
    # electronics
    dict(id="tv_bw", name="Televisor en blanco y negro", category="electronics", silhouette="sil_tv",
         value=35, rarity="common", hook=False, width=20, height=22,
         hints=["pesa como un muerto", "huele a plástico viejo"]),
    dict(id="tv_studio", name="Monitor de estudio de los 80", category="electronics", silhouette="sil_tv",
         value=420, rarity="rare", hook=True, width=20, height=22,
         hints=["la carcasa parece buena", "el cristal está intacto"]),
    dict(id="radio_plastic", name="Radio de plástico", category="electronics", silhouette="sil_radio",
         value=20, rarity="common", hook=False, width=18, height=19,
         hints=["el dial gira", "suena a hueco"]),
    dict(id="radio_bakelite", name="Radio de baquelita", category="electronics", silhouette="sil_radio",
         value=340, rarity="rare", hook=True, width=18, height=19,
         hints=["el dial gira", "tiene un brillo raro"]),
    # tools
    dict(id="toolbox_rusty", name="Caja de herramientas oxidada", category="tools", silhouette="sil_toolbox",
         value=30, rarity="common", hook=False, width=20, height=19,
         hints=["pesa lo suyo", "las bisagras están sueltas"]),
    dict(id="toolbox_pro", name="Maletín de herramientas pro", category="tools", silhouette="sil_toolbox",
         value=360, rarity="rare", hook=False, width=20, height=19,
         hints=["pesa lo suyo", "no se abre del todo"]),
    dict(id="drill_corded", name="Taladro con cable", category="tools", silhouette="sil_drill",
         value=170, rarity="uncommon", hook=False, width=21, height=19,
         hints=["el cable está enrollado", "tiene polvo de obra"]),
    # furniture
    dict(id="chair_folding", name="Silla plegable", category="furniture", silhouette="sil_chair",
         value=15, rarity="common", hook=False, width=18, height=20,
         hints=["cojea un poco", "huele a sótano"]),
    dict(id="chair_designer", name="Silla de diseñador", category="furniture", silhouette="sil_chair",
         value=500, rarity="rare", hook=True, width=18, height=20,
         hints=["cojea un poco", "la madera pesa de más"]),
    dict(id="lamp_tiffany", name="Lámpara Tiffany", category="furniture", silhouette="sil_lamp",
         value=380, rarity="uncommon", hook=False, width=16, height=20,
         hints=["el cristal tintinea", "está boca abajo"]),
    # collectibles
    dict(id="vase_repro", name="Jarrón réplica", category="collectibles", silhouette="sil_vase",
         value=25, rarity="common", hook=False, width=12, height=21,
         hints=["tiene una grieta", "el brillo es plano"]),
    dict(id="vase_ming", name="Jarrón Ming auténtico", category="collectibles", silhouette="sil_vase",
         value=900, rarity="rare", hook=True, width=12, height=21,
         hints=["tiene una grieta", "el brillo es profundo"]),
    dict(id="comic_slab", name="Cómic precintado", category="collectibles", silhouette="sil_comic",
         value=240, rarity="uncommon", hook=False, width=15, height=19,
         hints=["está rígido", "no se puede hojear"]),
    # clothing
    dict(id="jacket_work", name="Chaqueta de trabajo", category="clothing", silhouette="sil_jacket",
         value=20, rarity="common", hook=False, width=18, height=19,
         hints=["huele a gasolina", "tiene manchas"]),
    dict(id="jacket_leather", name="Chaqueta de cuero", category="clothing", silhouette="sil_jacket",
         value=280, rarity="rare", hook=False, width=18, height=19,
         hints=["huele a gasolina", "el forro está entero"]),
    dict(id="sneakers_boxed", name="Zapatillas sin estrenar", category="clothing", silhouette="sil_sneaker",
         value=120, rarity="uncommon", hook=False, width=20, height=13,
         hints=["hay una caja", "la suela está limpia"]),
    # sports
    dict(id="trophy_participant", name="Trofeo de participación", category="sports", silhouette="sil_trophy",
         value=15, rarity="common", hook=False, width=17, height=19,
         hints=["pesa menos de lo que parece", "la placa está en blanco"]),
    dict(id="trophy_champions", name="Trofeo de campeón", category="sports", silhouette="sil_trophy",
         value=650, rarity="rare", hook=True, width=17, height=19,
         hints=["pesa menos de lo que parece", "la placa está grabada"]),
    # kitchen
    dict(id="mixer_basic", name="Batidora básica", category="kitchen", silhouette="sil_mixer",
         value=25, rarity="common", hook=False, width=17, height=18,
         hints=["el vaso está suelto", "gira con ruido"]),
    dict(id="mixer_vintage", name="Batidora vintage", category="kitchen", silhouette="sil_mixer",
         value=450, rarity="rare", hook=True, width=17, height=18,
         hints=["el vaso está suelto", "el motor suena fino"]),
    # mystery
    dict(id="crate_locked", name="Caja cerrada con candado", category="mystery", silhouette="sil_crate",
         value=480, rarity="rare", hook=True, width=19, height=17,
         hints=["no se puede abrir", "pesa y no suena a hueco"]),
    dict(id="crate_cardboard", name="Caja de cartón cerrada", category="mystery", silhouette="sil_crate",
         value=45, rarity="common", hook=False, width=19, height=17,
         hints=["no se puede abrir", "pesa y no suena a hueco"]),
]

CATEGORIES = [
    "electronics", "tools", "furniture", "collectibles",
    "clothing", "sports", "kitchen", "mystery",
]

CATEGORY_LABELS = {
    "electronics": "Electrónica",
    "tools": "Herramientas",
    "furniture": "Muebles",
    "collectibles": "Coleccionables",
    "clothing": "Ropa",
    "sports": "Deportes",
    "kitchen": "Cocina",
    "mystery": "Misterio",
}
