"""Carga de referencias clínicas: lectura y validación de fichas, sin base de datos.

Solo se prueban las funciones puras (lectura de archivos y plan de inserción).
La conexión a PostgreSQL y el esquema real se revisan al ejecutar el script,
no aquí.
"""

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import cargar_referencias as cr  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SUBTEMA = "Pancreatitis aguda"


def _ficha(carpeta: Path, nombre: str, subtema: str, contenido: str = "Contenido de prueba.") -> Path:
    ruta = carpeta / nombre
    ruta.write_text(f"subtema: {subtema}\n{contenido}\n", encoding="utf-8")
    return ruta


def test_lee_una_ficha_valida(tmp_path):
    ruta = _ficha(tmp_path, "pancreatitis.md", SUBTEMA, "Línea uno.\n\nLínea dos.")

    fichas = cr.leer_fichas(tmp_path)

    assert len(fichas) == 1
    ficha = fichas[0]
    assert ficha.ruta == ruta
    assert ficha.subtema == SUBTEMA
    assert ficha.contenido == "Línea uno.\n\nLínea dos."


def test_la_primera_linea_lleva_el_encabezado_y_el_resto_es_contenido(tmp_path):
    ruta = tmp_path / "ficha.txt"
    ruta.write_text("Subtema:   Pancreatitis aguda  \r\nCuerpo de la ficha.\r\n", encoding="utf-8")

    ficha = cr.leer_ficha(ruta)

    assert ficha.subtema == SUBTEMA
    assert ficha.contenido == "Cuerpo de la ficha."
    assert "subtema:" not in ficha.contenido.lower()


@pytest.mark.parametrize(
    ("declarado", "esperado"),
    [
        ("PANCREATITIS AGUDA", "Pancreatitis aguda"),
        ("enfermedad por reflujo gastroesofagico (erge)", "Enfermedad por reflujo gastroesofagico (ERGE)"),
        ("ENFERMEDAD POR REFLUJO GASTROESOFÁGICO (ERGE)", "Enfermedad por reflujo gastroesofagico (ERGE)"),
        ("  Síndrome de intestino irritable (SII)  ", "Sindrome de intestino irritable (SII)"),
    ],
)
def test_acepta_el_subtema_sin_importar_mayusculas_ni_tildes(tmp_path, declarado, esperado):
    _ficha(tmp_path, "ficha.md", declarado)

    assert cr.leer_fichas(tmp_path)[0].subtema == esperado


def test_rechaza_un_subtema_que_no_esta_en_el_catalogo(tmp_path):
    _ficha(tmp_path, "inventada.md", "Dolor abdominal inespecifico")

    with pytest.raises(cr.ErrorFichas) as excinfo:
        cr.leer_fichas(tmp_path)

    mensaje = str(excinfo.value)
    assert "inventada.md" in mensaje
    assert "no coincide con ningún SUBTEMAS" in mensaje


def test_rechaza_un_archivo_sin_encabezado(tmp_path):
    (tmp_path / "sin_encabezado.md").write_text("Solo contenido, sin la línea de subtema.", encoding="utf-8")

    with pytest.raises(cr.ErrorFichas, match="primera línea"):
        cr.leer_fichas(tmp_path)


def test_rechaza_un_encabezado_sin_subtema(tmp_path):
    (tmp_path / "vacio.md").write_text("subtema:\nContenido.", encoding="utf-8")

    with pytest.raises(cr.ErrorFichas, match="primera línea"):
        cr.leer_fichas(tmp_path)


def test_rechaza_una_ficha_sin_contenido(tmp_path):
    (tmp_path / "hueca.md").write_text("subtema: Pancreatitis aguda\n\n   \n\n", encoding="utf-8")

    with pytest.raises(cr.ErrorFichas, match="no tiene contenido"):
        cr.leer_fichas(tmp_path)


def test_rechaza_varias_fichas_e_informa_todos_los_problemas(tmp_path):
    _ficha(tmp_path, "buena.md", SUBTEMA)
    _ficha(tmp_path, "mala_subtema.md", "Otro subtema")
    (tmp_path / "mala_formato.txt").write_text("Sin encabezado.", encoding="utf-8")

    with pytest.raises(cr.ErrorFichas) as excinfo:
        cr.leer_fichas(tmp_path)

    assert len(excinfo.value.errores) == 2
    texto = str(excinfo.value)
    assert "mala_subtema.md" in texto and "mala_formato.txt" in texto


def test_ignora_archivos_que_no_son_md_ni_txt_y_no_entra_en_subcarpetas(tmp_path):
    _ficha(tmp_path, "valida.md", SUBTEMA)
    (tmp_path / "notas.pdf").write_bytes(b"%PDF-1.4 sin encabezado")
    subcarpeta = tmp_path / "otra_carpeta"
    subcarpeta.mkdir()
    _ficha(subcarpeta, "anidada.txt", SUBTEMA, "No debería leerse.")

    fichas = cr.leer_fichas(tmp_path)

    assert [f.ruta.name for f in fichas] == ["valida.md"]


def test_carpeta_inexistente(tmp_path):
    with pytest.raises(cr.ErrorFichas, match="no existe"):
        cr.leer_fichas(tmp_path / "no_existe")


def test_carpeta_sin_fichas(tmp_path):
    with pytest.raises(cr.ErrorFichas, match="No hay archivos .md ni .txt"):
        cr.leer_fichas(tmp_path)


def test_no_duplica_lo_que_ya_existe_ni_lo_repetido_en_la_carpeta(tmp_path):
    una = cr.Ficha(tmp_path / "una.md", SUBTEMA, "Mismo texto.")
    otra_igual = cr.Ficha(tmp_path / "otra.md", SUBTEMA, "Mismo texto.")
    distinta = cr.Ficha(tmp_path / "distinta.md", SUBTEMA, "Otro texto.")

    plan = cr.planificar([una, otra_igual, distinta], existentes={(SUBTEMA, "Otro texto.")})

    assert plan.nuevas == [una]
    assert plan.repetidas_en_lote == [otra_igual]
    assert plan.ya_existen == [distinta]


def test_todas_las_fichas_son_nuevas_si_la_tabla_esta_vacia():
    fichas = [
        cr.Ficha(Path("a.md"), "Pancreatitis aguda", "Texto A."),
        cr.Ficha(Path("b.md"), "Pancreatitis aguda", "Texto B."),
    ]

    plan = cr.planificar(fichas, existentes=set())

    assert plan.nuevas == fichas
    assert plan.ya_existen == []
    assert plan.repetidas_en_lote == []


def test_la_ficha_de_ejemplo_es_valida_y_esta_marcada_como_ejemplo():
    carpeta = RAIZ / "scripts" / "referencias_ejemplo"

    fichas = cr.leer_fichas(carpeta)

    assert len(fichas) == 1
    ficha = fichas[0]
    assert ficha.subtema == "Enfermedad por reflujo gastroesofagico (ERGE)"
    assert "EJEMPLO, no validado clínicamente" in ficha.contenido
    assert "no contiene contenido clínico real" in ficha.contenido.lower()


def test_la_plantilla_de_ejemplo_se_reconoce_y_no_se_carga():
    from pathlib import Path

    from scripts import cargar_referencias as cr

    carpeta = Path(cr.__file__).parent / "referencias_ejemplo"
    fichas = cr.leer_fichas(carpeta)
    assert fichas and all(cr.es_plantilla(f) for f in fichas)
