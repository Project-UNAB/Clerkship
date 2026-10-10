"""Validación de los archivos que suben docentes (material) y estudiantes
(entregas) a un curso. Nunca se confía en el nombre ni en el Content-Type que
manda el cliente: el tipo se decide mirando los primeros bytes del archivo
(magic bytes) y tiene que coincidir con la extensión declarada.

Se hace con firmas propias en vez de python-magic para no depender de la
librería nativa libmagic (no viene en Windows ni en la imagen slim de Docker).
"""
import io
import zipfile

MIME_PDF = "application/pdf"
MIME_DOC = "application/msword"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_XLS = "application/vnd.ms-excel"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MIME_PPT = "application/vnd.ms-powerpoint"
MIME_PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
MIME_ZIP = "application/zip"

# Extensión declarada -> MIME canónico. Lo que no esté acá no se acepta.
MIME_POR_EXTENSION = {
    ".pdf": MIME_PDF,
    ".doc": MIME_DOC,
    ".docx": MIME_DOCX,
    ".xls": MIME_XLS,
    ".xlsx": MIME_XLSX,
    ".ppt": MIME_PPT,
    ".pptx": MIME_PPTX,
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".zip": MIME_ZIP,
}

# Lo que se acepta cuando quien llama no pasa su propia lista (material del
# docente): todo lo verificable menos los comprimidos.
EXTENSIONES_MATERIAL = frozenset(e for e in MIME_POR_EXTENSION if e != ".zip")

# Nunca se aceptan, las pida quien las pida: ejecutables, scripts, páginas y
# formatos que pueden llevar código activo (macros, SVG con <script>...). Un
# docente no puede habilitarlas para una tarea y tampoco pueden venir dentro
# de un .zip.
EXTENSIONES_PELIGROSAS = frozenset({
    # Ejecutables e instaladores
    "exe", "msi", "msp", "com", "scr", "pif", "cpl", "dll", "sys", "drv", "elf", "so", "dylib",
    "app", "apk", "ipa", "deb", "rpm", "dmg", "pkg", "appimage", "jar", "war",
    # Scripts de consola y del sistema
    "bat", "cmd", "sh", "bash", "zsh", "ksh", "csh", "fish", "ps1", "psm1", "psd1", "vbs", "vbe",
    "wsf", "wsh", "hta", "reg", "lnk", "scf", "inf", "gadget", "msc", "url", "desktop",
    # Código que un servidor o un navegador puede ejecutar
    "js", "mjs", "cjs", "jse", "php", "php3", "php4", "php5", "phtml", "phar", "asp", "aspx",
    "jsp", "jspx", "cgi", "pl", "py", "pyc", "pyw", "rb", "swf",
    # Páginas y marcado con contenido activo
    "html", "htm", "xhtml", "shtml", "mht", "mhtml", "svg", "svgz", "xsl", "xslt",
    # Office con macros
    "docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppsm", "ppam",
})

# Topes para un .zip: lo que dice ocupar descomprimido y cuántas entradas trae.
ZIP_MAX_ENTRADAS = 2000
ZIP_MAX_DESCOMPRIMIDO_BYTES = 500 * 1024 * 1024

_FIRMA_OLE2 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_FIRMA_ZIP = b"PK\x03\x04"
# Carpeta propia de cada formato Office Open XML dentro del zip.
_CARPETA_OOXML = {MIME_DOCX: "word/", MIME_XLSX: "xl/", MIME_PPTX: "ppt/"}
_CONTROLES_PERMITIDOS_EN_TEXTO = {"\t", "\n", "\r", "\f"}


class ArchivoInvalido(ValueError):
    """El archivo no es de un tipo permitido, o su contenido no es lo que dice
    su extensión. `codigo` le dice a la interfaz cuál de las reglas falló."""

    def __init__(self, mensaje: str, codigo: str = "INVALID_FILE"):
        super().__init__(mensaje)
        self.codigo = codigo


def _extension(nombre: str) -> str:
    nombre = (nombre or "").strip().lower()
    punto = nombre.rfind(".")
    if punto <= 0:
        return ""
    return nombre[punto:]


def extension_peligrosa_en(nombre: str) -> str | None:
    """La primera extensión de la lista negra que aparezca en CUALQUIER tramo
    del nombre ("informe.pdf.exe", "shell.php.pdf"), o None."""
    base = (nombre or "").replace("\\", "/").rsplit("/", 1)[-1].strip().lower()
    for tramo in base.split(".")[1:]:
        if tramo.strip() in EXTENSIONES_PELIGROSAS:
            return tramo.strip()
    return None


def _es_zip_seguro(contenido: bytes) -> bool:
    """Un zip real, de tamaño razonable y sin nada de la lista negra adentro."""
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as zf:
            entradas = zf.infolist()
    except (zipfile.BadZipFile, ValueError, OSError):
        return False
    if len(entradas) > ZIP_MAX_ENTRADAS:
        return False
    if sum(e.file_size for e in entradas) > ZIP_MAX_DESCOMPRIMIDO_BYTES:
        return False
    return not any(extension_peligrosa_en(e.filename) for e in entradas if not e.is_dir())


