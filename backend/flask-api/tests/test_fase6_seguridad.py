"""Fase 6 — rate limiting, auditoría y endurecimiento de JWT: se bloquea el
abuso (429), un token revocado deja de funcionar, el rol se valida contra la
base, las acciones sensibles quedan registradas, y ni las cabeceras ni los
errores exponen detalles internos.

No toca la base real — todo con monkeypatch."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token, create_refresh_token, decode_token
from sqlalchemy.dialects import postgresql

import app.routes.admin as admin_routes
import app.routes.auth as auth_routes
import app.routes.curso_contenido as cc_routes
import app.routes.curso_quiz as cq_routes
import app.routes.cursos as cursos_routes
from app import limiter
from app.config import Config
from app.models import AssignmentSubmission, AuditLog, Course, CourseContentItem
from app.services import auditoria, limites, sesiones
# La función real: conftest la reemplaza en `sesiones` para el resto de la suite.
from app.services.sesiones import token_revocado as token_revocado_real
from tests.fakes import ConsultaFalsa

AHORA = datetime.now(timezone.utc)


def _token(app, role, identity, refresh=False):
    with app.app_context():
        if refresh:
            return create_refresh_token(identity=str(identity))
        return create_access_token(identity=str(identity), additional_claims={"role": role})


def _headers(app, role, identity):
    return {"Authorization": f"Bearer {_token(app, role, identity)}"}


def _usuario(role="STUDENT", activo=True, corte=None, **kw):
    datos = dict(id=uuid.uuid4(), role=role, activo=activo, tokens_valid_after=corte, first_name="Ana", last_name="Ruiz")
    datos.update(kw)
    return SimpleNamespace(**datos)


class _Base:
    """Lo mínimo de base de datos que mira token_revocado: los usuarios que
    existen y los jti revocados. Deja la comprobación REAL activa."""

    def __init__(self, app, monkeypatch, usuarios=()):
        self.usuarios = {str(u.id): u for u in usuarios}
        self.revocados = set()
        base = self

        class _Usuarios(ConsultaFalsa):
            def get(self, ident):
                return base.usuarios.get(str(ident))

        class _Revocados:
            def filter_by(self, jti=None, **kw):
                return ConsultaFalsa(first=object() if jti in base.revocados else None)

        def revocar(payload, motivo="logout"):
            base.revocados.add(payload["jti"])

        with app.app_context():
            monkeypatch.setattr(sesiones.User, "query", _Usuarios())
            monkeypatch.setattr(sesiones.RevokedToken, "query", _Revocados())
            monkeypatch.setattr(sesiones, "token_revocado", token_revocado_real)
            monkeypatch.setattr(sesiones, "revocar_token", revocar)
            monkeypatch.setattr(auth_routes.db.session, "commit", lambda: None)


@pytest.fixture
def limites_activos(app):
    """Los límites están apagados en la suite; acá se prenden con el contador en cero."""
    limiter.enabled = True
    limiter.reset()
    yield
    limiter.reset()
    limiter.enabled = False


# ─────────────────────────── Vigencia del token ───────────────────────────

def _payload(app, usuario, role=None, refresh=False):
    with app.app_context():
        return decode_token(_token(app, role or usuario.role, usuario.id, refresh=refresh))


def test_token_vigente_pasa(app, monkeypatch):
    usuario = _usuario("TEACHER")
    _Base(app, monkeypatch, [usuario])
    with app.app_context():
        assert token_revocado_real(_payload(app, usuario)) is False
        assert token_revocado_real(_payload(app, usuario, refresh=True)) is False


def test_token_revocado_por_jti(app, monkeypatch):
    usuario = _usuario()
    base = _Base(app, monkeypatch, [usuario])
    payload = _payload(app, usuario)
    base.revocados.add(payload["jti"])
    with app.app_context():
        assert token_revocado_real(payload) is True
        # Otro token del mismo usuario sigue sirviendo: el logout es por token.
        assert token_revocado_real(_payload(app, usuario)) is False


def test_cuenta_desactivada_o_inexistente_invalida_el_token(app, monkeypatch):
    desactivado = _usuario(activo=False)
    fantasma = _usuario()
    _Base(app, monkeypatch, [desactivado])
    with app.app_context():
        assert token_revocado_real(_payload(app, desactivado)) is True
        assert token_revocado_real(_payload(app, desactivado, refresh=True)) is True     # tampoco puede renovar
        assert token_revocado_real(_payload(app, fantasma)) is True


def test_el_rol_del_token_se_valida_contra_la_base(app, monkeypatch):
    """Un token que dice TEACHER no sirve si en la base el usuario es STUDENT."""
    usuario = _usuario("STUDENT")
    _Base(app, monkeypatch, [usuario])
    with app.app_context():
        assert token_revocado_real(_payload(app, usuario, role="TEACHER")) is True
        assert token_revocado_real(_payload(app, usuario, role="ADMIN")) is True
        assert token_revocado_real(_payload(app, usuario, role="STUDENT")) is False


def test_corte_de_sesiones_invalida_los_tokens_anteriores(app, monkeypatch):
    usuario = _usuario()
    _Base(app, monkeypatch, [usuario])
    viejo = _payload(app, usuario)
    viejo_refresh = _payload(app, usuario, refresh=True)

    usuario.tokens_valid_after = datetime.fromtimestamp(viejo["iat"] + 5, tz=timezone.utc)
    nuevo = dict(viejo, iat=viejo["iat"] + 6, jti=str(uuid.uuid4()))
    with app.app_context():
        assert token_revocado_real(viejo) is True
        assert token_revocado_real(viejo_refresh) is True       # el refresh token viejo tampoco
        assert token_revocado_real(nuevo) is False              # el que se emite después, sí


def test_invalidar_sesiones_mueve_el_corte():
    usuario = _usuario()
    sesiones.invalidar_sesiones_de(usuario)
    assert (datetime.now(timezone.utc) - usuario.tokens_valid_after).total_seconds() < 5


def test_si_la_base_no_responde_el_token_no_pasa(app, monkeypatch):
    class _Caida:
        def filter_by(self, **kw):
            raise RuntimeError("connection refused: host db.internal")

    usuario = _usuario()
    _Base(app, monkeypatch, [usuario])
    with app.app_context():
        monkeypatch.setattr(sesiones.RevokedToken, "query", _Caida())
        assert token_revocado_real(_payload(app, usuario)) is True


def test_revocar_es_un_insert_idempotente(app, monkeypatch):
    ejecutadas = []
    usuario = _usuario()
    payload = _payload(app, usuario)
    with app.app_context():
        monkeypatch.setattr(sesiones.db.session, "execute", ejecutadas.append)
        sesiones.revocar_token(payload, "logout")
    sql = str(ejecutadas[0].compile(dialect=postgresql.dialect()))
    assert "INSERT INTO revoked_tokens" in sql and "ON CONFLICT (jti) DO NOTHING" in sql
    parametros = ejecutadas[0].compile(dialect=postgresql.dialect()).params
    assert parametros["jti"] == payload["jti"] and parametros["token_type"] == "access"


# ─────────────────────────── Un token revocado deja de funcionar ───────────────────────────

def test_despues_del_logout_el_token_ya_no_sirve(app, client, monkeypatch):
    usuario = _usuario("STUDENT", email="a@x.com", to_dict=lambda: {"id": "x"})
    _Base(app, monkeypatch, [usuario])
    access = _token(app, "STUDENT", usuario.id)
    refresh = _token(app, "STUDENT", usuario.id, refresh=True)
    con_access = {"Authorization": f"Bearer {access}"}
    con_refresh = {"Authorization": f"Bearer {refresh}"}

    # Antes: el token funciona y el refresh renueva.
    assert client.get("/api/auth/me", headers=con_access).status_code == 200
    assert client.post("/api/auth/refresh", headers=con_refresh).status_code == 200

    res = client.post("/api/auth/logout", json={"refresh_token": refresh}, headers=con_access)
    assert res.status_code == 200

    # Después: el mismo access token da 401 en cualquier ruta protegida...
    res = client.get("/api/auth/me", headers=con_access)
    assert res.status_code == 401
    assert res.get_json() == {
        "error": "Unauthorized", "message": "La sesión ya no es válida. Inicia sesión de nuevo.", "status_code": 401,
    }
    assert client.get("/api/cursos/mios", headers=con_access).status_code == 401
    # ...y con el refresh token tampoco se consigue uno nuevo.
    assert client.post("/api/auth/refresh", headers=con_refresh).status_code == 401
    # Repetir el logout con el token revocado: 401, no un error.
    assert client.post("/api/auth/logout", headers=con_access).status_code == 401


def test_logout_no_revoca_el_refresh_token_de_otro_usuario(app, client, monkeypatch):
    usuario, otro = _usuario(), _usuario()
    base = _Base(app, monkeypatch, [usuario, otro])
    refresh_ajeno = _token(app, "STUDENT", otro.id, refresh=True)

    res = client.post("/api/auth/logout", json={"refresh_token": refresh_ajeno}, headers=_headers(app, "STUDENT", usuario.id))

    assert res.status_code == 200
    with app.app_context():
        assert decode_token(refresh_ajeno)["jti"] not in base.revocados
    assert len(base.revocados) == 1          # solo el access token propio


def test_logout_con_refresh_token_basura_no_falla(app, client, monkeypatch):
    usuario = _usuario()
    base = _Base(app, monkeypatch, [usuario])
    res = client.post("/api/auth/logout", json={"refresh_token": "no-es-un-jwt"}, headers=_headers(app, "STUDENT", usuario.id))
    assert res.status_code == 200 and len(base.revocados) == 1


def test_cerrar_todas_las_sesiones(app, client, monkeypatch):
    usuario = _usuario()
    _Base(app, monkeypatch, [usuario])
    headers = _headers(app, "STUDENT", usuario.id)

    assert client.post("/api/auth/logout-all", headers=headers).status_code == 200
    assert usuario.tokens_valid_after is not None
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_cambio_de_rol_por_el_admin_deja_sin_efecto_los_tokens_del_usuario(app, client, monkeypatch):
    admin = _usuario("ADMIN")
    docente = _usuario("TEACHER", to_dict=lambda: {"id": "x"})
    _Base(app, monkeypatch, [admin, docente])
    token_docente = {"Authorization": f"Bearer {_token(app, 'TEACHER', docente.id)}"}
    registros = []
    with app.app_context():
        monkeypatch.setattr(admin_routes, "get_current_user", lambda: admin)
        monkeypatch.setattr(admin_routes.Teacher, "query", ConsultaFalsa(todos=[object()]))
        monkeypatch.setattr(admin_routes.Student, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(admin_routes.db.session, "add", registros.append)
        monkeypatch.setattr(admin_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(cursos_routes.Course, "query", ConsultaFalsa(todos=[]))
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: docente)

    # Antes del cambio su token de docente funciona.
    assert client.get("/api/cursos/papelera", headers=token_docente).status_code == 200

    res = client.patch(f"/api/admin/usuarios/{docente.id}", json={"role": "STUDENT"}, headers=_headers(app, "ADMIN", admin.id))
    assert res.status_code == 200
    assert docente.role == "STUDENT" and docente.tokens_valid_after is not None

    # El token viejo dice TEACHER; la base dice STUDENT: ya no entra a nada.
    assert client.get("/api/cursos/papelera", headers=token_docente).status_code == 401
    assert client.get("/api/cursos/mios", headers=token_docente).status_code == 401

    auditado = next(r for r in registros if isinstance(r, AuditLog))
    assert (auditado.action, auditado.entity_type, auditado.entity_id) == ("USER_ROLE_CHANGE", "user", str(docente.id))
    assert auditado.old_value == {"role": "TEACHER"} and auditado.new_value == {"role": "STUDENT"}
    assert str(auditado.user_id) == str(admin.id)


def test_desactivar_la_cuenta_corta_la_sesion_de_inmediato(app, client, monkeypatch):
    admin = _usuario("ADMIN")
    estudiante = _usuario("STUDENT", to_dict=lambda: {"id": "x"})
    _Base(app, monkeypatch, [admin, estudiante])
    token = {"Authorization": f"Bearer {_token(app, 'STUDENT', estudiante.id)}"}
    refresh = {"Authorization": f"Bearer {_token(app, 'STUDENT', estudiante.id, refresh=True)}"}
    with app.app_context():
        monkeypatch.setattr(admin_routes, "get_current_user", lambda: admin)
        monkeypatch.setattr(admin_routes.db.session, "add", lambda o: None)
        monkeypatch.setattr(admin_routes.db.session, "commit", lambda: None)

    assert client.get("/api/auth/me", headers=token).status_code == 200
    assert client.patch(
        f"/api/admin/usuarios/{estudiante.id}", json={"activo": False}, headers=_headers(app, "ADMIN", admin.id),
    ).status_code == 200

    assert client.get("/api/auth/me", headers=token).status_code == 401
    assert client.post("/api/auth/refresh", headers=refresh).status_code == 401


def test_un_token_de_refresco_no_sirve_como_token_de_acceso(app, client, monkeypatch):
    usuario = _usuario()
    _Base(app, monkeypatch, [usuario])
    refresh = {"Authorization": f"Bearer {_token(app, 'STUDENT', usuario.id, refresh=True)}"}
    res = client.get("/api/cursos/mios", headers=refresh)
    assert res.status_code in (401, 422)
    assert "Traceback" not in res.get_data(as_text=True)


@pytest.mark.parametrize("cabecera", [None, "Bearer no.es.un-jwt", "Bearer ", "Basic abc"])
def test_sin_token_o_con_token_invalido_la_respuesta_es_generica(client, cabecera):
    res = client.get("/api/cursos/mios", headers={"Authorization": cabecera} if cabecera else {})
    assert res.status_code in (401, 422)
    body = res.get_json()
    assert body["error"] == "Unauthorized" and body["status_code"] == 401
    # Nada de "Signature verification failed", "Not enough segments" ni similares.
    assert body["message"] in ("Token inválido.", "Falta el token de autenticación.")


def test_vida_corta_del_access_token_por_defecto(monkeypatch):
    import importlib
    import app.config as config_module

    # Sin lo que diga el .env de esta máquina: los valores por defecto del código.
    monkeypatch.setattr("dotenv.load_dotenv", lambda *a, **kw: False)
    monkeypatch.delenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", raising=False)
    monkeypatch.delenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", raising=False)

    recargado = importlib.reload(config_module).Config
    try:
        assert recargado.JWT_ACCESS_TOKEN_EXPIRES == 15 * 60
        assert recargado.JWT_REFRESH_TOKEN_EXPIRES == 7 * 86400
    finally:
        monkeypatch.undo()
        importlib.reload(config_module)


# ─────────────────────────── Rate limiting ───────────────────────────

def _intentar(client, veces, metodo, ruta, **kw):
    return [getattr(client, metodo)(ruta, **kw).status_code for _ in range(veces)]


def test_login_se_bloquea_por_cuenta_y_por_ip(app, client, monkeypatch, limites_activos):
    with app.app_context():
        monkeypatch.setattr(auth_routes.User, "query", ConsultaFalsa(first=None))
    intento = {"email": "victima@clerk-ship.online", "password": "x"}

    codigos = _intentar(client, 6, "post", "/api/auth/login", json=intento)
    assert codigos == [401] * 5 + [429]          # 5 por minuto contra la misma cuenta

    res = client.post("/api/auth/login", json=intento)
    assert res.status_code == 429
    assert res.get_json() == {
        "error": "Too Many Requests",
        "message": "Demasiados intentos. Espera un momento antes de volver a intentarlo.",
        "status_code": 429,
    }
    assert int(res.headers["Retry-After"]) > 0

    # Variar mayúsculas o espacios no esquiva el límite de la cuenta.
    assert client.post("/api/auth/login", json={"email": "  VICTIMA@clerk-ship.online ", "password": "x"}).status_code == 429

    # Otra cuenta desde la misma IP todavía puede intentar... hasta el límite por IP (10 por minuto).
    otros = [
        client.post("/api/auth/login", json={"email": f"otro{n}@x.com", "password": "x"}).status_code for n in range(6)
    ]
    assert otros[0] == 401 and otros[-1] == 429


def _sin_cursos(app, monkeypatch, modulo, user):
    """La ruta responde 404 (curso inexistente) enseguida: lo que se prueba es el límite."""
    with app.app_context():
        monkeypatch.setattr(modulo, "get_current_user", lambda: user)
        monkeypatch.setattr(modulo.Course, "query", ConsultaFalsa(first=None))


def test_matricula_se_bloquea_por_usuario(app, client, monkeypatch, limites_activos):
    estudiante, otro = SimpleNamespace(id=uuid.uuid4(), role="STUDENT"), SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    _sin_cursos(app, monkeypatch, cursos_routes, estudiante)
    ruta = f"/api/cursos/{uuid.uuid4()}/matricular"

    codigos = _intentar(client, 11, "post", ruta, json={"code": "AAAA1111"}, headers=_headers(app, "STUDENT", estudiante.id))
    assert codigos == [404] * 10 + [429]

    # El límite es por usuario: otro estudiante desde la misma IP no queda bloqueado.
    assert client.post(ruta, json={"code": "x"}, headers=_headers(app, "STUDENT", otro.id)).status_code == 404
    # Y sin sesión no se gasta el cupo de nadie: 401 antes de contar.
    assert client.post(ruta, json={"code": "x"}).status_code == 401


def test_inicio_de_quiz_se_bloquea(app, client, monkeypatch, limites_activos):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    _sin_cursos(app, monkeypatch, cq_routes, estudiante)
    ruta = f"/api/cursos/{uuid.uuid4()}/bloques/{uuid.uuid4()}/contenido/{uuid.uuid4()}/intentos"
    assert _intentar(client, 11, "post", ruta, headers=_headers(app, "STUDENT", estudiante.id)) == [404] * 10 + [429]


def test_envio_de_entregas_se_bloquea(app, client, monkeypatch, limites_activos):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    _sin_cursos(app, monkeypatch, cc_routes, estudiante)
    ruta = f"/api/cursos/{uuid.uuid4()}/bloques/{uuid.uuid4()}/contenido/{uuid.uuid4()}/entregas"
    cuerpo = {"name": "a.pdf", "file_base64": "JVBERi0xLjQKJSVFT0YK"}
    assert _intentar(client, 7, "post", ruta, json=cuerpo, headers=_headers(app, "STUDENT", estudiante.id)) == [404] * 6 + [429]


def test_subida_de_material_se_bloquea(app, client, monkeypatch, limites_activos):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    _sin_cursos(app, monkeypatch, cc_routes, docente)
    ruta = f"/api/cursos/{uuid.uuid4()}/bloques/{uuid.uuid4()}/contenido"
    cuerpo = {"type": "LINK", "title": "x", "link_url": "https://x.com"}
    assert _intentar(client, 21, "post", ruta, json=cuerpo, headers=_headers(app, "TEACHER", docente.id)) == [404] * 20 + [429]


def test_subida_de_portada_se_bloquea_pero_crear_sin_imagen_no_cuenta(app, client, monkeypatch, limites_activos):
    import io

    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: docente)
    headers = _headers(app, "TEACHER", docente.id)

    # Sin archivo (JSON inválido a propósito, 400): no gasta el cupo de subidas.
    assert _intentar(client, 15, "post", "/api/cursos", json={}, headers=headers) == [400] * 15

    def con_portada():
        return client.post(
            "/api/cursos", data={"name": "Curso", "cover": (io.BytesIO(b"no soy una imagen"), "portada.png")},
            content_type="multipart/form-data", headers=headers,
        ).status_code

    assert [con_portada() for _ in range(11)] == [415] * 10 + [429]


def test_los_limites_son_distintos_por_endpoint():
    distintos = {
        limites.LOGIN_POR_IP, limites.LOGIN_POR_CUENTA, limites.MATRICULA, limites.SUBIDA_MATERIAL,
        limites.SUBIDA_PORTADA, limites.ENTREGA, limites.INICIO_QUIZ, limites.REFRESH,
    }
    assert len(distintos) >= 7


# ─────────────────────────── Auditoría ───────────────────────────

def test_registrar_guarda_quien_que_y_desde_donde(app, monkeypatch):
    agregados = []
    autor = uuid.uuid4()
    with app.test_request_context("/api/x", headers=_headers(app, "TEACHER", autor), environ_base={"REMOTE_ADDR": "203.0.113.7"}):
        from flask_jwt_extended import verify_jwt_in_request

        monkeypatch.setattr(auditoria.db.session, "add", agregados.append)
        verify_jwt_in_request()
        entidad = uuid.uuid4()
        auditoria.registrar(
            auditoria.GRADE_CHANGE, "submission", entidad,
            old={"score": Decimal("7.50"), "at": AHORA}, new={"score": 9, "student_id": entidad},
        )

    fila = agregados[0]
    assert (fila.action, fila.entity_type, fila.entity_id) == ("GRADE_CHANGE", "submission", str(entidad))
    assert fila.user_id == autor and fila.ip == "203.0.113.7"
    assert fila.old_value == {"score": 7.5, "at": AHORA.isoformat()}          # listo para JSON
    assert fila.new_value == {"score": 9, "student_id": str(entidad)}


def test_el_codigo_de_matricula_queda_enmascarado():
    assert auditoria.enmascarar_codigo("ABCD2345") == "••••••45"
    assert auditoria.enmascarar_codigo(None) is None


class _Sesion:
    def __init__(self, app, monkeypatch, modulo):
        self.eventos = []
        with app.app_context():
            monkeypatch.setattr(modulo.db.session, "add", lambda o: self.eventos.append(("add", o)))
            monkeypatch.setattr(modulo.db.session, "delete", lambda o: self.eventos.append(("delete", o)))
            monkeypatch.setattr(modulo.db.session, "commit", lambda: self.eventos.append(("commit", None)))

    @property
    def auditados(self):
        return [o for tipo, o in self.eventos if tipo == "add" and isinstance(o, AuditLog)]

    def auditado_antes_del_commit(self):
        tipos = [("audit" if isinstance(o, AuditLog) else tipo) for tipo, o in self.eventos]
        return "audit" in tipos and "commit" in tipos and tipos.index("audit") < tipos.index("commit")


def _curso(docente_id, **kw):
    datos = dict(id=uuid.uuid4(), teacher_id=docente_id, name="Gastro I", enrollment_mode="CODE", enrollment_code="ABCD2345")
    datos.update(kw)
    return Course(**datos)


def _preparar_curso(app, monkeypatch, docente, curso):
    sesion = _Sesion(app, monkeypatch, cursos_routes)
    consulta = ConsultaFalsa(first=curso)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cursos_routes.Course, "query", consulta)
        monkeypatch.setattr(cursos_routes.EnrollmentRequest, "query", ConsultaFalsa())
    return sesion


def test_calificar_y_cambiar_una_nota_queda_registrado(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    item = CourseContentItem(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", title="T", max_score=10)
    entrega = AssignmentSubmission(id=uuid.uuid4(), item_id=item.id, student_id=uuid.uuid4(), current_version=1, score=7, feedback="Regular")
    sesion = _Sesion(app, monkeypatch, cc_routes)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cc_routes.Course, "query", ConsultaFalsa(first=curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", ConsultaFalsa(first=item))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", ConsultaFalsa(first=entrega))
        monkeypatch.setattr(cc_routes, "_archivos_de_entregas", lambda ids: {})

    res = client.patch(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas/{entrega.id}",
        json={"score": 9.5, "feedback": "Mejoró"}, headers=_headers(app, "TEACHER", docente.id),
        environ_base={"REMOTE_ADDR": "198.51.100.4"},
    )

    assert res.status_code == 200
    registro = sesion.auditados[0]
    assert (registro.action, registro.entity_type, registro.entity_id) == ("GRADE_CHANGE", "submission", str(entrega.id))
    assert registro.old_value == {"score": 7.0, "feedback": "Regular", "rubric_scores": None}
    assert registro.new_value == {
        "score": 9.5, "feedback": "Mejoró", "rubric_scores": None, "student_id": str(entrega.student_id),
    }
    assert str(registro.user_id) == str(docente.id) and registro.ip == "198.51.100.4"
    assert sesion.auditado_antes_del_commit()          # misma transacción que el cambio


def test_nota_rechazada_no_deja_registro(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    item = CourseContentItem(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", title="T", max_score=10)
    entrega = AssignmentSubmission(id=uuid.uuid4(), item_id=item.id, student_id=uuid.uuid4(), current_version=1)
    sesion = _Sesion(app, monkeypatch, cc_routes)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cc_routes.Course, "query", ConsultaFalsa(first=curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", ConsultaFalsa(first=item))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", ConsultaFalsa(first=entrega))

    res = client.patch(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas/{entrega.id}",
        json={"score": 50}, headers=_headers(app, "TEACHER", docente.id),
    )
    assert res.status_code == 400 and sesion.auditados == []


def test_cambiar_la_politica_de_notas_queda_registrado(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    quiz = CourseContentItem(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", title="Parcial", grade_policy="BEST", position=0)
    sesion = _Sesion(app, monkeypatch, cc_routes)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cc_routes.Course, "query", ConsultaFalsa(first=curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", ConsultaFalsa(first=quiz))
    ruta = f"/api/cursos/{curso.id}/bloques/{quiz.block_id}/contenido/{quiz.id}"
    headers = _headers(app, "TEACHER", docente.id)

    assert client.patch(ruta, json={"grade_policy": "LAST"}, headers=headers).status_code == 200
    registro = sesion.auditados[0]
    assert (registro.action, registro.entity_type) == ("GRADE_POLICY_CHANGE", "quiz")
    assert registro.old_value == {"grade_policy": "BEST"} and registro.new_value == {"grade_policy": "LAST"}

    # Mandar la misma política no es un cambio: no se registra otra vez.
    assert client.patch(ruta, json={"grade_policy": "LAST"}, headers=headers).status_code == 200
    assert len(sesion.auditados) == 1


def test_borrar_y_restaurar_un_curso_queda_registrado(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id)
    sesion = _preparar_curso(app, monkeypatch, docente, curso)
    headers = _headers(app, "TEACHER", docente.id)

    assert client.delete(f"/api/cursos/{curso.id}", headers=headers).status_code == 200
    assert client.post(f"/api/cursos/{curso.id}/restaurar", headers=headers).status_code == 200

    assert [(r.action, r.entity_id) for r in sesion.auditados] == [
        ("COURSE_DELETE", str(curso.id)), ("COURSE_RESTORE", str(curso.id)),
    ]
    assert sesion.auditados[0].old_value == {"name": "Gastro I"}
    assert sesion.auditado_antes_del_commit()


def test_cambiar_el_codigo_de_matricula_queda_registrado_sin_exponer_el_codigo(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id)
    sesion = _preparar_curso(app, monkeypatch, docente, curso)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "_codigo_nuevo", lambda: "WXYZ9876")
    headers = _headers(app, "TEACHER", docente.id)

    assert client.post(f"/api/cursos/{curso.id}/matricula/codigo", headers=headers).status_code == 200
    assert client.delete(f"/api/cursos/{curso.id}/matricula/codigo", headers=headers).status_code == 200
    assert client.patch(f"/api/cursos/{curso.id}/matricula", json={"enrollment_mode": "OPEN"}, headers=headers).status_code == 200

    acciones = [r.action for r in sesion.auditados]
    assert acciones == ["ENROLLMENT_CODE_CHANGE", "ENROLLMENT_CODE_CHANGE", "ENROLLMENT_MODE_CHANGE"]
    regenerado, desactivado, modo = sesion.auditados
    assert regenerado.old_value == {"enrollment_code": "••••••45"} and regenerado.new_value == {"enrollment_code": "••••••76"}
    assert desactivado.new_value == {"enrollment_code": None}
    assert modo.old_value == {"enrollment_mode": "CODE"} and modo.new_value == {"enrollment_mode": "OPEN"}
    # Los códigos completos no aparecen en ningún registro.
    assert "ABCD2345" not in str([r.old_value for r in sesion.auditados] + [r.new_value for r in sesion.auditados])
    assert "WXYZ9876" not in str([r.old_value for r in sesion.auditados] + [r.new_value for r in sesion.auditados])


def test_matricular_y_expulsar_a_un_alumno_queda_registrado(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id)
    alumno = SimpleNamespace(id=uuid.uuid4(), first_name="Luis", last_name="Paz", email="luis@x.com")
    sesion = _preparar_curso(app, monkeypatch, docente, curso)
    matriculas = ConsultaFalsa(first=None)
    with app.app_context():
        monkeypatch.setattr(cursos_routes.User, "query", ConsultaFalsa(first=alumno))
        monkeypatch.setattr(cursos_routes.StudentCourse, "query", matriculas)
        monkeypatch.setattr(cursos_routes.Student, "query", ConsultaFalsa(first=None))
    headers = _headers(app, "TEACHER", docente.id)

    assert client.post(f"/api/cursos/{curso.id}/estudiantes", json={"email": "luis@x.com"}, headers=headers).status_code == 201
    matriculas._first = object()          # ahora sí está matriculado
    assert client.delete(f"/api/cursos/{curso.id}/estudiantes/{alumno.id}", headers=headers).status_code == 200

    matricula, expulsion = sesion.auditados
    assert (matricula.action, matricula.entity_id) == ("STUDENT_ENROLL", str(curso.id))
    assert matricula.new_value == {"student_id": str(alumno.id), "via": "TEACHER"}
    assert expulsion.action == "STUDENT_REMOVE"
    assert expulsion.old_value == {"student_id": str(alumno.id), "via": "TEACHER"}
    assert all(str(r.user_id) == str(docente.id) for r in sesion.auditados)


def test_consultar_la_auditoria_es_solo_para_administradores(app, client, monkeypatch):
    admin = SimpleNamespace(id=uuid.uuid4(), role="ADMIN", first_name="Ada", last_name="Min")
    registros = [
        AuditLog(id=uuid.uuid4(), user_id=admin.id, action="GRADE_CHANGE", entity_type="submission", entity_id=str(uuid.uuid4()),
                 old_value={"score": 1}, new_value={"score": 2}, ip="203.0.113.7", created_at=AHORA - timedelta(minutes=n))
        for n in range(30)
    ]
    with app.app_context():
        monkeypatch.setattr(admin_routes.AuditLog, "query", ConsultaFalsa(todos=registros))
        monkeypatch.setattr(admin_routes.User, "query", ConsultaFalsa(todos=[admin]))

    for rol in ("TEACHER", "STUDENT"):
        assert client.get("/api/admin/auditoria", headers=_headers(app, rol, uuid.uuid4())).status_code == 403
    assert client.get("/api/admin/auditoria").status_code == 401

    body = client.get("/api/admin/auditoria?page=2&per_page=10", headers=_headers(app, "ADMIN", admin.id)).get_json()
    assert (body["total"], body["page"], body["per_page"], body["pages"]) == (30, 2, 10, 3)
    assert body["registros"][0]["action"] == "GRADE_CHANGE" and body["registros"][0]["user_name"] == "Ada Min"
    assert body["registros"][0]["ip"] == "203.0.113.7"


def test_la_auditoria_no_se_puede_editar_ni_borrar_por_la_api(app):
    metodos = set()
    for regla in app.url_map.iter_rules():
        if "auditoria" in regla.rule:
            metodos |= regla.methods - {"HEAD", "OPTIONS"}
    assert metodos == {"GET"}


# ─────────────────────────── Cabeceras y CORS ───────────────────────────

def test_cabeceras_de_seguridad_en_la_api(client):
    res = client.get("/api/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
    assert res.headers["Referrer-Policy"] == "no-referrer"
    assert res.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    assert res.headers["Cache-Control"] == "no-store"
    assert "Permissions-Policy" in res.headers
    # También en los errores.
    assert client.get("/api/no-existe").headers["X-Content-Type-Options"] == "nosniff"
    assert client.get("/api/cursos/mios").headers["Cache-Control"] == "no-store"


def test_hsts_solo_en_produccion(app, client):
    assert "Strict-Transport-Security" not in client.get("/api/health").headers
    anterior = app.config["FLASK_ENV"]
    app.config["FLASK_ENV"] = "production"
    try:
        assert "max-age=31536000" in client.get("/api/health").headers["Strict-Transport-Security"]
    finally:
        app.config["FLASK_ENV"] = anterior


def test_cors_solo_para_los_origenes_configurados(app, client):
    permitido = app.config["CORS_ORIGINS"][0]
    res = client.get("/api/health", headers={"Origin": permitido})
    assert res.headers["Access-Control-Allow-Origin"] == permitido
    assert "Access-Control-Allow-Credentials" not in res.headers          # la sesión no va en cookies

    for ajeno in ("https://sitio-malicioso.example", "null", permitido + ".evil.example"):
        res = client.get("/api/health", headers={"Origin": ajeno})
        assert "Access-Control-Allow-Origin" not in res.headers

    preflight = client.options(
        f"/api/cursos/{uuid.uuid4()}/matricular",
        headers={"Origin": permitido, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert preflight.headers["Access-Control-Allow-Origin"] == permitido
    permitidas = preflight.headers["Access-Control-Allow-Headers"].lower()
    assert "authorization" in permitidas and "content-type" in permitidas

    rechazado = client.options(
        "/api/cursos/mios", headers={"Origin": "https://sitio-malicioso.example", "Access-Control-Request-Method": "GET"},
    )
    assert "Access-Control-Allow-Origin" not in rechazado.headers


def test_cors_nunca_acepta_comodin(monkeypatch):
    import importlib
    import app.config as config_module

    monkeypatch.setenv("CORS_ORIGINS", " https://clerk-ship.online/ , * ,, http://localhost:5173 ")
    try:
        assert importlib.reload(config_module).Config.CORS_ORIGINS == ["https://clerk-ship.online", "http://localhost:5173"]
    finally:
        monkeypatch.undo()
        importlib.reload(config_module)
    assert "*" not in Config.CORS_ORIGINS


# ─────────────────────────── Errores sin detalles internos ───────────────────────────

def test_un_error_inesperado_no_expone_trazas_ni_mensajes_internos(app, client, monkeypatch):
    def explota(*a, **kw):
        raise RuntimeError('psycopg2.OperationalError: FATAL password authentication failed for user "postgres" at db.internal:5432')

    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", explota)

    res = client.get("/api/cursos/mios", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 500
    body = res.get_json()
    assert body["error"] == "Internal Server Error" and body["message"] == "Ocurrió un error interno en el servidor."
    assert len(body["error_id"]) == 12          # para encontrarlo en el log
    texto = res.get_data(as_text=True)
    for filtrado in ("psycopg2", "password", "postgres", "db.internal", "Traceback", "RuntimeError", "cursos.py"):
        assert filtrado not in texto


def test_health_no_expone_el_error_de_la_base(app, client, monkeypatch):
    import app as app_pkg

    def caida(*a, **kw):
        raise RuntimeError("could not connect to server at aws-0-us-east-1.pooler.supabase.com user=postgres.abc")

    with app.app_context():
        monkeypatch.setattr(app_pkg.db.session, "execute", caida)
    res = client.get("/api/health")
    assert res.get_json()["databases"]["postgresql"] == "error"
    assert "supabase" not in res.get_data(as_text=True) and "postgres." not in res.get_data(as_text=True)


@pytest.mark.parametrize("metodo,ruta,codigo", [
    ("get", "/api/no-existe", 404),
    ("put", "/api/health", 405),
])
def test_los_errores_http_salen_en_json_y_sin_html(client, metodo, ruta, codigo):
    res = getattr(client, metodo)(ruta)
    assert res.status_code == codigo
    assert res.is_json and res.get_json()["status_code"] == codigo
    assert "<html" not in res.get_data(as_text=True).lower()


def test_almacenamiento_no_configurado_no_nombra_variables_ni_proveedor(monkeypatch):
    from app import storage

    for variable in ("R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"):
        monkeypatch.delenv(variable, raising=False)
    storage._client.cache_clear()
    try:
        with pytest.raises(storage.StorageNotConfigured) as err:
            storage._client()
    finally:
        storage._client.cache_clear()
    assert "R2" not in str(err.value) and "variables" not in str(err.value)
