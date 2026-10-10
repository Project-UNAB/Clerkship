"""Código de matrícula de un curso: se genera con un generador criptográfico
(no adivinable ni secuencial) y se compara en tiempo constante."""
import hmac
import secrets

# Sin 0/O ni 1/I/L: el docente lo dicta o lo escribe en el tablero.
ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
LARGO_CODIGO = 8


def generar_codigo() -> str:
    return "".join(secrets.choice(ALFABETO_CODIGO) for _ in range(LARGO_CODIGO))


def normalizar_codigo(valor) -> str:
    """Lo que escribe el estudiante: sin espacios ni guiones, en mayúsculas."""
    if not isinstance(valor, str):
        return ""
    return "".join(ch for ch in valor.upper() if ch.isalnum())


def codigo_coincide(esperado, recibido) -> bool:
    esperado = normalizar_codigo(esperado)
    recibido = normalizar_codigo(recibido)
    if not esperado or not recibido:
        return False
    return hmac.compare_digest(esperado.encode("utf-8"), recibido.encode("utf-8"))
