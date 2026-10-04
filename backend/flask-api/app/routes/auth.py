import re
import secrets
from datetime import datetime, timedelta, timezone

import requests
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
)
from werkzeug.security import check_password_hash, generate_password_hash

from app import db, limiter
from app.mailer import MailNotConfiguredError, send_password_reset_email, send_verification_email
from app.models import Student, Teacher, User
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResendCodeRequest,
    ResetPasswordRequest,
    UpdateAvatarRequest,
    VerifyEmailRequest,
    validate_body,
)

auth_bp = Blueprint("auth", __name__)

VERIFICATION_CODE_TTL_MINUTES = 10
MAX_VERIFICATION_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 30


def _build_username(email: str) -> str:
    base = re.sub(r"[^a-z0-9]", "", email.split("@")[0].lower()) or "usuario"
    username = base
    suffix = 1
    while User.query.filter_by(username=username).first() is not None:
        suffix += 1
        username = f"{base}{suffix}"
    return username


def _issue_tokens(user: User):
    identity = str(user.id)
    return {
        "access_token": create_access_token(identity=identity, additional_claims={"role": user.role}),
        "refresh_token": create_refresh_token(identity=identity),
    }


def _issue_code(user: User) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    user.verification_code = code
    user.verification_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_TTL_MINUTES)
    user.verification_attempts = 0
    db.session.commit()
    return code


def _generate_and_send_code(user: User):
    code = _issue_code(user)
    send_verification_email(user.email, user.first_name, code)


def _seconds_since_last_code(user: User) -> float | None:
    if not user.verification_code_expires_at:
        return None
    expires_at = user.verification_code_expires_at.replace(tzinfo=timezone.utc)
    seconds_left = (expires_at - datetime.now(timezone.utc)).total_seconds()
    return VERIFICATION_CODE_TTL_MINUTES * 60 - seconds_left


@auth_bp.post("/register")
@limiter.limit("5 per hour")
@validate_body(RegisterRequest)
def register(validated_body: RegisterRequest):
    email = validated_body.email.strip().lower()
    role = validated_body.role
    password = validated_body.password
    student_code = validated_body.student_code

    if role == "STUDENT":
        if not student_code or not student_code.strip():
            return jsonify({
                "error": "Bad Request",
                "message": "student_code es requerido para el rol STUDENT",
                "status_code": 400
            }), 400
        student_code = student_code.strip()
        if not student_code.upper().startswith("U00"):
            return jsonify({
                "error": "Bad Request",
                "message": 'El código de estudiante debe empezar con "U00"',
                "status_code": 400
            }), 400

    if User.query.filter_by(email=email).first() is not None:
        return jsonify({
            "error": "Conflict",
            "message": "Ya existe una cuenta con ese correo",
            "status_code": 409
        }), 409

    user = User(
        username=_build_username(email),
        first_name=validated_body.first_name.strip(),
        last_name=validated_body.last_name.strip(),
        email=email,
        password_hash=generate_password_hash(password),
        role=role,
    )
    db.session.add(user)
    db.session.flush()

    if role == "STUDENT":
        db.session.add(Student(
            user_id=user.id,
            student_code=student_code,
        ))
    else:
        db.session.add(Teacher(
            user_id=user.id,
        ))

    db.session.commit()
    _generate_and_send_code(user)

    return jsonify({
        "message": "Usuario creado. Se envió un código de verificación al correo.",
        "user_id": str(user.id),
        "email": user.email,
        "username": user.username,
        "user": user.to_dict(),
        **_issue_tokens(user),
    }), 201


