"""
Identidad administrativa del paciente — nombre, edad, sexo, documento,
telefono, tipo de sangre, peso. Generada de forma determinista (sin llamar al
modelo, instantanea) para poder mostrarsela al estudiante en el momento en
que arranca la generacion del caso, mientras el Agente Generador (que tarda
mucho mas, llama a Gemini) arma el resto de la historia clinica.

No es informacion diagnostica -- por eso se puede mostrar de entrada, a
diferencia del motivo de consulta, los antecedentes o el diagnostico, que
siguen ocultos hasta que el estudiante los indaga (ver guardrails.py).

Esta MISMA identidad se le pasa despues al Agente Generador como restriccion
(prompts.py) para que el caso completo sea sobre esta persona exacta, no
sobre una inventada aparte -- lo que el estudiante ve desde el inicio es el
mismo paciente que termina en la consulta.
"""

import random
from urllib.parse import urlencode

NOMBRES_F = [
    "Maria Fernanda Ortiz", "Luz Marina Rueda", "Diana Carolina Pardo", "Gloria Esperanza Suarez",
    "Andrea Milena Castro", "Sandra Patricia Gomez", "Claudia Ines Velasquez", "Martha Lucia Nino",
    "Paola Andrea Rojas", "Yolanda Beatriz Camacho", "Adriana Sofia Torres", "Carolina Isabel Duran",
]
NOMBRES_M = [
    "Jorge Enrique Diaz", "Carlos Andres Mejia", "Luis Alberto Rincon", "Jhon Fredy Barrera",
    "Hernando Villamizar", "Oscar Ivan Gonzalez", "Ricardo Antonio Pena", "Jaime Alfonso Cardenas",
    "Wilson Eduardo Moreno", "Fabian Camilo Vargas", "Nelson Javier Sanabria", "Gustavo Adolfo Ramos",
]

TIPOS_SANGRE = ["O+", "A+", "B+", "O-", "AB+", "A-", "B-", "AB-"]
_PESOS_TIPO_SANGRE = [38, 34, 9, 7, 3, 6, 2, 1]  # distribucion real aproximada, no uniforme

OCUPACIONES_F = [
    "Docente universitaria", "Ingeniera de sistemas", "Contadora pública", "Comerciante independiente",
    "Abogada", "Enfermera", "Administradora de empresas", "Diseñadora gráfica",
    "Arquitecta", "Secretaria ejecutiva", "Auxiliar contable", "Bióloga",
]
OCUPACIONES_M = [
    "Docente universitario", "Ingeniero civil", "Contador público", "Comerciante independiente",
    "Abogado", "Enfermero", "Administrador de empresas", "Diseñador gráfico",
    "Arquitecto", "Conductor", "Auxiliar logístico", "Electricista",
]

# Avatar humano (DiceBear 9.x, estilo "avataaars" — mismo que ya usa la app
# para usuarios reales, ver frontend/src/components/auth/AvatarPickerStep.tsx)
# que coincida con el sexo del paciente. Nombres de variante verificados
# contra el esquema real de DiceBear (@dicebear/styles/avataaars), no
# inventados: cada "top" (peinado) de esa lista existe tal cual en la API.
# Se excluyen a proposito hat/turban/hijab/winterHat* -- son prendas
# culturales o de clima, no deberian asignarse por una suposicion de sexo.
_DICEBEAR_BASE = "https://api.dicebear.com/9.x/avataaars/svg"
_TOPS_F = [
    "bigHair", "bob", "bun", "curly", "curvy", "frida", "frizzle",
    "longButNotTooLong", "miaWallace", "straight01", "straight02", "straightAndStrand",
]
_TOPS_M = [
    "dreads", "dreads01", "dreads02", "fro", "froBand", "shaggy", "shaggyMullet",
    "shavedSides", "shortCurly", "shortFlat", "shortRound", "shortWaved", "sides",
    "theCaesar", "theCaesarAndSidePart",
]
_BG_COLORS = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "c9f2c7"]


def avatar_url_por_defecto(seed: str, sexo: str) -> str:
    """Arma la URL del avatar — DiceBear resuelve el peinado final de forma
    determinista a partir del seed (misma seed = mismo avatar siempre), solo
    restringido a la lista de peinados del sexo correspondiente."""
    params = [("seed", seed)]
    for top in (_TOPS_F if sexo == "F" else _TOPS_M):
        params.append(("top[]", top))
    params.append(("facialHairProbability", "0" if sexo == "F" else "35"))
    params.append(("backgroundColor", random.choice(_BG_COLORS)))
    return f"{_DICEBEAR_BASE}?{urlencode(params)}"


def peso_por_defecto(edad: int, sexo: str) -> float:
    """Formula compartida para un peso corporal plausible cuando falta o es
    invalido -- misma que ya usaba agentes.py para el caso generado por IA."""
    base = 60 if sexo == "F" else 70
    return round(base + max(0, min(edad, 60) - 20) * 0.15, 1)


def generar_identidad() -> dict:
    sexo = random.choice(["M", "F"])
    nombre = random.choice(NOMBRES_F if sexo == "F" else NOMBRES_M)
    edad = random.randint(18, 78)
    documento = f"CC {random.randint(10_000_000, 1_199_999_999)}"
    telefono = f"3{random.randint(0, 2)}{random.randint(0, 9)} {random.randint(100, 999)} {random.randint(1000, 9999)}"
    tipo_sangre = random.choices(TIPOS_SANGRE, weights=_PESOS_TIPO_SANGRE, k=1)[0]
    ocupacion = random.choice(OCUPACIONES_F if sexo == "F" else OCUPACIONES_M)
    return {
        "nombre": nombre,
        "edad": edad,
        "sexo": sexo,
        "ocupacion": ocupacion,
        "documento": documento,
        "telefono": telefono,
        "tipo_sangre": tipo_sangre,
        "peso_kg": peso_por_defecto(edad, sexo),
        "avatar_url": avatar_url_por_defecto(documento, sexo),
    }
