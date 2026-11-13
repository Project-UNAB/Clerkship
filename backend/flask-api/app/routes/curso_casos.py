"""Casos clínicos asignados en un curso (contenido de tipo CASE).

El docente dueño del curso genera el caso una sola vez (puede regenerarlo
mientras nadie lo haya empezado) y todos los estudiantes entrevistan al
mismo paciente. Cada estudiante tiene un solo intento: «iniciar» crea su
consulta a partir del caso guardado, o le devuelve la que ya tiene. El
docente ve cómo le fue a cada uno y abre el informe para dejar notas y
calificarlo (rutas /api/informes)."""
import copy
from datetime import datetime, timezone
from typing import Optional

from flask import Blueprint, jsonify
from pydantic import Field

from app import db, get_mongo_db, limiter
from app.models import Consultation, StudentCourse, User
from app.routes.curso_contenido import (
    _curso_o_404, _es_docente_dueno, _es_estudiante_matriculado, _forbidden, _item_del_curso,
)
from app.schemas.base import BaseSchema, validate_body
from app.services import limites
from app.services.simulador import agentes
from app.services.simulador.catalogo import SUBTEMAS, normalizar_subtema
from app.services.simulador.rag import obtener_referencias
from app.utils import get_current_user, role_required

curso_casos_bp = Blueprint("curso_casos", __name__)

RUTA = "/<course_id>/bloques/<block_id>/contenido/<item_id>/caso"
DIFICULTAD_UI_A_CATALOGO = {"EASY": "facil", "MEDIUM": "intermedio", "HARD": "dificil"}
DIFICULTAD_CATALOGO_A_UI = {v: k for k, v in DIFICULTAD_UI_A_CATALOGO.items()}


class GenerarCasoCursoRequest(BaseSchema):
    subtema: str = Field(..., min_length=2, max_length=150)
    dificultad: str = Field("MEDIUM", description="EASY | MEDIUM | HARD")
    # La enfermedad exacta que tendrá el paciente; el caso se genera alrededor de ella.
    diagnostico: str = Field(..., min_length=3, max_length=200)


def _error(status, mensaje):
    nombres = {400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 503: "Service Unavailable"}
    return jsonify({"error": nombres.get(status, "Error"), "message": mensaje, "status_code": status}), status


def _caso_del_curso(course_id, block_id, item_id, permitido):
    """(curso, item, None) o (None, None, error). El permiso sobre el curso se
    revisa antes de buscar el contenido."""
    course, err = _curso_o_404(course_id)
    if err:
        return None, None, err
    if not permitido(course):
        return None, None, _forbidden()
    item = _item_del_curso(course_id, block_id, item_id)
    if item is None or item.type != "CASE":
        return None, None, _error(404, "Caso clínico no encontrado")
    return course, item, None


def _ahora():
    return datetime.now(timezone.utc)