@auth_bp.post("/verify-email")
@jwt_required()
@validate_body(VerifyEmailRequest)
def verify_email(validated_body: VerifyEmailRequest):
    user = User.query.get(get_jwt_identity())
    if user is None:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404
    if user.email_verified:
        return jsonify({"message": "Correo ya verificado", "user": user.to_dict()}), 200

    code = validated_body.code.strip()

    if user.verification_attempts >= MAX_VERIFICATION_ATTEMPTS:
        return jsonify({
            "error": "Too Many Requests",
            "message": "Demasiados intentos. Solicita un código nuevo.",
            "status_code": 429
        }), 429

    if (
        not user.verification_code
        or not user.verification_code_expires_at
        or datetime.now(timezone.utc) > user.verification_code_expires_at.replace(tzinfo=timezone.utc)
    ):
        return jsonify({
            "error": "Bad Request",
            "message": "El código venció. Solicita uno nuevo.",
            "status_code": 400
        }), 400

    if not secrets.compare_digest(code, user.verification_code):
        user.verification_attempts += 1
        db.session.commit()
        restantes = MAX_VERIFICATION_ATTEMPTS - user.verification_attempts
        return jsonify({
            "error": "Bad Request",
            "message": f"Código incorrecto. Te quedan {max(restantes, 0)} intentos.",
            "status_code": 400
        }), 400

    user.email_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    user.verification_attempts = 0
    db.session.commit()

    return jsonify({
        "message": "Correo verificado exitosamente",
        "user": user.to_dict(),
        **_issue_tokens(user),
    }), 200


@auth_bp.post("/resend-code")
@jwt_required(optional=True)
@validate_body(ResendCodeRequest)
def resend_code(validated_body: ResendCodeRequest):
    identity = get_jwt_identity()
    if identity:
        user = User.query.get(identity)
    else:
        user = User.query.filter_by(email=validated_body.email.strip().lower()).first()

    if user is None:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404
    if user.email_verified:
        return jsonify({"error": "Bad Request", "message": "Este correo ya está verificado", "status_code": 400}), 400

    elapsed = _seconds_since_last_code(user)
    if elapsed is not None:
        if elapsed < RESEND_COOLDOWN_SECONDS:
            return jsonify({
                "error": "Too Many Requests",
                "message": f"Espera {int(RESEND_COOLDOWN_SECONDS - elapsed)}s antes de reenviar",
                "status_code": 429
            }), 429

    _generate_and_send_code(user)
    return jsonify({"message": "Código de verificación reenviado", "ok": True}), 200


@auth_bp.post("/avatar")
@jwt_required()
@validate_body(UpdateAvatarRequest)
def guardar_avatar(validated_body: UpdateAvatarRequest):
    user = User.query.get(get_jwt_identity())
    if user is None:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404

    svg = validated_body.avatar_svg.strip()
    if not (svg.startswith("<svg") or svg.startswith("data:image/svg+xml") or svg.startswith("http")):
        return jsonify({"error": "Bad Request", "message": "avatar_svg debe ser un SVG o URL válida", "status_code": 400}), 400
    if len(svg) > 100_000:
        return jsonify({"error": "Payload Too Large", "message": "El avatar es demasiado pesado", "status_code": 413}), 413

    user.avatar_svg = svg
    db.session.commit()
    return jsonify({"message": "Avatar actualizado exitosamente", "user": user.to_dict()}), 200


@auth_bp.post("/login")
@limiter.limit("10 per minute")
@validate_body(LoginRequest)
def login(validated_body: LoginRequest):
    email = validated_body.email.strip().lower()
    password = validated_body.password

    user = User.query.filter_by(email=email).first()
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Unauthorized", "message": "Credenciales inválidas", "status_code": 401}), 401

    if not user.email_verified:
        elapsed = _seconds_since_last_code(user)
        if elapsed is None or elapsed >= RESEND_COOLDOWN_SECONDS:
            _generate_and_send_code(user)
        return jsonify({
            "error": "Forbidden",
            "message": "Correo no verificado. Se ha enviado un nuevo código a tu correo.",
            "status_code": 403,
            "user": user.to_dict(),
            **_issue_tokens(user),
        }), 403

    return jsonify({"user": user.to_dict(), **_issue_tokens(user)}), 200


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    identity = get_jwt_identity()
    user = User.query.get(identity)
    if user is None:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404

    return jsonify({
        "access_token": create_access_token(identity=identity, additional_claims={"role": user.role}),
    }), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    user = User.query.get(get_jwt_identity())
    if user is None:
        return jsonify({"error": "Not Found", "message": "Usuario no encontrado", "status_code": 404}), 404
    return jsonify(user.to_dict()), 200


