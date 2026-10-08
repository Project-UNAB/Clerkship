"""Sanitización de HTML para los bloques de texto enriquecido del material
de curso — defensa contra XSS en texto escrito con el editor WYSIWYG."""
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


def test_sanitizar_html_vacio_no_rompe():
    assert sanitizar_html(None) == ""
    assert sanitizar_html("") == ""
