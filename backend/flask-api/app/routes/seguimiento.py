"""Seguimiento docente del desempeño de los estudiantes en el simulador clínico."""

import uuid

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt_identity

from app import get_mongo_db
from app.models import Consultation, Course, StudentCourse, User
from app.services import paginacion
from app.services.simulador.scoring import ETIQUETAS
from app.utils import role_required

seguimiento_bp = Blueprint("seguimiento", __name__)


def _curso_del_docente(course_id: str):
    """Devuelve (curso, None) si existe y pertenece al docente autenticado;
    en otro caso, (None, respuesta HTTP 400/404/403)."""
    try:
        cid = uuid.UUID(str(course_id))
    except ValueError:
        return None, (jsonify({"error": "Bad Request", "message": "ID de curso inválido.", "status_code": 400}), 400)
    curso = Course.query.get(cid)
    if not curso:
        return None, (jsonify({"error": "Not Found", "message": "Curso no encontrado.", "status_code": 404}), 404)
    if str(curso.teacher_id) != get_jwt_identity():
        return None, (jsonify({"error": "Forbidden", "message": "No eres el docente de este curso.", "status_code": 403}), 403)
    return curso, None


def _desgloses_por_consulta(consultation_ids: list[str]) -> dict[str, list[dict]]:
    """Lee de MongoDB únicamente el desglose por dimensión de las consultas dadas,
    sin exponer diagnóstico oculto ni rúbrica del caso."""
    if not consultation_ids:
        return {}
    try:
        cursor = get_mongo_db().consultations.find(
            {"consultation_id": {"$in": consultation_ids}, "ai_evaluation.desglose": {"$exists": True}},
            {"consultation_id": 1, "ai_evaluation.desglose": 1},
        )
        resultado: dict[str, list[dict]] = {}
        for doc in cursor:
            cid = doc.get("consultation_id")
            if not cid:
                continue
            items = []
            for item in (doc.get("ai_evaluation") or {}).get("desglose") or []:
                dim = item.get("dimension")
                puntaje = item.get("puntaje")
                if dim and puntaje is not None:
                    items.append({
                        "dimension": dim,
                        "etiqueta": ETIQUETAS.get(dim, dim),
                        "puntaje": round(float(puntaje), 1),
                    })
            resultado[cid] = items
        return resultado
    except Exception:  # noqa: BLE001
        return {}


def _promedios_dimensiones(desgloses_lista: list[list[dict]]) -> list[dict]:
    """Promedia el puntaje de cada dimensión evaluada en una lista de desgloses."""
    sumas: dict[str, tuple[float, int]] = {}
    for desglose in desgloses_lista:
        for item in desglose:
            dim = item["dimension"]
            suma, n = sumas.get(dim, (0.0, 0))
            sumas[dim] = (suma + float(item["puntaje"]), n + 1)
    return [
        {
            "dimension": dim,
            "etiqueta": ETIQUETAS.get(dim, dim),
            "promedio": round(suma / n, 1),
        }
        for dim, (suma, n) in sumas.items()
    ]


def _dimension_mas_debil(desgloses_lista: list[list[dict]]) -> dict | None:
    """Devuelve la dimensión con menor promedio, o None si aún no hay desgloses."""
    dimensiones = _promedios_dimensiones(desgloses_lista)
    if not dimensiones:
        return None
    return min(dimensiones, key=lambda d: d["promedio"])


def _fecha_iso(consulta: Consultation) -> str | None:
    momento = consulta.finished_at or consulta.started_at
    return momento.isoformat() if momento else None