@auth_bp.post("/change-password")
@jwt_required()
@validate_body(ChangePasswordRequest)
def change_password(validated_body: ChangePasswordRequest):
    current_password = validated_body.current_password
    new_password = validated_body.new_password

    user = User.query.get(get_jwt_identity())
    if user is None or not check_password_hash(user.password_hash, current_password):
        return jsonify({"error": "Unauthorized", "message": "Contraseña actual incorrecta", "status_code": 401}), 401

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()

    return jsonify({"message": "Contraseña actualizada con éxito"}), 200



@auth_bp.post("/forgot-password")
@limiter.limit("5 per hour")
@validate_body(ForgotPasswordRequest)
def forgot_password(validated_body: ForgotPasswordRequest):
    """Envía un código de 6 dígitos para cambiar la contraseña.

    Respuesta SIEMPRE igual (exista o no el correo) para no permitir averiguar
    qué correos tienen cuenta. Solo se envía correo a cuentas verificadas, y
    con el mismo periodo de enfriamiento que el reenvío de verificación."""
    generic = jsonify({
        "message": "Si el correo está registrado, te enviamos un código para cambiar la contraseña.",
        "ok": True,
    }), 200

    email = validated_body.email.strip().lower()
    user = User.query.filter_by(email=email).first()
    if user is None or not user.email_verified:
        return generic

    elapsed = _seconds_since_last_code(user)
    if elapsed is not None and elapsed < RESEND_COOLDOWN_SECONDS:
        return generic

    code = _issue_code(user)
    try:
        send_password_reset_email(user.email, user.first_name, code)
    except (MailNotConfiguredError, requests.RequestException):
        current_app.logger.exception("No se pudo enviar el correo de recuperación")
        return jsonify({
            "error": "Service Unavailable",
            "message": "No pudimos enviar el correo en este momento. Intenta de nuevo en unos minutos.",
            "status_code": 503,
        }), 503

    return generic


@auth_bp.post("/reset-password")
@limiter.limit("10 per minute")
@validate_body(ResetPasswordRequest)
def reset_password(validated_body: ResetPasswordRequest):
    email = validated_body.email.strip().lower()
    code = validated_body.code.strip()

    user = User.query.filter_by(email=email).first()
    codigo_invalido = jsonify({
        "error": "Bad Request",
        "message": "Código inválido o vencido. Solicita uno nuevo.",
        "status_code": 400,
    }), 400

    if user is None or not user.email_verified or not user.verification_code:
        return codigo_invalido

    if user.verification_attempts >= MAX_VERIFICATION_ATTEMPTS:
        return jsonify({
            "error": "Too Many Requests",
            "message": "Demasiados intentos. Solicita un código nuevo.",
            "status_code": 429,
        }), 429

    if (
        not user.verification_code_expires_at
        or datetime.now(timezone.utc) > user.verification_code_expires_at.replace(tzinfo=timezone.utc)
    ):
        return codigo_invalido

    if not secrets.compare_digest(code, user.verification_code):
        user.verification_attempts += 1
        db.session.commit()
        return codigo_invalido

    user.password_hash = generate_password_hash(validated_body.new_password)
    user.verification_code = None
    user.verification_code_expires_at = None
    user.verification_attempts = 0
    db.session.commit()

    return jsonify({"message": "Contraseña actualizada. Ya puedes iniciar sesión.", "ok": True}), 200
