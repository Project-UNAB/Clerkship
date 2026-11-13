"""Informe completo de una consulta simulada: lo que se muestra en la página
del informe y lo que se descarga en Word o PDF.

Junta lo de PostgreSQL (consulta, evaluación, nota del docente, comentarios)
con lo de MongoDB (cierre del estudiante, evaluación detallada y
conversación). El PDF sale de convertir el mismo Word con Gotenberg, así los
dos formatos dicen exactamente lo mismo."""
import io
import re
from datetime import timezone

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from app import get_mongo_db
from app.models import AiEvaluation, ConsultationComment, Course, CourseContentItem, User
from app.services import conversion

AZUL = RGBColor(0x0D, 0x47, 0xA1)
AZUL_CLARO = "E3F2FD"
GRIS = RGBColor(0x47, 0x55, 0x69)
NIVELES = {
    "alta": "Concordancia alta", "media": "Concordancia media", "baja": "Concordancia baja", "nula": "Sin concordancia",
    "completa": "Completa", "adecuada": "Adecuada", "incompleta": "Incompleta", "ausente": "Ausente",
    "adecuado": "Adecuado", "parcial": "Parcial", "inadecuado": "Inadecuado",
    "excelente": "Excelente", "mejorable": "Mejorable", "deficiente": "Deficiente",
}
DIFICULTAD = {"EASY": "Básica", "MEDIUM": "Intermedia", "HARD": "Avanzada"}
SECCIONES = {
    "general": "General", "cierre": "Cierre del estudiante", "anamnesis": "Anamnesis",
    "diagnostico": "Diagnóstico", "evaluacion": "Evaluación", "conversacion": "Conversación",
}

_ROTULOS = ("Anamnesis del estudiante:", "Otros diagnósticos:", "Notas:")


def _iso(valor):
    if not valor:
        return None
    return (valor.astimezone(timezone.utc) if valor.tzinfo else valor.replace(tzinfo=timezone.utc)).isoformat()


def separar_notas(notas: str) -> dict:
    """El cierre guarda la anamnesis, los otros diagnósticos y las notas en un
    solo texto rotulado; aquí se separan. Un texto sin rótulos son notas."""
    texto = (notas or "").strip()
    if not texto:
        return {"anamnesis": "", "otros_diagnosticos": [], "notas": ""}
    if not any(texto.startswith(r) or f"\n{r}" in texto for r in _ROTULOS):
        return {"anamnesis": "", "otros_diagnosticos": [], "notas": texto}
    partes = re.split(r"(?:^|\n)(Anamnesis del estudiante:|Otros diagnósticos:|Notas:)\s*", texto)
    valores = {}
    for i in range(1, len(partes) - 1, 2):
        valores[partes[i]] = partes[i + 1].strip()
    otros = [o.strip() for o in valores.get("Otros diagnósticos:", "").split(";") if o.strip()]
    return {
        "anamnesis": valores.get("Anamnesis del estudiante:", ""),
        "otros_diagnosticos": otros,
        "notas": valores.get("Notas:", ""),
    }


def _nombre(usuario) -> str:
    return f"{usuario.first_name} {usuario.last_name}".strip() if usuario else ""


