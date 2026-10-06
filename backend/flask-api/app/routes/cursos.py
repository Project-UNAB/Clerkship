from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models import Consultation, Course, Student, StudentCourse, User
from app.schemas import AgregarEstudianteRequest, CourseResponse, CreateCourseRequest, EnrollmentResponse, validate_body
from app.utils import get_current_user, role_required

cursos_bp = Blueprint("cursos", __name__)


@cursos_bp.get("")
@jwt_required()
def listar():
    courses = Course.query.order_by(Course.created_at.desc()).all()
    return jsonify([c.to_dict() for c in courses]), 200


@cursos_bp.get("/mios")
@jwt_required()
def listar_mios():
    user = get_current_user()

    if user.role == "TEACHER":
        courses = Course.query.filter_by(teacher_id=user.id).all()
        return jsonify([c.to_dict() for c in courses]), 200

    courses = (
        Course.query.join(StudentCourse, StudentCourse.course_id == Course.id)
        .filter(StudentCourse.student_id == user.id)
        .all()
    )
    resultado = []
    for c in courses:
        d = c.to_dict()
        docente = User.query.get(c.teacher_id) if c.teacher_id else None
        d["teacher_name"] = f"{docente.first_name} {docente.last_name}" if docente else None
        resultado.append(d)
    return jsonify(resultado), 200


@cursos_bp.post("")
@role_required("TEACHER")
@validate_body(CreateCourseRequest)
def crear(validated_body: CreateCourseRequest):
    user = get_current_user()

    course = Course(
        teacher_id=user.id,
        name=validated_body.name.strip(),
        description=validated_body.description,
        academic_period=validated_body.academic_period,
    )
    db.session.add(course)
    db.session.commit()

    return jsonify(course.to_dict()), 201


@cursos_bp.get("/<course_id>")
@jwt_required()
def obtener(course_id):
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({
            "error": "Not Found",
            "message": "Curso no encontrado",
            "status_code": 404
        }), 404
    return jsonify(course.to_dict()), 200


@cursos_bp.post("/<course_id>/matricular")
@role_required("STUDENT")
def matricular(course_id):
    user = get_current_user()

    if Course.query.get(course_id) is None:
        return jsonify({
            "error": "Not Found",
            "message": "Curso no encontrado",
            "status_code": 404
        }), 404

    if StudentCourse.query.filter_by(student_id=user.id, course_id=course_id).first() is not None:
        return jsonify({
            "error": "Conflict",
            "message": "Ya estás matriculado en este curso",
            "status_code": 409
        }), 409

    db.session.add(StudentCourse(student_id=user.id, course_id=course_id))
    db.session.commit()

    return jsonify({
        "message": "Matrícula registrada exitosamente",
        "course_id": str(course_id),
        "student_id": str(user.id),
    }), 201


@cursos_bp.get("/<course_id>/estudiantes")
@role_required("TEACHER")
def listar_estudiantes(course_id):
    """Roster del curso: solo lo ve el docente dueño del curso."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    matriculas = (
        db.session.query(StudentCourse, Student, User)
        .join(Student, Student.user_id == StudentCourse.student_id)
        .join(User, User.id == Student.user_id)
        .filter(StudentCourse.course_id == course_id)
        .order_by(StudentCourse.enrolled_at.desc())
        .all()
    )

    resultado = []
    for matricula, student, estudiante in matriculas:
        completados = Consultation.query.filter_by(student_id=estudiante.id, course_id=course_id, status="COMPLETED").count()
        en_progreso = Consultation.query.filter_by(student_id=estudiante.id, course_id=course_id, status="IN_PROGRESS").count()
        resultado.append({
            "user_id": str(estudiante.id),
            "nombre": f"{estudiante.first_name} {estudiante.last_name}",
            "email": estudiante.email,
            "student_code": student.student_code,
            "enrolled_at": matricula.enrolled_at.isoformat() if matricula.enrolled_at else None,
            "casos_completados": completados,
            "casos_en_progreso": en_progreso,
        })

    return jsonify({"estudiantes": resultado}), 200


@cursos_bp.post("/<course_id>/estudiantes")
@role_required("TEACHER")
@validate_body(AgregarEstudianteRequest)
def agregar_estudiante(course_id, validated_body: AgregarEstudianteRequest):
    """El docente agrega a un estudiante existente a su curso, por correo.
    No crea la cuenta: el estudiante tiene que haberse registrado antes."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    email = validated_body.email.strip().lower()
    estudiante = User.query.filter_by(email=email, role="STUDENT").first()
    if estudiante is None:
        return jsonify({
            "error": "Not Found",
            "message": "No hay ninguna cuenta de estudiante con ese correo. Pídele que se registre primero.",
            "status_code": 404,
        }), 404

    if StudentCourse.query.filter_by(student_id=estudiante.id, course_id=course_id).first() is not None:
        return jsonify({"error": "Conflict", "message": "Ese estudiante ya está matriculado en este curso.", "status_code": 409}), 409

    db.session.add(StudentCourse(student_id=estudiante.id, course_id=course_id))
    db.session.commit()

    student = Student.query.get(estudiante.id)
    return jsonify({
        "user_id": str(estudiante.id),
        "nombre": f"{estudiante.first_name} {estudiante.last_name}",
        "email": estudiante.email,
        "student_code": student.student_code if student else None,
        "casos_completados": 0,
        "casos_en_progreso": 0,
    }), 201


@cursos_bp.delete("/<course_id>/estudiantes/<student_id>")
@role_required("TEACHER")
def quitar_estudiante(course_id, student_id):
    """El docente quita a un estudiante de su curso (no borra su cuenta, ni
    las sesiones que ya haya hecho ahí — solo la matrícula)."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    matricula = StudentCourse.query.filter_by(student_id=student_id, course_id=course_id).first()
    if matricula is None:
        return jsonify({"error": "Not Found", "message": "Ese estudiante no está matriculado en este curso", "status_code": 404}), 404

    db.session.delete(matricula)
    db.session.commit()
    return jsonify({"ok": True}), 200


@cursos_bp.delete("/<course_id>")
@role_required("TEACHER")
def borrar_curso(course_id):
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    try:
        db.session.delete(course)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({
            "error": "Conflict",
            "message": "No se puede borrar: ya hay sesiones de simulación creadas en este curso.",
            "status_code": 409,
        }), 409

    return jsonify({"ok": True}), 200


@cursos_bp.delete("/<course_id>/matricular")
@role_required("STUDENT")
def desmatricular(course_id):
    user = get_current_user()

    enrollment = StudentCourse.query.filter_by(student_id=user.id, course_id=course_id).first()
    if enrollment is None:
        return jsonify({
            "error": "Not Found",
            "message": "No estás matriculado en este curso",
            "status_code": 404
        }), 404

    db.session.delete(enrollment)
    db.session.commit()

    return jsonify({"message": "Matrícula eliminada exitosamente"}), 200

