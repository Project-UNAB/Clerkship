"""Paginación de los listados: ?page=1&per_page=20, con tope de tamaño.

La respuesta lleva siempre total, page, per_page y pages junto a la lista."""
from math import ceil

from flask import request

PER_PAGE_POR_DEFECTO = 20
PER_PAGE_MAXIMO = 100


def _entero(valor, por_defecto):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return por_defecto


def parametros(per_page_por_defecto=PER_PAGE_POR_DEFECTO) -> tuple:
    """(page, per_page) de la query string. Lo que no sea un número válido
    vuelve al valor por defecto; per_page nunca pasa de PER_PAGE_MAXIMO."""
    page = max(1, _entero(request.args.get("page"), 1))
    per_page = _entero(request.args.get("per_page"), per_page_por_defecto)
    per_page = min(PER_PAGE_MAXIMO, max(1, per_page))
    return page, per_page


def pidio_paginacion() -> bool:
    return "page" in request.args or "per_page" in request.args


def meta(total, page, per_page) -> dict:
    return {
        "total": int(total),
        "page": page,
        "per_page": per_page,
        "pages": ceil(total / per_page) if total else 0,
    }


def paginar(query, page, per_page) -> tuple:
    """(filas de la página, total). El total se cuenta sin el ORDER BY."""
    total = query.order_by(None).count()
    filas = query.limit(per_page).offset((page - 1) * per_page).all() if total else []
    return filas, total
