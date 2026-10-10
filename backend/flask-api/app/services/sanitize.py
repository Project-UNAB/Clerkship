"""Sanitización de HTML para los bloques de texto enriquecido del material
de curso (CourseContentItem.text_content). El docente lo escribe con un
editor WYSIWYG en el frontend, pero el backend nunca confía en lo que llega
del cliente — por eso se limpia también acá (defensa en profundidad contra
XSS: un <script> o un onerror= inyectado se vería al resto del curso)."""
import re

from bleach.css_sanitizer import CSSSanitizer
from bleach.html5lib_shim import Filter
from bleach.sanitizer import Cleaner

TAGS_PERMITIDOS = [
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike",
    "h1", "h2", "h3", "h4",
    "ul", "ol", "li",
    "a", "img",
    "blockquote", "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "span", "div",
]

ATRIBUTOS_PERMITIDOS = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "span": ["style"],
    "div": ["style"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan"],
}

# Solo permitir estilos inline inofensivos (alineación/color de texto), no
# todo CSS — por ejemplo "position: fixed" podría tapar el resto de la UI.
ESTILOS_PERMITIDOS = ["text-align", "color", "background-color"]

PROTOCOLOS_PERMITIDOS = ["http", "https", "mailto"]

_css_sanitizer = CSSSanitizer(allowed_css_properties=ESTILOS_PERMITIDOS)

_HREF = (None, "href")
_TARGET = (None, "target")
_REL = (None, "rel")
_STYLE = (None, "style")

_DECLARACION_CSS_SEGURA = re.compile(
    r"^[a-z-]+\s*:\s*(?:[a-z]+|#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\))$",
    re.IGNORECASE,
)


class _EnlacesSeguros(Filter):
    """Corre después de la lista blanca. Los enlaces los escribe un usuario,
    así que `rel` y `target` no se le creen: todo <a href> sale con
    rel="noopener noreferrer nofollow" (la pestaña que abre no puede tocar
    window.opener) y `target` solo puede ser _blank."""

    def __iter__(self):
        for token in Filter.__iter__(self):
            if token.get("type") in ("StartTag", "EmptyTag") and token.get("name") == "a":
                attrs = token.get("data") or {}
                if attrs.get(_TARGET) != "_blank":
                    attrs.pop(_TARGET, None)
                attrs.pop(_REL, None)
                if _HREF in attrs:
                    attrs[_REL] = "noopener noreferrer nofollow"
                token["data"] = attrs
            yield token


class _EstilosSeguros(Filter):
    """Los valores de las propiedades CSS permitidas solo pueden ser un color
    o una alineación: palabra, #hex o rgb()/hsl(). Fuera url(), expression()
    y cualquier otra función."""

    def __iter__(self):
        for token in Filter.__iter__(self):
            attrs = token.get("data") if token.get("type") in ("StartTag", "EmptyTag") else None
            if attrs and _STYLE in attrs:
                declaraciones = [d.strip() for d in attrs[_STYLE].split(";")]
                seguras = [d for d in declaraciones if _DECLARACION_CSS_SEGURA.match(d)]
                if seguras:
                    attrs[_STYLE] = "; ".join(seguras) + ";"
                else:
                    del attrs[_STYLE]
            yield token


def sanitizar_html(html: str) -> str:
    # Un Cleaner por llamada: no es seguro compartirlo entre hilos.
    cleaner = Cleaner(
        tags=TAGS_PERMITIDOS,
        attributes=ATRIBUTOS_PERMITIDOS,
        protocols=PROTOCOLOS_PERMITIDOS,
        css_sanitizer=_css_sanitizer,
        strip=True,
        strip_comments=True,
        filters=[_EnlacesSeguros, _EstilosSeguros],
    )
    return cleaner.clean(html or "")
