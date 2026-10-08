"""Sanitización de HTML para los bloques de texto enriquecido del material
de curso (CourseContentItem.text_content). El docente lo escribe con un
editor WYSIWYG en el frontend, pero el backend nunca confía en lo que llega
del cliente — por eso se limpia también acá (defensa en profundidad contra
XSS: un <script> o un onerror= inyectado se vería al resto del curso)."""
import bleach
from bleach.css_sanitizer import CSSSanitizer

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


def sanitizar_html(html: str) -> str:
    return bleach.clean(
        html or "",
        tags=TAGS_PERMITIDOS,
        attributes=ATRIBUTOS_PERMITIDOS,
        protocols=PROTOCOLOS_PERMITIDOS,
        css_sanitizer=_css_sanitizer,
        strip=True,
    )
