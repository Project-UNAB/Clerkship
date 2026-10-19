"""Carga fichas de referencia clínica para el generador de casos (RAG).

El generador de casos lee hasta 3 fichas de `referencias_clinicas` por subtema
(ver app/services/simulador/rag.py). Este script carga esas fichas desde una
carpeta: un archivo .md o .txt por ficha, con la primera línea

    subtema: <nombre>

y el resto del archivo como contenido. El subtema debe coincidir con SUBTEMAS
de app/services/simulador/catalogo.py (se compara sin mayúsculas ni tildes); si
no coincide, el archivo se rechaza.

Uso (desde backend/flask-api):

    python scripts/cargar_referencias.py <carpeta>            # solo muestra el plan
    python scripts/cargar_referencias.py <carpeta> --aplicar  # inserta las fichas nuevas

Por defecto NO escribe nada. Con --aplicar inserta solo las fichas cuyo par
(subtema, contenido) no exista ya: nunca modifica ni borra filas. Antes de
escribir consulta information_schema para usar el esquema REAL de la tabla y
aborta si encuentra una columna obligatoria que no sabría cómo llenar.

Ejemplo de formato (contenido de relleno, NO clínico): scripts/referencias_ejemplo/.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

RAIZ_PROYECTO = Path(__file__).resolve().parents[1]
if str(RAIZ_PROYECTO) not in sys.path:
    sys.path.insert(0, str(RAIZ_PROYECTO))

from app.services.simulador.catalogo import normalizar_subtema  # noqa: E402

TABLA = "referencias_clinicas"
COLUMNAS_FICHA = ("subtema", "contenido")
EXTENSIONES = (".md", ".txt")
ENCABEZADO = re.compile(r"^subtema\s*:\s*(.+)$", re.IGNORECASE)
URL_EN_MENSAJE = re.compile(r"\w+(?:\+\w+)?://\S+")


@dataclass(frozen=True)
class Ficha:
    """Una ficha lista para insertarse: subtema canónico y contenido."""

    ruta: Path
    subtema: str
    contenido: str

    @property
    def clave(self) -> tuple[str, str]:
        return (self.subtema, self.contenido)


class ErrorFichas(ValueError):
    """Una o más fichas no se pueden usar. Agrupa todos los problemas."""

    def __init__(self, errores: list[str]):
        self.errores = list(errores)
        super().__init__("\n".join(self.errores))


@dataclass(frozen=True)
class Plan:
    """Qué haría la carga: nuevas, ya existentes y repetidas dentro del lote."""

    nuevas: list[Ficha]
    ya_existen: list[Ficha]
    repetidas_en_lote: list[Ficha]


def leer_ficha(ruta: Path) -> Ficha:
    """Lee y valida una ficha. Lanza ErrorFichas si no cumple el formato."""
    nombre = ruta.name
    try:
        texto = ruta.read_text(encoding="utf-8-sig")
    except OSError as exc:
        raise ErrorFichas([f"{nombre}: no se pudo leer ({exc.strerror or exc})."]) from exc

    lineas = texto.splitlines()
    if not lineas:
        raise ErrorFichas([f"{nombre}: el archivo está vacío."])

    coincidencia = ENCABEZADO.match(lineas[0].strip())
    if not coincidencia:
        raise ErrorFichas(
            [f'{nombre}: la primera línea debe ser "subtema: <nombre>" (se encontró: "{lineas[0].strip()[:80]}").']
        )

    declarado = coincidencia.group(1).strip()
    subtema = normalizar_subtema(declarado)
    if not subtema:
        raise ErrorFichas(
            [f'{nombre}: el subtema "{declarado}" no coincide con ningún SUBTEMAS de '
             "app/services/simulador/catalogo.py."]
        )

    contenido = "\n".join(lineas[1:]).strip()
    if not contenido:
        raise ErrorFichas([f"{nombre}: no tiene contenido debajo del encabezado \"subtema:\"."])

    return Ficha(ruta=ruta, subtema=subtema, contenido=contenido)


def es_plantilla(ficha: Ficha) -> bool:
    """La ficha de referencias_ejemplo/ (o una copia sin completar) lleva esta marca."""
    return "no validado clínicamente" in ficha.contenido.lower()


def leer_fichas(carpeta: Path) -> list[Ficha]:
    """Fichas .md/.txt de la carpeta (sin subcarpetas), todas válidas o error."""
    carpeta = Path(carpeta)
    if not carpeta.is_dir():
        raise ErrorFichas([f"La carpeta {carpeta} no existe o no es un directorio."])

    archivos = sorted(
        ruta for ruta in carpeta.iterdir() if ruta.is_file() and ruta.suffix.lower() in EXTENSIONES
    )
    if not archivos:
        raise ErrorFichas([f"No hay archivos .md ni .txt en {carpeta}."])

    fichas: list[Ficha] = []
    errores: list[str] = []
    for ruta in archivos:
        try:
            fichas.append(leer_ficha(ruta))
        except ErrorFichas as exc:
            errores.extend(exc.errores)

    if errores:
        raise ErrorFichas(errores)
    return fichas


def planificar(fichas: list[Ficha], existentes: set[tuple[str, str]]) -> Plan:
    """Separa las fichas nuevas de las que ya están en la base o se repiten."""
    vistas: set[tuple[str, str]] = set()
    nuevas: list[Ficha] = []
    ya_existen: list[Ficha] = []
    repetidas: list[Ficha] = []

    for ficha in fichas:
        if ficha.clave in existentes:
            ya_existen.append(ficha)
        elif ficha.clave in vistas:
            repetidas.append(ficha)
        else:
            vistas.add(ficha.clave)
            nuevas.append(ficha)

    return Plan(nuevas=nuevas, ya_existen=ya_existen, repetidas_en_lote=repetidas)


def _motor():
    """Motor SQLAlchemy de la aplicación (DATABASE_URL)."""
    from sqlalchemy import create_engine

    from app.config import Config

    url = Config.SQLALCHEMY_DATABASE_URI
    if not url:
        raise RuntimeError("DATABASE_URL no está configurada; no hay base de datos a la cual escribir.")
    return create_engine(url, pool_pre_ping=True)


def leer_esquema(conexion) -> dict:
    """Columnas REALES de la tabla, consultadas en information_schema."""
    dialecto = conexion.dialect.name
    if dialecto != "postgresql":
        raise RuntimeError(
            f"Este script espera PostgreSQL (la tabla vive ahí); la conexión es {dialecto}."
        )

    filas = conexion.execute(
        _text(
            "SELECT column_name, data_type, character_maximum_length, is_nullable, "
            "column_default, is_identity, is_generated "
            "FROM information_schema.columns "
            "WHERE table_name = :tabla AND table_schema = current_schema() "
            "ORDER BY ordinal_position"
        ),
        {"tabla": TABLA},
    ).mappings().all()

    if not filas:
        raise RuntimeError(
            f"La tabla {TABLA} no existe en el esquema actual; revisa la base antes de cargar fichas."
        )
    return {fila["column_name"]: dict(fila) for fila in filas}


def validar_esquema(esquema: dict) -> int | None:
    """Comprueba que la tabla se pueda llenar sin suponer columnas obligatorias.

    Devuelve el largo máximo de `subtema` según el esquema real (o None si es
    ilimitado). Lanza RuntimeError con una explicación si no es seguro escribir.
    """
    faltan = [columna for columna in COLUMNAS_FICHA if columna not in esquema]
    if faltan:
        raise RuntimeError(
            f"La tabla {TABLA} no tiene las columnas esperadas ({', '.join(faltan)}); "
            "el esquema real no coincide con lo que el RAG necesita."
        )

    obligatorias_sin_valor = [
        nombre
        for nombre, columna in esquema.items()
        if nombre not in COLUMNAS_FICHA
        and columna["is_nullable"] == "NO"
        and not columna["column_default"]
        and columna.get("is_identity") != "YES"
        and columna.get("is_generated") != "ALWAYS"
    ]
    if obligatorias_sin_valor:
        raise RuntimeError(
            "La tabla tiene columnas obligatorias sin valor por defecto que este script no "
            f"sabría llenar ({', '.join(obligatorias_sin_valor)}); no se escribe nada para "
            "no inventar datos."
        )

    return esquema["subtema"].get("character_maximum_length")


def leer_existentes(conexion) -> set[tuple[str, str]]:
    """Pares (subtema, contenido) que ya están guardados en la tabla."""
    filas = conexion.execute(
        _text(f"SELECT subtema, contenido FROM {TABLA}")  # TABLA es una constante, no entrada
    ).fetchall()
    return {(fila[0], fila[1]) for fila in filas}


def insertar(conexion, ficha: Ficha) -> None:
    conexion.execute(
        _text(
            f"INSERT INTO {TABLA} (subtema, contenido) "  # TABLA es una constante, no entrada
            "VALUES (:subtema, :contenido)"
        ),
        {"subtema": ficha.subtema, "contenido": ficha.contenido},
    )


def _text(sql: str):
    from sqlalchemy import text

    return text(sql)


def _mensaje_seguro(exc: BaseException) -> str:
    """Mensaje de error sin credenciales ni cadenas de conexión."""
    limpio = URL_EN_MENSAJE.sub("<URL oculta>", str(exc)).strip()
    return limpio or exc.__class__.__name__


def _describir_esquema(esquema: dict) -> str:
    partes = []
    for nombre, columna in esquema.items():
        tipo = columna["data_type"]
        if columna.get("character_maximum_length"):
            tipo = f"{tipo}({columna['character_maximum_length']})"
        marca = " NOT NULL" if columna["is_nullable"] == "NO" else ""
        partes.append(f"{nombre} {tipo}{marca}")
    return ", ".join(partes)


def ejecutar(fichas: list[Ficha], aplicar: bool) -> int:
    """Muestra el plan y, con `aplicar`, inserta las fichas nuevas."""
    motor = _motor()
    with motor.begin() as conexion:
        esquema = leer_esquema(conexion)
        limite_subtema = validar_esquema(esquema)
        print(f"Esquema real de {TABLA} (information_schema): {_describir_esquema(esquema)}")

        if limite_subtema:
            demasiado = [f for f in fichas if len(f.subtema) > limite_subtema]
            if demasiado:
                raise RuntimeError(
                    f"Hay subtemas de más de {limite_subtema} caracteres, el largo real de la "
                    "columna: " + ", ".join(f.ruta.name for f in demasiado)
                )

        plan = planificar(fichas, leer_existentes(conexion))

        print(f"\nFichas leídas: {len(fichas)}")
        for ficha in fichas:
            print(f"  - {ficha.ruta.name} -> {ficha.subtema} ({len(ficha.contenido)} caracteres)")

        for ficha in plan.ya_existen:
            print(f"  = ya existe, no se toca: {ficha.ruta.name}")
        for ficha in plan.repetidas_en_lote:
            print(f"  = repetida en la carpeta, se ignora: {ficha.ruta.name}")

        print(
            f"\nA insertar: {len(plan.nuevas)} · ya existentes: {len(plan.ya_existen)} · "
            f"repetidas en la carpeta: {len(plan.repetidas_en_lote)}"
        )

        if not aplicar:
            print("[simulación] No se escribió nada. Repite con --aplicar para insertar las fichas nuevas.")
            return 0

        if not plan.nuevas:
            print("Nada nuevo que insertar; la tabla queda como estaba.")
            return 0

        # Una plantilla de ejemplo nunca debe llegar al generador como referencia clínica.
        sin_validar = [f for f in plan.nuevas if es_plantilla(f)]
        if sin_validar:
            raise RuntimeError(
                "Estas fichas son plantillas de ejemplo, no validadas clínicamente, y no se cargan: "
                + ", ".join(f.ruta.name for f in sin_validar)
            )

        # Todo o nada: si un INSERT falla, la transacción deshace los anteriores.
        for ficha in plan.nuevas:
            insertar(conexion, ficha)

    # Solo se anuncia después de que la transacción se confirmó al salir del with.
    for ficha in plan.nuevas:
        print(f"  + insertada: {ficha.ruta.name} -> {ficha.subtema}")
    print(f"\nListo: {len(plan.nuevas)} fichas insertadas. No se modificó ni se borró ninguna fila.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Carga fichas de referencia clínica (.md/.txt con 'subtema: <nombre>' en la "
            "primera línea) en referencias_clinicas, sin duplicar ni borrar."
        )
    )
    parser.add_argument("carpeta", help="Carpeta con las fichas .md o .txt (no entra en subcarpetas).")
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Escribe en la base de datos. Sin esta opción solo muestra qué haría.",
    )
    args = parser.parse_args(argv)

    try:
        fichas = leer_fichas(Path(args.carpeta))
    except ErrorFichas as exc:
        print("No se cargó nada: hay fichas con problemas.", file=sys.stderr)
        for error in exc.errores:
            print(f"  - {error}", file=sys.stderr)
        return 1

    try:
        return ejecutar(fichas, args.aplicar)
    except Exception as exc:  # noqa: BLE001 — es un CLI: se informa y se sale con error
        print(f"No se pudo completar la carga: {_mensaje_seguro(exc)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