def _utc(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _resumen_para_docente(item) -> Optional[dict]:
    """Lo que el docente revisa antes de publicar: el caso completo, incluido el diagnóstico."""
    caso = item.case_template
    if not caso:
        return None
    dp = caso.get("datos_paciente") or {}
    rub = caso.get("rubrica_evaluacion") or {}
    return {
        "paciente": {k: dp.get(k) for k in ("nombre", "edad", "sexo", "ocupacion")},
        "presentacion_inicial": caso.get("presentacion_inicial"),
        "sintomas_principales": caso.get("sintomas_principales") or [],
        "antecedentes": caso.get("antecedentes"),
        "diagnostico_real": caso.get("diagnostico_real"),
        "diferenciales_esperados": rub.get("diagnosticos_diferenciales_esperados") or [],
        "preguntas_clave": rub.get("preguntas_clave_anamnesis") or [],
        "subtema": item.case_subtema,
        "dificultad": item.case_dificultad,
    }


def _consulta_de(item, student_id):
    return (Consultation.query.filter_by(course_item_id=item.id, student_id=student_id)
            .order_by(Consultation.started_at.desc()).first())


def _estado_estudiante(item, consulta) -> dict:
    if consulta is None:
        return {"estado": "PENDIENTE", "consultation_id": None}
    return {
        "estado": "COMPLETADO" if consulta.status == "COMPLETED" else "EN_CURSO",
        "consultation_id": str(consulta.id),
        "score": float(consulta.score) if consulta.score is not None else None,
        "teacher_score": float(consulta.teacher_score) if consulta.teacher_score is not None else None,
        "finished_at": consulta.to_dict()["finished_at"],
    }


@curso_casos_bp.get(RUTA)
@role_required("TEACHER", "STUDENT")
def obtener_caso_curso(course_id, block_id, item_id):
    """Docente dueño: el caso completo para revisarlo. Estudiante matriculado: su estado."""
    user = get_current_user()
    course, item, err = _caso_del_curso(course_id, block_id, item_id,
                                        lambda c: _es_docente_dueno(user, c) or _es_estudiante_matriculado(user, c))
    if err:
        return err
    base = {"item": item.to_dict()}
    if _es_docente_dueno(user, course):
        empezados = Consultation.query.filter_by(course_item_id=item.id).count()
        return jsonify({**base, "caso": _resumen_para_docente(item), "empezados": empezados,
                        "puede_regenerar": empezados == 0}), 200
    return jsonify({**base, "mi_caso": _estado_estudiante(item, _consulta_de(item, user.id))}), 200


@curso_casos_bp.post(RUTA + "/generar")
@role_required("TEACHER")
@limiter.limit(limites.GENERAR_CASO, key_func=limites.usuario_o_ip)
@validate_body(GenerarCasoCursoRequest)
def generar_caso_curso(course_id, block_id, item_id, validated_body: GenerarCasoCursoRequest):
    """Genera (o regenera, si nadie lo empezó) el caso que harán todos los estudiantes."""
    user = get_current_user()
    course, item, err = _caso_del_curso(course_id, block_id, item_id, lambda c: _es_docente_dueno(user, c))
    if err:
        return err
    if Consultation.query.filter_by(course_item_id=item.id).count() > 0:
        return _error(409, "Ya hay estudiantes que empezaron este caso; no se puede cambiar.")
    subtema = normalizar_subtema(validated_body.subtema)
    if subtema is None:
        return _error(400, "Subtema no válido. Opciones: " + "; ".join(SUBTEMAS))
    dificultad = DIFICULTAD_UI_A_CATALOGO.get((validated_body.dificultad or "MEDIUM").upper())
    if dificultad is None:
        return _error(400, "dificultad debe ser EASY, MEDIUM o HARD")

    diagnostico = " ".join(validated_body.diagnostico.split())
    if len(diagnostico) < 3:
        return _error(400, "Escribe el diagnóstico del caso")
    resultado = agentes.generar_caso(subtema, dificultad, obtener_referencias(subtema), diagnostico_objetivo=diagnostico)
    if resultado.get("is_mock"):
        return _error(503, "El generador de casos no está disponible en este momento; inténtalo de nuevo.")
    item.case_template = resultado["caso_completo_oculto"]
    item.case_subtema = subtema
    item.case_dificultad = DIFICULTAD_CATALOGO_A_UI[dificultad]
    db.session.commit()
    return jsonify({"item": item.to_dict(), "caso": _resumen_para_docente(item), "empezados": 0, "puede_regenerar": True}), 200


@curso_casos_bp.post(RUTA + "/iniciar")
@role_required("STUDENT")
@limiter.limit("10 per minute")
def iniciar_caso_curso(course_id, block_id, item_id):
    """Crea la consulta del estudiante con el caso del docente, o devuelve la que ya tiene."""
    user = get_current_user()
    course, item, err = _caso_del_curso(course_id, block_id, item_id, lambda c: _es_estudiante_matriculado(user, c))
    if err:
        return err
    existente = _consulta_de(item, user.id)
    if existente is not None:
        return jsonify(_estado_estudiante(item, existente)), 200
    if not item.case_template:
        return _error(409, "El docente todavía no ha preparado este caso.")
    ahora = _ahora()
    if item.open_at and _utc(item.open_at) > ahora:
        return _error(409, "Este caso todavía no está disponible.")
    if item.due_at and _utc(item.due_at) < ahora:
        return _error(409, "El plazo para resolver este caso ya cerró.")

    caso = copy.deepcopy(item.case_template)
    consulta = Consultation(
        student_id=user.id,
        course_id=course.id,
        course_item_id=item.id,
        title=item.title[:255],
        specialty="Gastroenterología",
        difficulty=item.case_dificultad or DIFICULTAD_CATALOGO_A_UI.get(caso.get("dificultad_asignada"), "MEDIUM"),
        subtema=item.case_subtema,
        status="IN_PROGRESS",
    )
    db.session.add(consulta)
    db.session.commit()
    apertura = caso.get("presentacion_inicial") or ""
    try:
        get_mongo_db().consultations.insert_one({
            "consultation_id": str(consulta.id),
            "status": "IN_PROGRESS",
            "case": caso,
            "acciones_clinicas": [],
            "chat_history": [{"sender": "PATIENT", "content": apertura, "timestamp": ahora.isoformat()}],
            "created_at": ahora,
            "course_item_id": str(item.id),
        })
    except Exception:  # noqa: BLE001 — sin el documento la consulta no sirve: se deshace
        db.session.delete(consulta)
        db.session.commit()
        return _error(503, "No se pudo preparar la consulta; inténtalo de nuevo.")
    return jsonify(_estado_estudiante(item, consulta)), 201


@curso_casos_bp.get(RUTA + "/resultados")
@role_required("TEACHER")
def resultados_caso_curso(course_id, block_id, item_id):
    """Cada estudiante matriculado con su estado, la nota del evaluador y la del docente."""
    user = get_current_user()
    course, item, err = _caso_del_curso(course_id, block_id, item_id, lambda c: _es_docente_dueno(user, c))
    if err:
        return err
    matriculados = [m.student_id for m in StudentCourse.query.filter_by(course_id=course.id).all()]
    usuarios = {u.id: u for u in User.query.filter(User.id.in_(matriculados)).all()} if matriculados else {}
    consultas = {}
    for c in Consultation.query.filter_by(course_item_id=item.id).order_by(Consultation.started_at.asc()).all():
        consultas[c.student_id] = c
    filas = []
    for sid in matriculados:
        u = usuarios.get(sid)
        if u is None:
            continue
        filas.append({
            "estudiante": {"id": str(u.id), "nombre": f"{u.first_name} {u.last_name}".strip()},
            **_estado_estudiante(item, consultas.get(sid)),
        })
    filas.sort(key=lambda f: ({"COMPLETADO": 0, "EN_CURSO": 1, "PENDIENTE": 2}[f["estado"]], f["estudiante"]["nombre"].lower()))
    completados = [f for f in filas if f["estado"] == "COMPLETADO"]
    return jsonify({
        "item": item.to_dict(),
        "resultados": filas,
        "resumen": {
            "matriculados": len(filas),
            "completados": len(completados),
            "calificados": sum(1 for f in completados if f.get("teacher_score") is not None),
            "promedio_evaluador": round(sum(f["score"] for f in completados if f.get("score") is not None)
                                        / max(1, sum(1 for f in completados if f.get("score") is not None)), 1)
            if any(f.get("score") is not None for f in completados) else None,
        },
    }), 200