def datos_informe(consulta) -> dict:
    """Todo lo que muestra el informe, en un solo diccionario."""
    evaluacion = AiEvaluation.query.filter_by(consultation_id=consulta.id).first()
    estudiante = User.query.get(consulta.student_id)
    curso = Course.query.get(consulta.course_id)
    item = CourseContentItem.query.get(consulta.course_item_id) if consulta.course_item_id else None

    detalle, chat, respuesta = None, [], None
    try:
        doc = get_mongo_db().consultations.find_one({"consultation_id": str(consulta.id)}) or {}
        detalle = doc.get("ai_evaluation")
        chat = doc.get("chat_history") or []
        respuesta = doc.get("respuesta_estudiante")
    except Exception:  # noqa: BLE001
        pass

    cierre = None
    if isinstance(respuesta, dict):
        cierre = {
            "diagnostico": respuesta.get("hipotesis") or "",
            "diferenciales": list(respuesta.get("diferenciales") or []),
            "plan": respuesta.get("plan") or "",
            **separar_notas(respuesta.get("notas") or ""),
        }

    return {
        "consulta": consulta.to_dict(),
        "estudiante": {"id": str(consulta.student_id), "nombre": _nombre(estudiante)},
        "curso": {"id": str(curso.id), "nombre": curso.name} if curso else None,
        "caso_asignado": None if item is None else {
            "item_id": str(item.id),
            "titulo": item.title,
            "max_score": float(item.max_score) if item.max_score is not None else 100.0,
            "teacher_score": float(consulta.teacher_score) if consulta.teacher_score is not None else None,
            "teacher_feedback": consulta.teacher_feedback,
            "graded_at": _iso(consulta.graded_at),
        },
        "evaluacion": {
            "puntaje": float(evaluacion.final_score) if evaluacion and evaluacion.final_score is not None
            else (float(consulta.score) if consulta.score is not None else None),
            "resumen": evaluacion.feedback_summary if evaluacion else None,
            "detalle": detalle,
        },
        "cierre": cierre,
        "conversacion": [
            {
                "sender": m.get("sender"),
                "content": m.get("content", ""),
                "timestamp": m.get("timestamp"),
                "es_exploracion": str(m.get("content", "")).startswith("[Exploracion fisica:"),
            }
            for m in chat
        ],
    }


# ─────────────────────────────── Word ───────────────────────────────

def _sombrear(celda, color):
    tc = celda._tc.get_or_add_tcPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:color"), "auto")
    sh.set(qn("w:fill"), color)
    tc.append(sh)


def _titulo(doc, texto, nivel=1):
    h = doc.add_heading(texto, level=nivel)
    for r in h.runs:
        r.font.color.rgb = AZUL
        r.font.name = "Calibri"
    return h


def _parrafo(doc, texto, negrita_inicio=None, color=None, tam=11):
    p = doc.add_paragraph()
    if negrita_inicio:
        r = p.add_run(negrita_inicio)
        r.bold = True
        r.font.size = Pt(tam)
    if texto == "" and negrita_inicio:
        return p          # solo el rótulo (una lista va debajo)
    r = p.add_run(texto or "—")
    r.font.size = Pt(tam)
    if color:
        r.font.color.rgb = color
    return p


def _lista(doc, elementos, vacio="—"):
    if not elementos:
        _parrafo(doc, vacio, color=GRIS)
        return
    for e in elementos:
        doc.add_paragraph(str(e), style="List Bullet")


def _fecha_legible(iso):
    if not iso:
        return "—"
    from datetime import datetime, timedelta
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=-5)))
    except ValueError:
        return iso
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    return f"{d.day} de {meses[d.month - 1]} de {d.year}, {d.strftime('%I:%M %p').lower()}"


