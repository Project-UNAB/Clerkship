"""Fase 4 — imagen de portada de los cursos: validación (formato, magic
bytes, peso, dimensiones), recorte y recompresión con Pillow, subida a R2 con
nombre aleatorio, reemplazo con limpieza de la anterior y permisos.

No toca la base real ni R2 — todo con monkeypatch."""
import io
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token
from PIL import Image

import app.routes.cursos as cursos_routes
from app import storage
from app.models import Course
from app.services import portadas
from tests.fakes import ConsultaFalsa


def _imagen(formato="JPEG", tamano=(1600, 900), color=(30, 120, 200), modo="RGB", **guardar) -> bytes:
    salida = io.BytesIO()
    Image.new(modo, tamano, color).save(salida, format=formato, **guardar)
    return salida.getvalue()


def _headers(app, role, identity):
    with app.app_context():
        token = create_access_token(identity=str(identity), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _archivo(contenido: bytes, nombre="portada.jpg"):
    return (io.BytesIO(contenido), nombre)


@pytest.fixture(autouse=True)
def _config(app):
    anterior = (app.config.get("COURSE_COVER_MAX_MB"), app.config.get("PROPAGATE_EXCEPTIONS"))
    app.config["COURSE_COVER_MAX_MB"] = 2
    yield
    app.config["COURSE_COVER_MAX_MB"], app.config["PROPAGATE_EXCEPTIONS"] = anterior


class _R2:
    """R2 falso: anota lo que se sube y lo que se borra."""

    def __init__(self, app, monkeypatch, falla_en=None):
        self.objetos = {}
        self.borrados = []
        self._falla_en = falla_en
        with app.app_context():
            monkeypatch.setattr(cursos_routes.storage, "subir_bytes", self._subir)
            monkeypatch.setattr(cursos_routes.storage, "borrar", self._borrar)
            monkeypatch.setattr(storage, "url_imagen", lambda clave, **kw: f"https://r2.example/{clave}?firma=x")

    def _subir(self, clave, contenido, mime):
        if self._falla_en is not None and len(self.objetos) == self._falla_en:
            raise RuntimeError("R2 no responde")
        self.objetos[clave] = (contenido, mime)

    def _borrar(self, clave):
        self.borrados.append(clave)
        self.objetos.pop(clave, None)


def _preparar(app, monkeypatch, user, curso=None, commit_falla=None):
    estado = {"commits": 0, "rollbacks": 0, "agregados": []}

    def commit():
        if commit_falla is not None:
            raise commit_falla
        estado["commits"] += 1

    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes, "_codigo_nuevo", lambda: "ABCD2345")
        monkeypatch.setattr(cursos_routes.db.session, "add", estado["agregados"].append)
        monkeypatch.setattr(cursos_routes.db.session, "commit", commit)
        monkeypatch.setattr(cursos_routes.db.session, "rollback", lambda: estado.__setitem__("rollbacks", estado["rollbacks"] + 1))
    return estado


def _curso(docente_id, cover=None):
    return Course(id=uuid.uuid4(), teacher_id=docente_id, name="Gastro I", enrollment_mode="CODE", cover_image_key=cover)


# ─────────────────────────── Procesamiento ───────────────────────────

@pytest.mark.parametrize("formato,nombre", [("JPEG", "foto.jpg"), ("JPEG", "foto.JPEG"), ("PNG", "foto.png"), ("WEBP", "foto.webp")])
def test_acepta_jpg_png_y_webp_y_normaliza_el_tamano(app, formato, nombre):
    with app.app_context():
        portada, miniatura = portadas.procesar_portada(nombre, _imagen(formato, (1600, 900)))

    grande, chica = Image.open(io.BytesIO(portada)), Image.open(io.BytesIO(miniatura))
    assert (grande.format, grande.size) == ("WEBP", (1200, 600))
    assert (chica.format, chica.size) == ("WEBP", (400, 200))
    assert len(miniatura) < len(portada) or len(portada) < 4096


def test_imagen_chica_pero_valida_se_escala_al_tamano_estandar(app):
    with app.app_context():
        portada, _ = portadas.procesar_portada("foto.png", _imagen("PNG", (400, 200)))
    assert Image.open(io.BytesIO(portada)).size == (1200, 600)


def test_png_con_transparencia_se_aplana_sobre_blanco(app):
    transparente = _imagen("PNG", (800, 400), color=(0, 0, 0, 0), modo="RGBA")
    with app.app_context():
        portada, _ = portadas.procesar_portada("logo.png", transparente)
    imagen = Image.open(io.BytesIO(portada)).convert("RGB")
    assert all(canal > 245 for canal in imagen.getpixel((600, 300)))