def _es_ooxml(contenido: bytes, mime: str) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as zf:
            nombres = zf.namelist()
    except (zipfile.BadZipFile, ValueError, OSError):
        return False
    if "[Content_Types].xml" not in nombres:
        return False
    # Sin macros: un .docx/.xlsx/.pptx normal nunca trae vbaProject.bin.
    if any(n.lower().endswith("vbaproject.bin") for n in nombres):
        return False
    carpeta = _CARPETA_OOXML[mime]
    return any(n.startswith(carpeta) for n in nombres)


def _es_texto(contenido: bytes) -> bool:
    if b"\x00" in contenido:
        return False
    try:
        texto = contenido.decode("utf-8")
    except UnicodeDecodeError:
        try:
            texto = contenido.decode("cp1252")
        except UnicodeDecodeError:
            return False
    return not any(ord(ch) < 32 and ch not in _CONTROLES_PERMITIDOS_EN_TEXTO for ch in texto)


def _contenido_coincide(contenido: bytes, mime: str) -> bool:
    if mime == MIME_PDF:
        return contenido.startswith(b"%PDF-")
    if mime == "image/png":
        return contenido.startswith(b"\x89PNG\r\n\x1a\n")
    if mime == "image/jpeg":
        return contenido.startswith(b"\xff\xd8\xff")
    if mime == "image/gif":
        return contenido.startswith((b"GIF87a", b"GIF89a"))
    if mime == "image/webp":
        return contenido[:4] == b"RIFF" and contenido[8:12] == b"WEBP"
    if mime in _CARPETA_OOXML:
        return contenido.startswith(_FIRMA_ZIP) and _es_ooxml(contenido, mime)
    if mime in (MIME_DOC, MIME_XLS, MIME_PPT):
        return contenido.startswith(_FIRMA_OLE2)
    if mime in ("text/plain", "text/csv"):
        return _es_texto(contenido)
    if mime == MIME_ZIP:
        return contenido.startswith(_FIRMA_ZIP) and _es_zip_seguro(contenido)
    return False


def _con_punto(extensiones) -> set:
    """{"pdf", ".DOCX"} -> {".pdf", ".docx"}; jpg y jpeg valen como la misma."""
    normalizadas = {"." + str(e).strip().lower().lstrip(".") for e in extensiones}
    if normalizadas & {".jpg", ".jpeg"}:
        normalizadas |= {".jpg", ".jpeg"}
    return normalizadas


def validar_archivo(nombre: str, contenido: bytes, permitidas=None) -> str:
    """Devuelve el MIME canónico del archivo, o lanza ArchivoInvalido. Ese
    MIME (no el que declaró el cliente) es el que se guarda y del que sale la
    extensión de la clave en R2.

    `permitidas`: extensiones que acepta quien llama (las de una tarea, por
    ejemplo). Sin lista se aceptan las del material de curso. La lista negra
    se aplica siempre, esté lo que esté en `permitidas`."""
    peligrosa = extension_peligrosa_en(nombre)
    if peligrosa:
        raise ArchivoInvalido(
            f"Los archivos .{peligrosa} no se aceptan en la plataforma por seguridad.", "DANGEROUS_EXTENSION",
        )

    extension = _extension(nombre)
    aceptadas = _con_punto(permitidas) if permitidas is not None else EXTENSIONES_MATERIAL
    mime = MIME_POR_EXTENSION.get(extension) if extension in aceptadas else None
    if mime is None:
        if permitidas is not None:
            lista = ", ".join(sorted(e.lstrip(".") for e in aceptadas)) or "ninguno"
            raise ArchivoInvalido(
                f"Tipo de archivo no permitido{' (' + extension + ')' if extension else ''}. Se aceptan: {lista}.",
                "EXTENSION_NOT_ALLOWED",
            )
        raise ArchivoInvalido(
            "Tipo de archivo no permitido. Se aceptan PDF, Word, Excel, PowerPoint, imágenes (PNG, JPG, WEBP, GIF), TXT y CSV.",
            "EXTENSION_NOT_ALLOWED",
        )

    if not contenido:
        raise ArchivoInvalido("El archivo está vacío", "EMPTY_FILE")
    if not _contenido_coincide(contenido, mime):
        if mime == MIME_ZIP:
            raise ArchivoInvalido(
                "El .zip no es válido, es demasiado grande al descomprimir o trae adentro archivos que no se aceptan "
                "(ejecutables, scripts, páginas web...).",
                "CONTENT_MISMATCH",
            )
        raise ArchivoInvalido(
            f"El contenido del archivo no corresponde a un {extension} real. Vuelve a exportarlo y súbelo de nuevo.",
            "CONTENT_MISMATCH",
        )
    return mime
