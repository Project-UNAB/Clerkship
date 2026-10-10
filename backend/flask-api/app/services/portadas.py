"""Imagen de portada de un curso: se valida lo que sube el docente y se
guarda siempre una versión propia, nunca el archivo original.

Lo que llega se decodifica con Pillow y se vuelve a codificar a un tamaño
fijo (portada y miniatura). Así no sobrevive nada que viniera escondido en el
archivo — metadatos EXIF con ubicación, datos pegados al final, un formato
distinto al declarado — y todas las cards pesan y miden lo mismo.
"""
import io
import uuid
import warnings

from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError

from app.services.archivos import ArchivoInvalido, validar_archivo

# Proporción 2:1, la de la card del curso.
PORTADA_TAMANO = (1200, 600)
MINIATURA_TAMANO = (400, 200)
FORMATO_SALIDA = "WEBP"
MIME_SALIDA = "image/webp"

EXTENSIONES_PORTADA = ("jpg", "jpeg", "png", "webp")
_FORMATOS_PILLOW = {"JPEG", "PNG", "WEBP"}

# Más chica que la miniatura no sirve; más grande que esto no es una foto
# normal y solo gasta memoria al decodificar (una imagen de 2 MB puede
# declarar decenas de miles de píxeles por lado).
ANCHO_MINIMO, ALTO_MINIMO = 400, 200
LADO_MAXIMO = 8000
PIXELES_MAXIMOS = 40_000_000


class PortadaInvalida(ValueError):
    """La imagen no sirve como portada. `status_code` y `codigo` van a la respuesta."""

    def __init__(self, mensaje: str, codigo: str, status_code: int = 415):
        super().__init__(mensaje)
        self.codigo = codigo
        self.status_code = status_code


def tamano_maximo_bytes() -> int:
    return int(current_app.config.get("COURSE_COVER_MAX_MB", 2)) * 1024 * 1024


def claves_nuevas() -> tuple:
    """(clave de la portada, clave de la miniatura) con nombre aleatorio."""
    clave = f"portadas/{uuid.uuid4().hex}.webp"
    return clave, clave_miniatura(clave)


def clave_miniatura(clave_portada: str) -> str:
    """La miniatura vive junto a su portada: mismo nombre con sufijo _thumb."""
    base, punto, extension = clave_portada.rpartition(".")
    return f"{base}_thumb{punto}{extension}" if punto else f"{clave_portada}_thumb"


def _foco(valor, por_defecto=0.5) -> float:
    """Punto de encuadre entre 0 y 1 (0.5 = centro). Lo que no sea un número se ignora."""
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return por_defecto
    if numero != numero:  # NaN
        return por_defecto
    return min(1.0, max(0.0, numero))


def _codificar(imagen, tamano, foco) -> bytes:
    recortada = ImageOps.fit(imagen, tamano, method=Image.Resampling.LANCZOS, centering=foco)
    salida = io.BytesIO()
    recortada.save(salida, format=FORMATO_SALIDA, quality=82, method=4)
    return salida.getvalue()


def procesar_portada(nombre: str, contenido: bytes, foco_x=None, foco_y=None) -> tuple:
    """(portada, miniatura) en bytes, ya recortadas a 2:1 y recomprimidas.
    Lanza PortadaInvalida si el archivo no es una imagen JPG/PNG/WebP real,
    pesa de más o tiene dimensiones fuera de rango.

    `foco_x` / `foco_y` (0 a 1) dicen qué parte de la imagen queda dentro del
    recorte cuando la proporción original no es 2:1; por defecto, el centro."""
    maximo = tamano_maximo_bytes()
    if len(contenido) > maximo:
        raise PortadaInvalida(
            f"La imagen pesa demasiado: el máximo es {maximo // (1024 * 1024)} MB.", "COVER_TOO_LARGE", 413,
        )

    # 1. Extensión y magic bytes, con las mismas reglas del resto de archivos.
    try:
        validar_archivo(nombre, contenido, permitidas=EXTENSIONES_PORTADA)
    except ArchivoInvalido as err:
        if err.codigo in ("EXTENSION_NOT_ALLOWED", "DANGEROUS_EXTENSION"):
            raise PortadaInvalida("La portada tiene que ser una imagen JPG, PNG o WebP.", "COVER_FORMAT") from err
        raise PortadaInvalida(
            "El archivo no es una imagen real: su contenido no corresponde a un JPG, PNG o WebP.", "COVER_NOT_AN_IMAGE",
        ) from err

    # 2. Que Pillow de verdad la pueda leer, y que sea de un formato aceptado.
    #    Las dimensiones se miran ANTES de decodificar los píxeles.
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            imagen = Image.open(io.BytesIO(contenido))
            formato = imagen.format
            ancho, alto = imagen.size
    except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning, OSError, ValueError) as err:
        raise PortadaInvalida(
            "El archivo no es una imagen real: su contenido no corresponde a un JPG, PNG o WebP.", "COVER_NOT_AN_IMAGE",
        ) from err
    if formato not in _FORMATOS_PILLOW:
        raise PortadaInvalida("La portada tiene que ser una imagen JPG, PNG o WebP.", "COVER_FORMAT")

    if ancho < ANCHO_MINIMO or alto < ALTO_MINIMO:
        raise PortadaInvalida(
            f"La imagen es muy pequeña ({ancho}×{alto}). Mínimo {ANCHO_MINIMO}×{ALTO_MINIMO} píxeles.", "COVER_TOO_SMALL", 400,
        )
    if ancho > LADO_MAXIMO or alto > LADO_MAXIMO or ancho * alto > PIXELES_MAXIMOS:
        raise PortadaInvalida(
            f"La imagen es demasiado grande ({ancho}×{alto}). Máximo {LADO_MAXIMO} píxeles por lado.", "COVER_DIMENSIONS", 400,
        )

    # 3. Decodificar y volver a codificar. Si el archivo está truncado o
    #    corrupto, falla acá.
    try:
        imagen.seek(0)  # una imagen animada se queda con su primer cuadro
        imagen = ImageOps.exif_transpose(imagen)  # respeta la rotación de la cámara
        if imagen.mode in ("RGBA", "LA", "P"):
            # Las transparencias se aplanan sobre blanco.
            con_alfa = imagen.convert("RGBA")
            fondo = Image.new("RGB", con_alfa.size, (255, 255, 255))
            fondo.paste(con_alfa, mask=con_alfa.split()[-1])
            imagen = fondo
        else:
            imagen = imagen.convert("RGB")
        foco = (_foco(foco_x), _foco(foco_y))
        return _codificar(imagen, PORTADA_TAMANO, foco), _codificar(imagen, MINIATURA_TAMANO, foco)
    except PortadaInvalida:
        raise
    except Exception as err:  # noqa: BLE001 — cualquier fallo al decodificar es un archivo inválido
        raise PortadaInvalida(
            "No se pudo leer la imagen: el archivo está dañado o incompleto.", "COVER_NOT_AN_IMAGE",
        ) from err
