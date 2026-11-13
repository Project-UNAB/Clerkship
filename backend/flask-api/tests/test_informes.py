"""Informe de la consulta: separación del cierre, documento Word y reglas de acceso."""
import io
import uuid
from types import SimpleNamespace

from docx import Document

from app.routes import informes as informes_routes
from app.services.informe_consulta import generar_docx, separar_notas


def test_separa_anamnesis_otros_diagnosticos_y_notas():
    notas = ("Anamnesis del estudiante: Mujer de 45 años con dolor epigástrico.\nAntecedente de colelitiasis.\n"
             "Otros diagnósticos: Diabetes tipo 2; Obesidad\nNotas: revisar lipasa")
    r = separar_notas(notas)
    assert r["anamnesis"] == "Mujer de 45 años con dolor epigástrico.\nAntecedente de colelitiasis."
    assert r["otros_diagnosticos"] == ["Diabetes tipo 2", "Obesidad"]
    assert r["notas"] == "revisar lipasa"


def test_notas_sin_rotulos_son_notas_libres():
    assert separar_notas("solo una nota") == {"anamnesis": "", "otros_diagnosticos": [], "notas": "solo una nota"}
    assert separar_notas("") == {"anamnesis": "", "otros_diagnosticos": [], "notas": ""}


def _datos():
    return {
        "consulta": {"title": "Caso de Ana", "finished_at": "2026-11-13T15:00:00+00:00", "difficulty": "MEDIUM", "subtema": "Pancreatitis aguda"},
        "estudiante": {"id": str(uuid.uuid4()), "nombre": "Ana Pérez"},
        "curso": {"id": str(uuid.uuid4()), "nombre": "Gastroenterología Clínica"},
        "caso_asignado": {"item_id": "x", "titulo": "Caso asignado 1", "max_score": 50.0, "teacher_score": 42.0,
                          "teacher_feedback": "Buen razonamiento", "graded_at": None},
        "evaluacion": {"puntaje": 78.0, "resumen": None, "detalle": {
            "desglose": [{"etiqueta": "Anamnesis", "peso": 30, "puntaje": 80}],
            "calidad_anamnesis_escrita": "adecuada", "comentario_anamnesis_escrita": "Faltó el examen físico.",
            "concordancia_hipotesis": "alta", "comentario_hipotesis": "Correcto.",
            "retroalimentacion_formativa": "Bien hecho.", "fortalezas": ["Saludo"], "aspectos_a_mejorar": ["Irradiación"],
            "revelacion": {"diagnostico_real": "Pancreatitis aguda biliar", "subtema": "Pancreatitis aguda", "diferenciales_esperados": ["Úlcera"]},
        }},
        "cierre": {"diagnostico": "Pancreatitis biliar", "diferenciales": ["Colecistitis"], "plan": "Líquidos",
                   "anamnesis": "Mujer de 45 años", "otros_diagnosticos": ["Obesidad"], "notas": ""},
        "conversacion": [{"sender": "PATIENT", "content": "Me duele", "timestamp": None, "es_exploracion": False}],
    }


def test_el_word_trae_las_partes_del_informe():
    contenido = generar_docx(_datos(), [{"autor": {"nombre": "Docente", "role": "TEACHER"}, "section": "anamnesis",
                                         "body": "Revisa el examen", "created_at": "2026-11-13T16:00:00+00:00"}])
    texto = "\n".join(p.text for p in Document(io.BytesIO(contenido)).paragraphs)
    for esperado in ("Informe de la consulta simulada", "78 / 100", "Calificación del docente", "42 / 50",
                     "Mujer de 45 años", "Pancreatitis aguda biliar", "Revisa el examen", "Me duele"):
        assert esperado in texto


def test_acceso_dueno_docente_compartido_y_ajeno(app, monkeypatch):
    dueno, docente, amigo, ajeno = (uuid.uuid4() for _ in range(4))
    consulta = SimpleNamespace(id=uuid.uuid4(), student_id=dueno, course_id=uuid.uuid4())

    class CursoFalso:
        @staticmethod
        def get(_):
            return SimpleNamespace(teacher_id=docente)

    class Compartidos:
        def filter_by(self, **kw):
            return SimpleNamespace(first=lambda: object() if kw.get("user_id") == amigo else None)

    with app.app_context():
        monkeypatch.setattr(informes_routes.Course, "query", CursoFalso)
        monkeypatch.setattr(informes_routes.ConsultationShare, "query", Compartidos())
        assert informes_routes._acceso(SimpleNamespace(id=dueno, role="STUDENT"), consulta) == "DUENO"
        assert informes_routes._acceso(SimpleNamespace(id=docente, role="TEACHER"), consulta) == "DOCENTE"
        assert informes_routes._acceso(SimpleNamespace(id=amigo, role="STUDENT"), consulta) == "COMPARTIDO"
        assert informes_routes._acceso(SimpleNamespace(id=ajeno, role="STUDENT"), consulta) is None
        assert informes_routes._acceso(SimpleNamespace(id=ajeno, role="TEACHER"), consulta) is None