def test_el_encuadre_decide_que_parte_queda_en_el_recorte(app):
    # Mitad izquierda roja, mitad derecha azul, en una imagen muy ancha (4:1).
    ancha = Image.new("RGB", (2400, 600), (220, 20, 20))
    ancha.paste((20, 20, 220), (1200, 0, 2400, 600))
    salida = io.BytesIO()
    ancha.save(salida, format="PNG")

    def color_dominante(foco_x):
        with app.app_context():
            portada, _ = portadas.procesar_portada("ancha.png", salida.getvalue(), foco_x, 0.5)
        r, _g, b = Image.open(io.BytesIO(portada)).convert("RGB").getpixel((600, 300))
        return "rojo" if r > b else "azul"

    assert color_dominante("0") == "rojo"
    assert color_dominante("1") == "azul"
    # Valores absurdos no rompen: se acotan a 0..1 o se ignoran.
    assert color_dominante("-5") == "rojo"
    assert color_dominante("no-es-numero") in ("rojo", "azul")


def test_no_sobreviven_los_metadatos_del_original(app):
    exif = Image.Exif()
    exif[0x010E] = "ubicacion secreta del docente"
    original = _imagen("JPEG", (1600, 900), exif=exif)
    assert b"ubicacion secreta" in original
    with app.app_context():
        portada, miniatura = portadas.procesar_portada("foto.jpg", original)
    assert b"ubicacion secreta" not in portada and b"ubicacion secreta" not in miniatura


