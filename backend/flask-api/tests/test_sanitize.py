"""Sanitización de HTML para los bloques de texto enriquecido del material
de curso — defensa contra XSS en texto escrito con el editor WYSIWYG."""
import html

import pytest

from app.services.sanitize import sanitizar_html


def test_sanitizar_html_quita_script():
    # bleach quita la etiqueta <script> pero deja su texto como texto plano
    # (sin ejecutar) — lo que importa es que no quede un <script> real.
    resultado = sanitizar_html("<p>hola</p><script>alert(1)</script>")
    assert "<script>" not in resultado
    assert "</script>" not in resultado
    assert "<p>hola</p>" in resultado


def test_sanitizar_html_quita_atributos_de_evento():
    resultado = sanitizar_html('<img src="x" onerror="alert(1)">')
    assert "onerror" not in resultado


def test_sanitizar_html_quita_protocolo_javascript_en_links():
    resultado = sanitizar_html('<a href="javascript:alert(1)">click</a>')
    assert "javascript:" not in resultado


def test_sanitizar_html_conserva_formato_permitido():
    resultado = sanitizar_html("<p><strong>negrita</strong> y <em>cursiva</em></p><ul><li>uno</li></ul>")
    assert "<strong>negrita</strong>" in resultado
    assert "<em>cursiva</em>" in resultado
    assert "<ul><li>uno</li></ul>" in resultado


def test_sanitizar_html_quita_estilo_peligroso_mantiene_seguro():
    resultado = sanitizar_html('<span style="color:red;position:fixed;top:0">x</span>')
    assert "color: red" in resultado or "color:red" in resultado
    assert "position" not in resultado


@pytest.mark.parametrize("href", [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "&#106;avascript:alert(1)",
    "&#x6A;avascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "file:///etc/passwd",
    "ftp://example.com/x",
])
def test_sanitizar_html_solo_deja_http_https_y_mailto_en_enlaces(href):
    resultado = sanitizar_html(f'<a href="{href}">click</a>')
    assert "href" not in resultado
    assert "click" in resultado


def test_sanitizar_html_entidad_colon_no_reconstruye_javascript():
    # El navegador decodifica las entidades del atributo una sola vez: tras
    # esa decodificación no puede quedar un esquema javascript: real.
    resultado = sanitizar_html('<a href="javascript&colon;alert(1)">click</a>')
    assert "javascript:" not in html.unescape(resultado)


@pytest.mark.parametrize("src", [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "data:image/png;base64,iVBORw0KGgo=",
])
def test_sanitizar_html_bloquea_esquemas_peligrosos_en_imagenes(src):
    resultado = sanitizar_html(f'<img src="{src}" alt="x">')
    assert "src" not in resultado
    assert "data:" not in resultado and "javascript:" not in resultado


def test_sanitizar_html_conserva_enlaces_validos():
    for href in ("http://example.com/a", "https://example.com/a?b=1", "mailto:docente@example.com"):
        assert f'href="{href}"' in sanitizar_html(f'<a href="{href}">x</a>')
    assert 'src="https://example.com/i.png"' in sanitizar_html('<img src="https://example.com/i.png">')


def test_sanitizar_html_fuerza_rel_seguro_y_limita_target():
    resultado = sanitizar_html('<a href="https://example.com" target="_blank" rel="opener">x</a>')
    assert 'rel="noopener noreferrer nofollow"' in resultado
    assert 'target="_blank"' in resultado
    assert "opener\"" not in resultado.replace("noopener", "")

    resultado = sanitizar_html('<a href="https://example.com" target="_top">x</a>')
    assert "target" not in resultado
    assert 'rel="noopener noreferrer nofollow"' in resultado


@pytest.mark.parametrize("html", [
    "<iframe src='https://evil.example'></iframe>",
    "<svg onload=alert(1)><circle/></svg>",
    "<math><mi xlink:href='javascript:alert(1)'>x</mi></math>",
    "<style>body{display:none}</style>",
    "<form action='https://evil.example'><input name='clave'><button>ok</button></form>",
    "<object data='x'></object><embed src='x'>",
    "<base href='https://evil.example/'>",
    "<meta http-equiv='refresh' content='0;url=https://evil.example'>",
    "<link rel='stylesheet' href='https://evil.example/x.css'>",
    "<video src=x onerror=alert(1)></video>",
    "<details open ontoggle=alert(1)>x</details>",
])
def test_sanitizar_html_quita_etiquetas_fuera_de_la_lista(html):
    resultado = sanitizar_html(html).lower()
    for prohibido in ("<iframe", "<svg", "<math", "<style", "<form", "<input", "<button", "<object", "<embed",
                      "<base", "<meta", "<link", "<video", "<details", "onload", "onerror", "ontoggle", "xlink"):
        assert prohibido not in resultado


def test_sanitizar_html_quita_atributos_fuera_de_la_lista():
    resultado = sanitizar_html(
        '<p id="x" class="y" style="color:red" onclick="alert(1)" data-x="1">t</p>'
        '<a href="https://example.com" onmouseover="alert(1)" style="position:fixed">l</a>'
        '<img src="https://example.com/i.png" srcset="javascript:alert(1)" onerror="alert(1)">'
    )
    for prohibido in ("id=", "class=", "onclick", "data-x", "onmouseover", "srcset", "onerror", "position"):
        assert prohibido not in resultado
    # <p> no admite style: solo span y div.
    assert "<p>t</p>" in resultado


def test_sanitizar_html_no_deja_url_ni_expresiones_en_css():
    resultado = sanitizar_html(
        '<div style="background-color: red; background-image: url(javascript:alert(1)); '
        'color: expression(alert(1)); width: 100%">x</div>'
    )
    assert "url(" not in resultado
    assert "expression" not in resultado
    assert "javascript" not in resultado
    assert "width" not in resultado


def test_sanitizar_html_quita_comentarios_y_no_reabre_etiquetas():
    resultado = sanitizar_html("<!--[if IE]><script>alert(1)</script><![endif]--><p>ok</p>")
    assert "<!--" not in resultado
    assert "<script" not in resultado
    resultado = sanitizar_html("<scr<script>ipt>alert(1)</scr</script>ipt>")
    assert "<script" not in resultado.lower()


def test_sanitizar_html_vacio_no_rompe():
    assert sanitizar_html(None) == ""
    assert sanitizar_html("") == ""