def generar_docx(datos: dict, comentarios: list) -> bytes:
    doc = Document()
    for s in doc.sections:
        s.left_margin = s.right_margin = Cm(2.2)
        s.top_margin = s.bottom_margin = Cm(2)
    estilo = doc.styles["Normal"]
    estilo.font.name = "Calibri"
    estilo.font.size = Pt(11)

    c = datos["consulta"]
    ev = datos["evaluacion"]
    det = ev.get("detalle") or {}
    rev = det.get("revelacion") or {}

    t = doc.add_paragraph()
    r = t.add_run("Informe de la consulta simulada")
    r.bold = True
    r.font.size = Pt(22)
    r.font.color.rgb = AZUL
    sub = doc.add_paragraph()
    r = sub.add_run(c.get("title") or "Consulta")
    r.font.size = Pt(13)
    r.font.color.rgb = GRIS

    tabla = doc.add_table(rows=0, cols=2)
    tabla.style = "Table Grid"
    tabla.alignment = WD_TABLE_ALIGNMENT.CENTER
    filas = [
        ("Estudiante", datos["estudiante"]["nombre"] or "—"),
        ("Curso", (datos.get("curso") or {}).get("nombre") or "—"),
        ("Caso asignado", (datos.get("caso_asignado") or {}).get("titulo") or "Práctica libre"),
        ("Fecha", _fecha_legible(c.get("finished_at") or c.get("started_at"))),
        ("Subtema", rev.get("subtema") or c.get("subtema") or "—"),
        ("Dificultad", DIFICULTAD.get(c.get("difficulty"), c.get("difficulty") or "—")),
    ]
    for k, v in filas:
        celdas = tabla.add_row().cells
        celdas[0].text, celdas[1].text = k, str(v)
        celdas[0].paragraphs[0].runs[0].bold = True
        _sombrear(celdas[0], AZUL_CLARO)
        celdas[0].width, celdas[1].width = Cm(4.5), Cm(12)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(14)
    r = p.add_run(f"{ev['puntaje']:.0f} / 100" if ev.get("puntaje") is not None else "Sin puntaje")
    r.bold = True
    r.font.size = Pt(30)
    r.font.color.rgb = AZUL
    p2 = doc.add_paragraph("Puntaje calculado por la fórmula del sistema a partir de la clasificación del evaluador")
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.runs[0].font.size = Pt(9)
    p2.runs[0].font.color.rgb = GRIS

    caso = datos.get("caso_asignado")
    if caso and caso.get("teacher_score") is not None:
        _titulo(doc, "Calificación del docente")
        _parrafo(doc, f"{caso['teacher_score']:g} / {caso['max_score']:g}", "Nota: ")
        if caso.get("teacher_feedback"):
            _parrafo(doc, caso["teacher_feedback"], "Comentario: ")

    if det.get("desglose"):
        _titulo(doc, "Puntaje por dimensión")
        tb = doc.add_table(rows=1, cols=3)
        tb.style = "Table Grid"
        for celda, txt in zip(tb.rows[0].cells, ["Dimensión", "Peso", "Puntaje"]):
            celda.text = txt
            celda.paragraphs[0].runs[0].bold = True
            _sombrear(celda, AZUL_CLARO)
        for d in det["desglose"]:
            celdas = tb.add_row().cells
            celdas[0].text = d.get("etiqueta", "")
            celdas[1].text = f"{d.get('peso', 0)} %"
            celdas[2].text = f"{d.get('puntaje', 0)} / 100"

    cierre = datos.get("cierre")
    _titulo(doc, "Cierre del estudiante")
    if cierre:
        _titulo(doc, "Anamnesis", 2)
        _parrafo(doc, cierre.get("anamnesis") or "No la registró.")
        _parrafo(doc, cierre.get("diagnostico"), "Diagnóstico: ")
        if cierre.get("otros_diagnosticos"):
            _parrafo(doc, "; ".join(cierre["otros_diagnosticos"]), "Otros diagnósticos: ")
        _parrafo(doc, "; ".join(cierre.get("diferenciales") or []) or "No registró.", "Diagnósticos diferenciales: ")
        _parrafo(doc, cierre.get("plan") or "No registró.", "Plan de manejo: ")
        if cierre.get("notas"):
            _parrafo(doc, cierre["notas"], "Notas: ")
    else:
        _parrafo(doc, "Esta consulta es anterior a que la plataforma guardara el cierre del estudiante.", color=GRIS)

    if det:
        _titulo(doc, "Evaluación")
        for etiqueta, nivel, comentario in [
            ("Anamnesis escrita", det.get("calidad_anamnesis_escrita"), det.get("comentario_anamnesis_escrita")),
            ("Diagnóstico", det.get("concordancia_hipotesis"), det.get("comentario_hipotesis")),
            ("Plan de manejo", det.get("calidad_plan"), det.get("comentario_plan")),
            ("Comunicación", det.get("comunicacion"), det.get("comentario_comunicacion")),
        ]:
            if nivel:
                _parrafo(doc, f"{NIVELES.get(nivel, nivel)}. {comentario or ''}".strip(), f"{etiqueta}: ")
        _titulo(doc, "Retroalimentación", 2)
        _parrafo(doc, det.get("retroalimentacion_formativa"))
        _titulo(doc, "Fortalezas", 2)
        _lista(doc, det.get("fortalezas"))
        _titulo(doc, "Aspectos por mejorar", 2)
        _lista(doc, det.get("aspectos_a_mejorar"))
        _titulo(doc, "Preguntas clave de la anamnesis", 2)
        _parrafo(doc, "", "Cubiertas:")
        _lista(doc, det.get("preguntas_clave_cubiertas"), "Ninguna")
        _parrafo(doc, "", "Omitidas:")
        _lista(doc, det.get("preguntas_clave_omitidas"), "Ninguna")
        _titulo(doc, "Hallazgos", 2)
        _parrafo(doc, "", "Indagados:")
        _lista(doc, det.get("hallazgos_indagados_correctamente"), "Ninguno")
        _parrafo(doc, "", "No indagados:")
        _lista(doc, det.get("hallazgos_no_indagados"), "Ninguno")
        expl = det.get("exploracion") or {}
        if expl:
            _titulo(doc, "Examen físico y paraclínicos", 2)
            _parrafo(doc, "; ".join(expl.get("pertinentes_realizados") or []) or "Ninguno", "Pertinentes realizados: ")
            _parrafo(doc, "; ".join(expl.get("pertinentes_omitidos") or []) or "Ninguno", "Pertinentes omitidos: ")
            if expl.get("paraclinicos_no_pertinentes"):
                _parrafo(doc, "; ".join(expl["paraclinicos_no_pertinentes"]), "Paraclínicos no pertinentes: ")
        _titulo(doc, "Diferenciales", 2)
        _parrafo(doc, "; ".join(det.get("diferenciales_pertinentes") or []) or "Ninguno", "Pertinentes: ")
        _parrafo(doc, "; ".join(det.get("diferenciales_faltantes") or []) or "Ninguno", "Faltantes: ")
        if rev:
            _titulo(doc, "Diagnóstico real del caso")
            _parrafo(doc, rev.get("diagnostico_real"), "Diagnóstico: ")
            if rev.get("diferenciales_esperados"):
                _parrafo(doc, "; ".join(rev["diferenciales_esperados"]), "Diferenciales esperados: ")
    elif ev.get("resumen"):
        _titulo(doc, "Retroalimentación")
        _parrafo(doc, ev["resumen"])

    if comentarios:
        _titulo(doc, "Notas sobre el informe")
        for com in comentarios:
            autor = (com.get("autor") or {}).get("nombre") or "Usuario"
            rol = "docente" if (com.get("autor") or {}).get("role") == "TEACHER" else "estudiante"
            seccion = SECCIONES.get(com.get("section"), com.get("section") or "General")
            _parrafo(doc, com.get("body"), f"{autor} ({rol}) · {seccion} · {_fecha_legible(com.get('created_at'))}: ", tam=10)

    conversacion = [m for m in datos.get("conversacion") or [] if m.get("content")]
    if conversacion:
        doc.add_page_break()
        _titulo(doc, "Anexo: conversación con el paciente")
        for m in conversacion:
            quien = "Exploración" if m.get("es_exploracion") else ("Estudiante" if m.get("sender") == "STUDENT" else "Paciente")
            texto = re.sub(r"^\[Exploracion fisica:\s*|\]$", "", m["content"]) if m.get("es_exploracion") else m["content"]
            _parrafo(doc, texto, f"{quien}: ", tam=10)

    pie = doc.sections[0].footer.paragraphs[0]
    pie.text = "Informe generado por la plataforma de simulación clínica · Universidad Autónoma de Bucaramanga"
    pie.runs[0].font.size = Pt(8)
    pie.runs[0].font.color.rgb = GRIS

    salida = io.BytesIO()
    doc.save(salida)
    return salida.getvalue()


def generar_pdf(datos: dict, comentarios: list) -> bytes:
    return conversion.convertir_a_pdf(generar_docx(datos, comentarios), "informe.docx")


def comentarios_de(consulta_id) -> list:
    filas = ConsultationComment.query.filter_by(consultation_id=consulta_id).order_by(ConsultationComment.created_at.asc()).all()
    autores = {str(u.id): u for u in User.query.filter(User.id.in_([f.author_id for f in filas])).all()} if filas else {}
    return [f.to_dict(autores.get(str(f.author_id))) for f in filas]