@pytest.mark.parametrize("nombre,contenido,codigo,status", [
    ("animacion.gif", _imagen("GIF", (800, 400)), "COVER_FORMAT", 415),                 # imagen real, formato no aceptado
    ("documento.pdf", b"%PDF-1.4\n%%EOF\n", "COVER_FORMAT", 415),
    ("vector.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "COVER_FORMAT", 415),
    ("virus.exe", b"MZ\x90\x00" + b"\x00" * 64, "COVER_FORMAT", 415),
    ("sin_extension", _imagen("JPEG"), "COVER_FORMAT", 415),
    # Archivos disfrazados: la extensión dice imagen, el contenido no.
    ("portada.jpg", b"MZ\x90\x00 esto es un ejecutable" + b"\x00" * 64, "COVER_NOT_AN_IMAGE", 415),
    ("portada.png", b"<html><script>alert(1)</script></html>", "COVER_NOT_AN_IMAGE", 415),
    ("portada.png", _imagen("JPEG"), "COVER_NOT_AN_IMAGE", 415),                        # JPG renombrado a .png
    ("portada.jpg", b"\xff\xd8\xff\xe0" + b"basura que no es un jpeg" * 20, "COVER_NOT_AN_IMAGE", 415),   # solo la firma
    ("portada.webp", b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 40, "COVER_NOT_AN_IMAGE", 415),
    ("portada.jpg", b"", "COVER_NOT_AN_IMAGE", 415),
    # Dimensiones fuera de rango.
    ("chica.png", _imagen("PNG", (399, 300)), "COVER_TOO_SMALL", 400),
    ("chica.png", _imagen("PNG", (800, 199)), "COVER_TOO_SMALL", 400),
    ("enorme.png", _imagen("PNG", (8001, 400)), "COVER_DIMENSIONS", 400),
    ("enorme.png", _imagen("PNG", (7000, 6000)), "COVER_DIMENSIONS", 400),              # más de 40 megapíxeles
], ids=[
    "gif", "pdf", "svg", "exe", "sin-extension", "exe-como-jpg", "html-como-png", "jpg-como-png", "solo-firma-jpg",
    "webp-vacio", "archivo-vacio", "muy-angosta", "muy-baja", "lado-enorme", "demasiados-pixeles",
])
def test_imagenes_invalidas_se_rechazan(app, nombre, contenido, codigo, status):
    with app.app_context():
        with pytest.raises(portadas.PortadaInvalida) as err:
            portadas.procesar_portada(nombre, contenido)
    assert (err.value.codigo, err.value.status_code) == (codigo, status)


def test_imagen_truncada_se_rechaza(app):
    completa = _imagen("PNG", (1600, 900))
    with app.app_context():
        with pytest.raises(portadas.PortadaInvalida) as err:
            portadas.procesar_portada("portada.png", completa[: len(completa) // 2])
    assert err.value.codigo == "COVER_NOT_AN_IMAGE"


def test_imagen_de_mas_de_2_mb_se_rechaza_antes_de_decodificar(app):
    pesada = _imagen("JPEG") + b"\x00" * (2 * 1024 * 1024)
    with app.app_context():
        with pytest.raises(portadas.PortadaInvalida) as err:
            portadas.procesar_portada("portada.jpg", pesada)
    assert (err.value.codigo, err.value.status_code) == ("COVER_TOO_LARGE", 413)


def test_las_claves_son_aleatorias_y_la_miniatura_va_al_lado():
    clave, miniatura = portadas.claves_nuevas()
    otra, _ = portadas.claves_nuevas()
    assert clave != otra
    assert clave.startswith("portadas/") and clave.endswith(".webp")
    assert miniatura == clave[: -len(".webp")] + "_thumb.webp"
    assert portadas.clave_miniatura(clave) == miniatura


# ─────────────────────────── Crear curso con portada ───────────────────────────

def test_crear_curso_con_portada_por_multipart(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    estado = _preparar(app, monkeypatch, docente)
    r2 = _R2(app, monkeypatch)

    res = client.post(
        "/api/cursos",
        data={"name": "Gastro I", "academic_period": "2026-2", "cover": _archivo(_imagen(), "Mi Foto Original.JPG")},
        content_type="multipart/form-data",
        headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == 201
    body = res.get_json()
    curso = estado["agregados"][0]
    assert curso.name == "Gastro I" and curso.academic_period == "2026-2"
    # Dos objetos con nombre aleatorio: ni el nombre original ni el id del docente.
    assert set(r2.objetos) == {curso.cover_image_key, portadas.clave_miniatura(curso.cover_image_key)}
    assert "Foto" not in curso.cover_image_key and "foto" not in curso.cover_image_key.lower()
    assert all(mime == "image/webp" for _c, mime in r2.objetos.values())
    assert Image.open(io.BytesIO(r2.objetos[curso.cover_image_key][0])).size == (1200, 600)
    # La card recibe la miniatura; la clave interna no sale.
    assert "_thumb.webp" in body["cover_url"] and "_thumb" not in body["cover_full_url"]
    assert "cover_image_key" not in body
    assert estado["commits"] == 1


def test_crear_curso_sin_portada_sigue_funcionando_con_json(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    estado = _preparar(app, monkeypatch, docente)
    r2 = _R2(app, monkeypatch)

    res = client.post("/api/cursos", json={"name": "Gastro I"}, headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 201
    assert res.get_json()["cover_url"] is None and res.get_json()["cover_full_url"] is None
    assert r2.objetos == {} and estado["commits"] == 1


@pytest.mark.parametrize("contenido,nombre,status,codigo", [
    (_imagen("GIF", (800, 400)), "animada.gif", 415, "COVER_FORMAT"),                  # formato inválido
    (b"MZ\x90\x00 ejecutable" + b"\x00" * 64, "portada.jpg", 415, "COVER_NOT_AN_IMAGE"),   # archivo disfrazado
    (_imagen("PNG", (8001, 400)), "enorme.png", 400, "COVER_DIMENSIONS"),              # imagen enorme en píxeles
    (_imagen("PNG", (200, 100)), "chica.png", 400, "COVER_TOO_SMALL"),
    (_imagen("JPEG") + b"\x00" * (2 * 1024 * 1024), "pesada.jpg", 413, "COVER_TOO_LARGE"),   # imagen enorme en peso
], ids=["formato-invalido", "archivo-disfrazado", "dimensiones-enormes", "muy-chica", "mas-de-2mb"])
def test_portada_invalida_no_crea_el_curso_ni_sube_nada(app, client, monkeypatch, contenido, nombre, status, codigo):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    estado = _preparar(app, monkeypatch, docente)
    r2 = _R2(app, monkeypatch)

    res = client.post(
        "/api/cursos", data={"name": "Gastro I", "cover": _archivo(contenido, nombre)},
        content_type="multipart/form-data", headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == status
    assert res.get_json()["code"] == codigo
    assert r2.objetos == {} and estado["agregados"] == [] and estado["commits"] == 0


def test_multipart_sin_nombre_falla_la_validacion_normal(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    _preparar(app, monkeypatch, docente)
    r2 = _R2(app, monkeypatch)
    res = client.post(
        "/api/cursos", data={"cover": _archivo(_imagen())}, content_type="multipart/form-data",
        headers=_headers(app, "TEACHER", docente.id),
    )
    assert res.status_code == 400 and r2.objetos == {}


def test_si_falla_guardar_el_curso_la_portada_subida_se_quita(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    estado = _preparar(app, monkeypatch, docente, commit_falla=RuntimeError("se cayó la base"))
    r2 = _R2(app, monkeypatch)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.post(
        "/api/cursos", data={"name": "Gastro I", "cover": _archivo(_imagen())},
        content_type="multipart/form-data", headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == 500
    assert estado["rollbacks"] == 1
    assert r2.objetos == {} and len(r2.borrados) == 2


def test_si_r2_falla_en_la_miniatura_no_queda_la_portada_suelta(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    estado = _preparar(app, monkeypatch, docente)
    r2 = _R2(app, monkeypatch, falla_en=1)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.post(
        "/api/cursos", data={"name": "Gastro I", "cover": _archivo(_imagen())},
        content_type="multipart/form-data", headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == 500
    assert r2.objetos == {} and estado["agregados"] == []


def test_estudiante_no_crea_cursos_ni_con_portada(app, client):
    res = client.post(
        "/api/cursos", data={"name": "Gastro I", "cover": _archivo(_imagen())},
        content_type="multipart/form-data", headers=_headers(app, "STUDENT", uuid.uuid4()),
    )
    assert res.status_code == 403


# ─────────────────────────── Reemplazar y quitar ───────────────────────────

def test_reemplazar_la_portada_borra_la_anterior_de_r2(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover="portadas/vieja.webp")
    estado = _preparar(app, monkeypatch, docente, curso=curso)
    r2 = _R2(app, monkeypatch)
    r2.objetos = {"portadas/vieja.webp": (b"x", "image/webp"), "portadas/vieja_thumb.webp": (b"x", "image/webp")}

    res = client.patch(
        f"/api/cursos/{curso.id}", data={"cover": _archivo(_imagen("PNG"), "nueva.png"), "focus_x": "0.2", "focus_y": "0.8"},
        content_type="multipart/form-data", headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == 200
    assert curso.cover_image_key not in (None, "portadas/vieja.webp")
    assert r2.borrados == ["portadas/vieja.webp", "portadas/vieja_thumb.webp"]
    # En R2 quedan solo la portada nueva y su miniatura.
    assert set(r2.objetos) == {curso.cover_image_key, portadas.clave_miniatura(curso.cover_image_key)}
    assert curso.cover_image_key in res.get_json()["cover_full_url"]
    assert curso.name == "Gastro I"          # lo que no vino en el formulario no se toca
    assert estado["commits"] == 1


def test_si_falla_el_reemplazo_se_conserva_la_portada_anterior(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover="portadas/vieja.webp")
    _preparar(app, monkeypatch, docente, curso=curso, commit_falla=RuntimeError("se cayó la base"))
    r2 = _R2(app, monkeypatch)
    r2.objetos = {"portadas/vieja.webp": (b"x", "image/webp"), "portadas/vieja_thumb.webp": (b"x", "image/webp")}
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.patch(
        f"/api/cursos/{curso.id}", data={"cover": _archivo(_imagen())},
        content_type="multipart/form-data", headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == 500
    # Se quitó lo recién subido; la vieja sigue en R2.
    assert set(r2.objetos) == {"portadas/vieja.webp", "portadas/vieja_thumb.webp"}
    assert "portadas/vieja.webp" not in r2.borrados


def test_portada_invalida_al_editar_no_toca_el_curso_ni_la_portada_actual(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover="portadas/vieja.webp")
    estado = _preparar(app, monkeypatch, docente, curso=curso)
    r2 = _R2(app, monkeypatch)

    res = client.patch(
        f"/api/cursos/{curso.id}", data={"name": "Otro nombre", "cover": _archivo(b"<html></html>", "portada.png")},
        content_type="multipart/form-data", headers=_headers(app, "TEACHER", docente.id),
    )

    assert res.status_code == 415
    assert curso.name == "Gastro I" and curso.cover_image_key == "portadas/vieja.webp"
    assert r2.borrados == [] and estado["commits"] == 0


def test_editar_por_json_no_toca_la_portada(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover="portadas/vieja.webp")
    _preparar(app, monkeypatch, docente, curso=curso)
    r2 = _R2(app, monkeypatch)

    res = client.patch(f"/api/cursos/{curso.id}", json={"name": "Gastro II"}, headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 200
    assert curso.name == "Gastro II" and curso.cover_image_key == "portadas/vieja.webp"
    assert r2.borrados == [] and r2.objetos == {}


def test_quitar_la_portada_la_borra_de_r2(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover="portadas/vieja.webp")
    estado = _preparar(app, monkeypatch, docente, curso=curso)
    r2 = _R2(app, monkeypatch)

    res = client.delete(f"/api/cursos/{curso.id}/cover", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 200
    assert curso.cover_image_key is None
    assert res.get_json()["cover_url"] is None
    assert r2.borrados == ["portadas/vieja.webp", "portadas/vieja_thumb.webp"]
    assert estado["commits"] == 1

    # Quitarla otra vez no falla ni vuelve a borrar nada.
    assert client.delete(f"/api/cursos/{curso.id}/cover", headers=_headers(app, "TEACHER", docente.id)).status_code == 200
    assert len(r2.borrados) == 2


@pytest.mark.parametrize("metodo", ["patch", "delete"])
def test_solo_el_docente_dueno_cambia_la_portada(app, client, monkeypatch, metodo):
    otro_docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(uuid.uuid4(), cover="portadas/vieja.webp")
    estado = _preparar(app, monkeypatch, otro_docente, curso=curso)
    r2 = _R2(app, monkeypatch)
    headers = _headers(app, "TEACHER", otro_docente.id)

    if metodo == "patch":
        res = client.patch(
            f"/api/cursos/{curso.id}", data={"cover": _archivo(_imagen())}, content_type="multipart/form-data", headers=headers,
        )
    else:
        res = client.delete(f"/api/cursos/{curso.id}/cover", headers=headers)

    assert res.status_code == 403
    assert curso.cover_image_key == "portadas/vieja.webp"
    assert r2.objetos == {} and r2.borrados == [] and estado["commits"] == 0


def test_estudiante_no_quita_la_portada(app, client):
    res = client.delete(f"/api/cursos/{uuid.uuid4()}/cover", headers=_headers(app, "STUDENT", uuid.uuid4()))
    assert res.status_code == 403


def test_mandar_el_curso_a_la_papelera_conserva_su_portada(app, client, monkeypatch):
    """Borrar un curso es reversible: la portada sigue en R2 por si se restaura.
    Se borra de R2 recién con el borrado definitivo (ver test_fase5_rendimiento)."""
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover="portadas/vieja.webp")
    _preparar(app, monkeypatch, docente, curso=curso)
    r2 = _R2(app, monkeypatch)

    res = client.delete(f"/api/cursos/{curso.id}", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 200
    assert curso.deleted_at is not None and curso.cover_image_key == "portadas/vieja.webp"
    assert r2.borrados == []


# ─────────────────────────── Listados ───────────────────────────

def test_los_listados_traen_cover_url_o_null(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    con_portada = _curso(docente.id, cover="portadas/abc.webp")
    sin_portada = _curso(docente.id)
    _preparar(app, monkeypatch, docente)
    _R2(app, monkeypatch)
    cursos = [con_portada, sin_portada]
    consulta = ConsultaFalsa(todos=cursos)
    with app.app_context():
        monkeypatch.setattr(cursos_routes.Course, "query", consulta)

    for ruta in ("/api/cursos/mios", "/api/cursos"):
        body = client.get(ruta, headers=_headers(app, "TEACHER", docente.id)).get_json()
        assert body[0]["cover_url"] == "https://r2.example/portadas/abc_thumb.webp?firma=x"
        assert body[0]["cover_full_url"] == "https://r2.example/portadas/abc.webp?firma=x"
        assert body[1]["cover_url"] is None and body[1]["cover_full_url"] is None
        assert "cover_image_key" not in body[0]


def test_sin_almacenamiento_el_curso_se_lista_igual_sin_imagen(app, monkeypatch):
    def sin_r2(clave, **kw):
        raise storage.StorageNotConfigured("R2 no está configurado")

    with app.app_context():
        monkeypatch.setattr(storage, "url_imagen", sin_r2)
        d = _curso(uuid.uuid4(), cover="portadas/abc.webp").to_dict()
    assert d["cover_url"] is None and d["name"] == "Gastro I"


def test_url_publica_si_el_bucket_tiene_dominio_publico(monkeypatch):
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://cdn.clerk-ship.online/")
    assert storage.url_imagen("portadas/abc_thumb.webp") == "https://cdn.clerk-ship.online/portadas/abc_thumb.webp"
