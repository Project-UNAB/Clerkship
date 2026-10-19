"""Moderación de la biblioteca médica: estado inicial según rol, visibilidad
para autor/admin/otros, estante y descarga restringidos a APROBADO (salvo autor
y ADMIN), y endpoints de aprobación/rechazo con auditoría."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.admin as admin_routes
import app.routes.almacenamiento as almacenamiento_routes
import app.routes.articulos as articulos_routes
from app.models import Article, AuditLog, StudentLibrary
from tests.fakes import ConsultaFalsa


def _headers(app, role: str, user_id: uuid.UUID) -> dict:
    with app.app_context():
        token = create_access_token(identity=str(user_id), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def test_no_admin_crea_articulo_queda_pendiente_y_admin_queda_aprobado(app, client, monkeypatch):
    docente_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    admin_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    creados = []

    def fake_add(obj):
        if isinstance(obj, Article) and not obj.id:
            obj.id = uuid.uuid4()
        creados.append(obj)

    with app.app_context():
        monkeypatch.setattr(articulos_routes.db.session, "add", fake_add)
        monkeypatch.setattr(articulos_routes.db.session, "flush", lambda: None)
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: ["GASTRO"])
        monkeypatch.setattr(articulos_routes, "_tags_de", lambda ids: {i: ["GASTRO"] for i in ids})

        res_docente = client.post(
            "/api/articulos",
            json={"title": "Guía de gastritis", "content": "Contenido clínico", "specialty": "Gastroenterología"},
            headers=_headers(app, "TEACHER", docente_id),
        )
        assert res_docente.status_code == 201
        assert res_docente.get_json()["estado"] == "PENDIENTE"

        res_admin = client.post(
            "/api/articulos",
            json={"title": "Protocolo oficial", "content": "Contenido oficial", "specialty": "Hepatología"},
            headers=_headers(app, "ADMIN", admin_id),
        )
        assert res_admin.status_code == 201
        assert res_admin.get_json()["estado"] == "APROBADO"


def test_publicar_pdf_desde_almacenamiento_respeta_rol(app, client, monkeypatch):
    est_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    admin_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    file_id = uuid.UUID("33333333-3333-3333-3333-333333333333")
    archivo_fake = SimpleNamespace(
        id=file_id,
        nombre="guia.pdf",
        storage_key="users/1/guia.pdf",
        mime_type="application/pdf",
        size_bytes=2048,
        estado="LISTO",
    )

    with app.app_context():
        monkeypatch.setattr(almacenamiento_routes, "_archivo_del_usuario", lambda _fid, _oid: archivo_fake)
        monkeypatch.setattr(almacenamiento_routes.storage, "copiar", lambda src, dst: None)
        monkeypatch.setattr(almacenamiento_routes.db.session, "add", lambda _o: None)
        monkeypatch.setattr(almacenamiento_routes.db.session, "commit", lambda: None)

        res_est = client.post(
            f"/api/almacenamiento/archivos/{file_id}/publicar",
            json={"titulo": "Apuntes de clase"},
            headers=_headers(app, "STUDENT", est_id),
        )
        assert res_est.status_code == 201
        assert res_est.get_json()["article"]["estado"] == "PENDIENTE"

        res_adm = client.post(
            f"/api/almacenamiento/archivos/{file_id}/publicar",
            json={"titulo": "Guía institucional"},
            headers=_headers(app, "ADMIN", admin_id),
        )
        assert res_adm.status_code == 201
        assert res_adm.get_json()["article"]["estado"] == "APROBADO"


def test_visibilidad_pendiente_y_rechazado_para_estudiante_autor_y_admin(app, client, monkeypatch):
    autor_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    otro_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    admin_id = uuid.UUID("33333333-3333-3333-3333-333333333333")

    art_aprobado = Article(
        id=uuid.uuid4(),
        type="GUIA",
        title="Aprobado público",
        url="/library/aprobado",
        created_by=autor_id,
        estado="APROBADO",
    )
    art_pendiente = Article(
        id=uuid.uuid4(),
        type="GUIA",
        title="En revisión del autor",
        url="/library/pendiente",
        created_by=autor_id,
        estado="PENDIENTE",
    )
    art_rechazado = Article(
        id=uuid.uuid4(),
        type="GUIA",
        title="Rechazado del autor",
        url="/library/rechazado",
        publicado_por=autor_id,
        estado="RECHAZADO",
        motivo_rechazo="Falta bibliografía actualizada",
    )
    todos = [art_aprobado, art_pendiente, art_rechazado]
    por_id = {str(a.id): a for a in todos}

    consulta = ConsultaFalsa(todos=todos)
    consulta.get = lambda _id: por_id.get(str(_id))

    with app.app_context():
        monkeypatch.setattr(articulos_routes.Article, "query", consulta)
        monkeypatch.setattr(articulos_routes, "_tags_for", lambda _id: [])
        monkeypatch.setattr(articulos_routes, "_tags_de", lambda ids: {i: [] for i in ids})

        # Otro estudiante solo ve el APROBADO
        res_otro = client.get("/api/articulos", headers=_headers(app, "STUDENT", otro_id))
        assert res_otro.status_code == 200
        ids_otro = [a["id"] for a in res_otro.get_json()]
        assert ids_otro == [str(art_aprobado.id)]

        # Detalle del PENDIENTE y RECHAZADO da 404 para otro estudiante
        assert client.get(f"/api/articulos/{art_pendiente.id}", headers=_headers(app, "STUDENT", otro_id)).status_code == 404
        assert client.get(f"/api/articulos/{art_rechazado.id}", headers=_headers(app, "STUDENT", otro_id)).status_code == 404

        # El autor sí ve sus artículos PENDIENTE y RECHAZADO (con motivo)
        res_autor = client.get("/api/articulos", headers=_headers(app, "STUDENT", autor_id))
        assert res_autor.status_code == 200
        ids_autor = {a["id"] for a in res_autor.get_json()}
        assert ids_autor == {str(art_aprobado.id), str(art_pendiente.id), str(art_rechazado.id)}

        det_pend = client.get(f"/api/articulos/{art_pendiente.id}", headers=_headers(app, "STUDENT", autor_id))
        assert det_pend.status_code == 200
        assert det_pend.get_json()["estado"] == "PENDIENTE"

        det_rech = client.get(f"/api/articulos/{art_rechazado.id}", headers=_headers(app, "STUDENT", autor_id))
        assert det_rech.status_code == 200
        assert det_rech.get_json()["motivo_rechazo"] == "Falta bibliografía actualizada"

        # El ADMIN ve todos
        res_adm = client.get("/api/articulos", headers=_headers(app, "ADMIN", admin_id))
        assert res_adm.status_code == 200
        assert len(res_adm.get_json()) == 3


def test_estante_y_descarga_restringidos_en_articulos_no_aprobados(app, client, monkeypatch):
    autor_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    otro_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    admin_id = uuid.UUID("33333333-3333-3333-3333-333333333333")
    art_pendiente = Article(
        id=uuid.uuid4(),
        type="GUIA",
        title="PDF en revisión",
        url="/api/almacenamiento/biblioteca/x/descarga",
        archivo_key="biblioteca/x.pdf",
        publicado_por=autor_id,
        estado="PENDIENTE",
    )

    with app.app_context():
        monkeypatch.setattr(
            articulos_routes.Article, "query", SimpleNamespace(get=lambda _id: art_pendiente)
        )
        monkeypatch.setattr(
            articulos_routes.StudentLibrary, "query", ConsultaFalsa(first=None, todos=[])
        )
        monkeypatch.setattr(articulos_routes.db.session, "add", lambda _o: None)
        monkeypatch.setattr(articulos_routes.db.session, "commit", lambda: None)

        # Otro estudiante no puede guardarlo en su estante
        res_estante_otro = client.post(
            f"/api/articulos/{art_pendiente.id}/estante",
            json={"status": "NEXT"},
            headers=_headers(app, "STUDENT", otro_id),
        )
        assert res_estante_otro.status_code == 404

        # El autor sí puede guardarlo en su estante
        res_estante_autor = client.post(
            f"/api/articulos/{art_pendiente.id}/estante",
            json={"status": "NEXT"},
            headers=_headers(app, "STUDENT", autor_id),
        )
        assert res_estante_autor.status_code == 200

        # Descarga del PDF: bloqueada para otro estudiante, permitida para autor y ADMIN
        monkeypatch.setattr(
            almacenamiento_routes.Article, "query", SimpleNamespace(get=lambda _id: art_pendiente)
        )
        monkeypatch.setattr(
            almacenamiento_routes.storage, "url_descarga", lambda key, name: f"https://r2.example/{key}"
        )

        res_desc_otro = client.get(
            f"/api/almacenamiento/biblioteca/{art_pendiente.id}/descarga",
            headers=_headers(app, "STUDENT", otro_id),
        )
        assert res_desc_otro.status_code == 404

        res_desc_autor = client.get(
            f"/api/almacenamiento/biblioteca/{art_pendiente.id}/descarga",
            headers=_headers(app, "STUDENT", autor_id),
        )
        assert res_desc_autor.status_code == 200

        res_desc_admin = client.get(
            f"/api/almacenamiento/biblioteca/{art_pendiente.id}/descarga",
            headers=_headers(app, "ADMIN", admin_id),
        )
        assert res_desc_admin.status_code == 200


@pytest.mark.parametrize("rol", ["STUDENT", "TEACHER"])
def test_aprobar_y_rechazar_exigen_rol_admin(app, client, rol):
    uid = uuid.uuid4()
    art_id = uuid.uuid4()
    headers = _headers(app, rol, uid)

    assert client.post(f"/api/admin/biblioteca/{art_id}/aprobar", headers=headers).status_code == 403
    assert client.post(
        f"/api/admin/biblioteca/{art_id}/rechazar",
        json={"motivo": "No cumple"},
        headers=headers,
    ).status_code == 403


def test_aprobar_y_rechazar_guardan_quien_cuando_y_auditoria(app, client, monkeypatch):
    admin_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
    art = Article(
        id=uuid.uuid4(),
        type="GUIA",
        title="Guía de prueba",
        url="/library/guia",
        estado="PENDIENTE",
    )
    agregados = []

    with app.app_context():
        monkeypatch.setattr(
            admin_routes, "get_current_user", lambda: SimpleNamespace(id=admin_id, role="ADMIN")
        )
        monkeypatch.setattr(admin_routes.Article, "query", SimpleNamespace(get=lambda _id: art))
        monkeypatch.setattr(admin_routes.db.session, "add", lambda obj: agregados.append(obj))
        monkeypatch.setattr(admin_routes.db.session, "commit", lambda: None)

        headers = _headers(app, "ADMIN", admin_id)

        # Rechazar guarda motivo, quién y cuándo
        res_rech = client.post(
            f"/api/admin/biblioteca/{art.id}/rechazar",
            json={"motivo": "Faltan referencias clínicas"},
            headers=headers,
        )
        assert res_rech.status_code == 200
        assert art.estado == "RECHAZADO"
        assert art.motivo_rechazo == "Faltan referencias clínicas"
        assert art.revisado_por == admin_id
        assert art.revisado_en is not None
        assert any(isinstance(x, AuditLog) and x.action == "ARTICLE_REJECT" for x in agregados)

        # Aprobar cambia a APROBADO, limpia el motivo y registra quién y cuándo
        res_apr = client.post(
            f"/api/admin/biblioteca/{art.id}/aprobar",
            headers=headers,
        )
        assert res_apr.status_code == 200
        assert art.estado == "APROBADO"
        assert art.motivo_rechazo is None
        assert art.revisado_por == admin_id
        assert art.revisado_en is not None
        assert any(isinstance(x, AuditLog) and x.action == "ARTICLE_APPROVE" for x in agregados)


def test_rechazar_sin_motivo_da_400(app, client):
    admin_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
    art_id = uuid.uuid4()
    headers = _headers(app, "ADMIN", admin_id)

    res_vacio = client.post(f"/api/admin/biblioteca/{art_id}/rechazar", json={}, headers=headers)
    assert res_vacio.status_code in (400, 422)

    res_blanco = client.post(f"/api/admin/biblioteca/{art_id}/rechazar", json={"motivo": "   "}, headers=headers)
    assert res_blanco.status_code in (400, 422)


def test_aprobar_o_rechazar_inexistente_da_404(app, client, monkeypatch):
    admin_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
    headers = _headers(app, "ADMIN", admin_id)

    with app.app_context():
        monkeypatch.setattr(admin_routes.Article, "query", SimpleNamespace(get=lambda _id: None))
        assert client.post(f"/api/admin/biblioteca/{uuid.uuid4()}/aprobar", headers=headers).status_code == 404
        assert client.post(
            f"/api/admin/biblioteca/{uuid.uuid4()}/rechazar",
            json={"motivo": "Duplicado"},
            headers=headers,
        ).status_code == 404


def test_listar_biblioteca_admin_filtra_por_estado(app, client, monkeypatch):
    admin_id = uuid.UUID("99999999-9999-9999-9999-999999999999")
    headers = _headers(app, "ADMIN", admin_id)
    a_pend = Article(id=uuid.uuid4(), type="GUIA", title="Pendiente", url="/p", estado="PENDIENTE")
    a_apr = Article(id=uuid.uuid4(), type="GUIA", title="Aprobado", url="/a", estado="APROBADO")

    class ConsultaQueFiltra(ConsultaFalsa):
        """Aplica de verdad los filtros `Article.estado == valor` que recibe."""

        def filter(self, *condiciones):
            for c in condiciones:
                valor = c.right.value
                self._todos = [a for a in self._todos if getattr(a, c.left.key) == valor]
            return self

    with app.app_context():
        monkeypatch.setattr(admin_routes.Article, "query", ConsultaQueFiltra(todos=[a_pend, a_apr]))

        res_pend = client.get("/api/admin/biblioteca?estado=PENDIENTE", headers=headers)
        assert res_pend.status_code == 200
        assert [a["id"] for a in res_pend.get_json()["articulos"]] == [str(a_pend.id)]

        res_invalido = client.get("/api/admin/biblioteca?estado=OTRO", headers=headers)
        assert res_invalido.status_code == 400
