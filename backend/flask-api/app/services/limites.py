"""Límites de peticiones (Flask-Limiter) de los endpoints que se prestan al
abuso, todos en un solo lugar para poder compararlos y ajustarlos.

Cada límite se cuenta por quien llama: por usuario cuando hay sesión (así
no pagan justos por pecadores detrás de una misma IP, como la red de una
universidad) y por IP cuando no la hay.

El contador vive en memoria por defecto: sirve con un solo proceso. Con
varios workers o instancias, RATELIMIT_STORAGE_URI=redis://... lo comparte.
"""
from flask import request
from flask_jwt_extended import get_jwt_identity
from flask_limiter.util import get_remote_address

# Adivinar contraseñas: poco margen por IP y menos aún por cuenta, para que
# repartir el ataque entre muchas IP tampoco sirva contra una cuenta.
LOGIN_POR_IP = "10 per minute; 60 per hour"
LOGIN_POR_CUENTA = "5 per minute; 20 per hour"
# Renovar el access token: lo hace el frontend solo, pero no decenas de veces por minuto.
REFRESH = "30 per minute"
# Probar códigos de matrícula.
MATRICULA = "10 per minute; 40 per hour"
# Subidas: cada una ocupa memoria, ancho de banda y espacio en R2.
SUBIDA_MATERIAL = "20 per minute; 120 per hour"
SUBIDA_PORTADA = "10 per minute; 30 per hour"
ENTREGA = "6 per minute; 30 per hour"
# Iniciar intentos de cuestionario en ráfaga.
INICIO_QUIZ = "10 per minute; 60 per hour"


def usuario_o_ip() -> str:
    """Clave del límite: el usuario del JWT ya verificado, o la IP."""
    try:
        identidad = get_jwt_identity()
    except Exception:  # noqa: BLE001 — la ruta no verificó ningún JWT
        identidad = None
    return f"user:{identidad}" if identidad else get_remote_address()


def cuenta_del_login() -> str:
    """Clave del límite por cuenta: el correo con el que se intenta entrar."""
    cuerpo = request.get_json(silent=True) or {}
    correo = str(cuerpo.get("email") or "").strip().lower()[:254]
    return f"login:{correo}" if correo else get_remote_address()


def sin_archivo_de_portada() -> bool:
    """Crear o editar un curso sin imagen no cuenta para el límite de subidas."""
    return "cover" not in request.files
