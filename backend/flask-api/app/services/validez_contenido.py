"""Validez de contenido por juicio de expertos (escala 1 a 4).

- V de Aiken: V = S / (n · (c − 1)), con S = Σ (x − 1) y c = 4 categorías.
  Intervalo de confianza del 95 % con el método score de Penfield y Giacobbi (2004).
- I-CVI: proporción de expertos que califican 3 o 4 (Lynn, 1986).
- Kappa modificado: k* = (I-CVI − pc) / (1 − pc), con pc = C(n, A) · 0,5ⁿ
  (Polit, Beck y Owen, 2007).
- S-CVI/Ave: promedio de los I-CVI; S-CVI/UA: proporción de ítems con I-CVI = 1.

Son funciones puras: reciben listas de calificaciones y no tocan la base.
"""
from math import comb, sqrt

CATEGORIAS = 4
Z_95 = 1.959964


def _redondear(valor, decimales=3):
    return None if valor is None else round(valor, decimales)


def aiken(calificaciones: list[int], c: int = CATEGORIAS, z: float = Z_95) -> dict:
    """V de Aiken y su intervalo de confianza del 95 %."""
    n = len(calificaciones)
    if n == 0:
        return {"v": None, "ic_inferior": None, "ic_superior": None}
    k = c - 1
    v = sum(x - 1 for x in calificaciones) / (n * k)
    nk = n * k
    raiz = z * sqrt(4 * nk * v * (1 - v) + z * z)
    inferior = (2 * nk * v + z * z - raiz) / (2 * (nk + z * z))
    superior = (2 * nk * v + z * z + raiz) / (2 * (nk + z * z))
    return {"v": _redondear(v), "ic_inferior": _redondear(max(0.0, inferior)), "ic_superior": _redondear(min(1.0, superior))}


def icvi(calificaciones: list[int]) -> dict:
    """I-CVI y kappa modificado (corrige el acuerdo que se daría por azar)."""
    n = len(calificaciones)
    if n == 0:
        return {"i_cvi": None, "kappa": None}
    acuerdo = sum(1 for x in calificaciones if x >= 3)
    i_cvi = acuerdo / n
    azar = comb(n, acuerdo) * 0.5 ** n
    kappa = (i_cvi - azar) / (1 - azar) if azar < 1 else None
    return {"i_cvi": _redondear(i_cvi), "kappa": _redondear(kappa)}


def resumen_item(calificaciones: list[int]) -> dict:
    validas = [x for x in calificaciones if isinstance(x, int) and 1 <= x <= CATEGORIAS]
    n = len(validas)
    return {
        "n": n,
        "media": _redondear(sum(validas) / n, 2) if n else None,
        "distribucion": {str(v): validas.count(v) for v in range(1, CATEGORIAS + 1)},
        **aiken(validas),
        **icvi(validas),
    }


def resumen_seccion(items: dict[str, list[int]]) -> dict:
    """items: {clave: [calificaciones]} → resultados por ítem y de la sección."""
    por_item = [{"key": clave, **resumen_item(valores)} for clave, valores in items.items()]
    con_datos = [i for i in por_item if i["n"]]
    vs = [i["v"] for i in con_datos]
    icvis = [i["i_cvi"] for i in con_datos]
    return {
        "items": por_item,
        "v_promedio": _redondear(sum(vs) / len(vs)) if vs else None,
        "s_cvi_ave": _redondear(sum(icvis) / len(icvis)) if icvis else None,
        "s_cvi_ua": _redondear(sum(1 for x in icvis if x == 1) / len(icvis)) if icvis else None,
        "expertos": max((i["n"] for i in por_item), default=0),
    }