@seguimiento_bp.route("/cursos/<string:course_id>", methods=["GET"])
@role_required("TEACHER")
def seguimiento_curso(course_id: str):
    """Resumen del curso y listado paginado de estudiantes matriculados con sus
    métricas en el simulador clínico (solo consultas COMPLETED)."""
    curso, error = _curso_del_docente(course_id)
    if error:
        return error

    pagina, limite = paginacion.parametros()
    consulta_matriculados = (
        User.query.join(StudentCourse, StudentCourse.student_id == User.id)
        .filter(StudentCourse.course_id == curso.id)
        .order_by(User.last_name.asc(), User.first_name.asc())
    )
    estudiantes_pagina, total = paginacion.paginar(consulta_matriculados, pagina, limite)

    ids_matriculados = [
        m.student_id for m in StudentCourse.query.filter_by(course_id=curso.id).all()
    ]

    # Consultas completadas en el curso para calcular el resumen y las filas de la página.
    consultas_curso = (
        Consultation.query.filter(
            Consultation.course_id == curso.id,
            Consultation.student_id.in_(ids_matriculados),
            Consultation.status == "COMPLETED",
        )
        .order_by(Consultation.finished_at.asc(), Consultation.started_at.asc())
        .all()
        if ids_matriculados
        else []
    )

    por_estudiante: dict[uuid.UUID, list[Consultation]] = {}
    puntajes_curso: list[float] = []
    for c in consultas_curso:
        por_estudiante.setdefault(c.student_id, []).append(c)
        if c.score is not None:
            puntajes_curso.append(float(c.score))

    # Promedio por subtema solo con las consultas de ESTE curso (la selección
    # adaptativa mira todas las del estudiante; aquí interesa el curso).
    acumulado_subtemas: dict[str, tuple[float, int]] = {}
    for c in consultas_curso:
        if c.subtema and c.score is not None:
            s_prev, n_prev = acumulado_subtemas.get(c.subtema, (0.0, 0))
            acumulado_subtemas[c.subtema] = (s_prev + float(c.score), n_prev + 1)

    promedio_por_subtema = [
        {
            "subtema": subtema,
            "promedio": round(suma / cant, 1),
            "consultas": cant,
        }
        for subtema, (suma, cant) in sorted(acumulado_subtemas.items())
    ]

    ids_consultas_pagina = [
        str(c.id)
        for est in estudiantes_pagina
        for c in por_estudiante.get(est.id, [])
    ]
    desgloses_map = _desgloses_por_consulta(ids_consultas_pagina)

    filas_estudiantes = []
    for est in estudiantes_pagina:
        lista = por_estudiante.get(est.id, [])
        puntajes = [float(c.score) for c in lista if c.score is not None]
        ultima = lista[-1] if lista else None
        desgloses_est = [desgloses_map[str(c.id)] for c in lista if str(c.id) in desgloses_map]
        filas_estudiantes.append({
            "student_id": str(est.id),
            "nombre": f"{est.first_name} {est.last_name}".strip(),
            "email": est.email,
            "consultas_completadas": len(lista),
            "promedio": round(sum(puntajes) / len(puntajes), 1) if puntajes else None,
            "ultimo_puntaje": round(float(ultima.score), 1) if ultima and ultima.score is not None else None,
            "fecha_ultima_consulta": _fecha_iso(ultima) if ultima else None,
            "dimension_debil": _dimension_mas_debil(desgloses_est),
        })

    return jsonify({
        "course_id": str(curso.id),
        "curso_titulo": curso.name,
        "resumen": {
            "promedio_general": round(sum(puntajes_curso) / len(puntajes_curso), 1) if puntajes_curso else None,
            "total_consultas": len(consultas_curso),
            "promedio_por_subtema": promedio_por_subtema,
        },
        "estudiantes": filas_estudiantes,
        **paginacion.meta(total, pagina, limite),
    }), 200


@seguimiento_bp.route("/cursos/<string:course_id>/estudiantes/<string:student_id>", methods=["GET"])
@role_required("TEACHER")
def seguimiento_estudiante(course_id: str, student_id: str):
    """Detalle de las consultas completadas y evolución en el tiempo de un
    estudiante matriculado en el curso."""
    curso, error = _curso_del_docente(course_id)
    if error:
        return error

    try:
        sid = uuid.UUID(str(student_id))
    except ValueError:
        return jsonify({"error": "Bad Request", "message": "ID de estudiante inválido.", "status_code": 400}), 400

    estudiante = (
        User.query.join(StudentCourse, StudentCourse.student_id == User.id)
        .filter(StudentCourse.course_id == curso.id, User.id == sid)
        .first()
    )
    if not estudiante:
        return jsonify({"error": "Not Found", "message": "El estudiante no está matriculado en este curso.", "status_code": 404}), 404

    consultas = (
        Consultation.query.filter_by(
            course_id=curso.id,
            student_id=estudiante.id,
            status="COMPLETED",
        )
        .order_by(Consultation.finished_at.asc(), Consultation.started_at.asc())
        .all()
    )

    desgloses_map = _desgloses_por_consulta([str(c.id) for c in consultas])
    desgloses_lista = [desgloses_map[str(c.id)] for c in consultas if str(c.id) in desgloses_map]

    items_consultas = []
    evolucion = []
    for c in consultas:
        fecha = _fecha_iso(c)
        puntaje = round(float(c.score), 1) if c.score is not None else None
        desglose = desgloses_map.get(str(c.id), [])
        items_consultas.append({
            "consultation_id": str(c.id),
            "fecha": fecha,
            "subtema": c.subtema,
            "dificultad": c.difficulty,
            "puntaje": puntaje,
            "desglose": desglose,
        })
        if puntaje is not None:
            evolucion.append({
                "consultation_id": str(c.id),
                "fecha": fecha,
                "puntaje": puntaje,
                "subtema": c.subtema,
                "dificultad": c.difficulty,
            })

    puntajes = [item["puntaje"] for item in evolucion]
    return jsonify({
        "course_id": str(curso.id),
        "estudiante": {
            "student_id": str(estudiante.id),
            "nombre": f"{estudiante.first_name} {estudiante.last_name}".strip(),
            "email": estudiante.email,
            "consultas_completadas": len(consultas),
            "promedio": round(sum(puntajes) / len(puntajes), 1) if puntajes else None,
            "dimension_debil": _dimension_mas_debil(desgloses_lista),
            "dimensiones": _promedios_dimensiones(desgloses_lista),
        },
        "evolucion": evolucion,
        "consultas": list(reversed(items_consultas)),
    }), 200
