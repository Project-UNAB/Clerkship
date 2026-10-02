"""
Catalogo clinico cerrado (13 maniobras de examen fisico + 16 paraclinicos),
subtemas de gastroenterologia y perfiles de dificultad.

Puerto literal de CATALOGO / SUBTEMAS / PERFILES_DIFICULTAD / ESTADOS_EMOCIONALES
en scripts/generar_workflow.py (lineas 14-204) del repo jrojas710/proyectodegrado2.
El modelo de lenguaje solo reporta lo alterado; el resto de cada caso se
completa desde aqui, con valores deterministas — asi cualquier maniobra o
examen que el estudiante pida tiene siempre una respuesta coherente y
reproducible.
"""

import unicodedata

SUBTEMAS = [
    "Enfermedad por reflujo gastroesofagico (ERGE)",
    "Gastritis y enfermedad ulcerosa peptica",
    "Sindrome de intestino irritable (SII)",
    "Enfermedad inflamatoria intestinal (Crohn / Colitis ulcerosa)",
    "Pancreatitis aguda",
    "Hepatitis / hepatopatia",
    "Hemorragia digestiva alta o baja",
    "Colelitiasis / colecistitis aguda",
]

CATALOGO_EXAMEN_FISICO = {
    "signos_vitales": {
        "etiqueta": "Toma de signos vitales", "grupo": "General", "contacto": False,
        "normal": "",
    },
    "aspecto_general": {
        "etiqueta": "Aspecto general", "grupo": "General", "contacto": False,
        "normal": "Paciente alerta, orientado, hidratado, sin facies de dolor agudo, sin dificultad respiratoria.",
    },
    "piel_mucosas": {
        "etiqueta": "Piel, mucosas y escleras", "grupo": "General", "contacto": False,
        "normal": "Piel y mucosas normocromicas y humedas, escleras anictericas, sin estigmas de hepatopatia cronica.",
    },
    "inspeccion_abdominal": {
        "etiqueta": "Inspección abdominal", "grupo": "Abdomen", "contacto": False,
        "normal": "Abdomen plano y simetrico, sin cicatrices, sin distension, sin circulacion colateral visible.",
    },
    "auscultacion_abdominal": {
        "etiqueta": "Auscultación abdominal", "grupo": "Abdomen", "contacto": True,
        "accion": "el medico le pone el fonendoscopio sobre el abdomen y escucha en silencio",
        "normal": "Ruidos intestinales presentes, de frecuencia e intensidad normales, sin soplos.",
    },
    "percusion_abdominal": {
        "etiqueta": "Percusión abdominal", "grupo": "Abdomen", "contacto": True,
        "accion": "el medico le percute el abdomen con los dedos en varios puntos",
        "normal": "Timpanismo conservado, matidez hepatica en su sitio, sin matidez cambiante.",
    },
    "palpacion_superficial": {
        "etiqueta": "Palpación superficial", "grupo": "Abdomen", "contacto": True,
        "accion": "el medico le palpa suavemente todo el abdomen",
        "normal": "Abdomen blando y depresible, no doloroso a la palpacion superficial, sin defensa muscular.",
    },
    "palpacion_profunda": {
        "etiqueta": "Palpación profunda", "grupo": "Abdomen", "contacto": True,
        "accion": "el medico le palpa el abdomen con mas presion, cuadrante por cuadrante",
        "normal": "Sin dolor a la palpacion profunda, sin masas ni visceromegalias palpables.",
    },
    "signo_murphy": {
        "etiqueta": "Signo de Murphy", "grupo": "Maniobras especiales", "contacto": True,
        "accion": "el medico presiona bajo las costillas del lado derecho y le pide que respire hondo",
        "normal": "Signo de Murphy negativo.",
    },
    "signo_mcburney": {
        "etiqueta": "Punto de McBurney", "grupo": "Maniobras especiales", "contacto": True,
        "accion": "el medico presiona un punto en la parte baja derecha del abdomen",
        "normal": "Punto de McBurney no doloroso.",
    },
    "signo_blumberg": {
        "etiqueta": "Signo de Blumberg (rebote)", "grupo": "Maniobras especiales", "contacto": True,
        "accion": "el medico hunde la mano en el abdomen y la suelta de golpe",
        "normal": "Signo de Blumberg negativo, sin dolor a la descompresion.",
    },
    "puno_percusion": {
        "etiqueta": "Puño percusión lumbar", "grupo": "Maniobras especiales", "contacto": True,
        "accion": "el medico le da un golpe suave con el puno en la parte baja de la espalda, a cada lado",
        "normal": "Puno percusion lumbar bilateral negativa.",
    },
    "tacto_rectal": {
        "etiqueta": "Tacto rectal", "grupo": "Maniobras especiales", "contacto": True,
        "accion": "el medico le explica que va a realizar un tacto rectal y lo realiza con guante",
        "normal": "Esfinter con tono normal, ampolla con heces de aspecto normal, sin masas, guante sin sangre ni melenas.",
    },
}

CATALOGO_PARACLINICOS = {
    "hemograma": {
        "etiqueta": "Hemograma completo", "grupo": "Hematología", "demora": 5,
        "tecnica": "Citometría de flujo", "muestra": "Sangre total (EDTA)",
        "normal": "Hb 14.0 g/dL, Hto 42 %, leucocitos 7.300/mm3 (neutrofilos 58 %, linfocitos 32 %), plaquetas 265.000/mm3.",
    },
    "pcr": {
        "etiqueta": "Proteína C reactiva", "grupo": "Inmunología/Serología", "demora": 4,
        "tecnica": "Inmunoturbidimetría", "muestra": "Suero",
        "normal": "PCR 0.3 mg/dL (VR < 0.5 mg/dL).",
    },
    "perfil_hepatico": {
        "etiqueta": "Perfil hepático", "grupo": "Química", "demora": 6,
        "tecnica": "Test cinético / Espectrofotometría", "muestra": "Suero",
        "normal": "ALT 24 U/L, AST 22 U/L, fosfatasa alcalina 82 U/L, GGT 28 U/L, bilirrubina total 0.7 mg/dL (directa 0.2 mg/dL), albumina 4.2 g/dL.",
    },
    "amilasa_lipasa": {
        "etiqueta": "Amilasa y lipasa", "grupo": "Química", "demora": 5,
        "tecnica": "Test cinético colorimétrico", "muestra": "Suero",
        "normal": "Amilasa 68 U/L (VR 28-100), lipasa 34 U/L (VR 13-60).",
    },
    "funcion_renal_electrolitos": {
        "etiqueta": "Función renal y electrolitos", "grupo": "Química", "demora": 5,
        "tecnica": "Espectrofotometría / Potenciometría ión-selectivo", "muestra": "Suero",
        "normal": "Creatinina 0.9 mg/dL, BUN 14 mg/dL, Na 139 mEq/L, K 4.1 mEq/L, Cl 102 mEq/L.",
    },
    "tiempos_coagulacion": {
        "etiqueta": "Tiempos de coagulación", "grupo": "Hematología", "demora": 5,
        "tecnica": "Coagulometría óptica", "muestra": "Plasma citratado",
        "normal": "TP 12.1 s, INR 1.0, TPT 30 s.",
    },
    "uroanalisis": {
        "etiqueta": "Uroanálisis", "grupo": "Uroanálisis", "demora": 4,
        "tecnica": "Química seca automatizada + microscopía", "muestra": "Orina espontánea",
        "normal": "Densidad 1.015, pH 6, sin leucocituria, sin hematuria, nitritos negativos, bilirrubina negativa.",
    },
    "prueba_embarazo": {
        "etiqueta": "Prueba de embarazo (beta-hCG)", "grupo": "Inmunología/Serología", "demora": 4,
        "tecnica": "Inmunoensayo cualitativo", "muestra": "Suero",
        "normal": "Beta-hCG cualitativa negativa.",
    },
    "sangre_oculta_heces": {
        "etiqueta": "Sangre oculta en heces", "grupo": "Coprología", "demora": 5,
        "tecnica": "Inmunocromatografía", "muestra": "Materia fecal",
        "normal": "Sangre oculta en heces negativa.",
    },
    "coprologico": {
        "etiqueta": "Coprológico", "grupo": "Coprología", "demora": 5,
        "tecnica": "Examen macroscópico y microscópico directo", "muestra": "Materia fecal",
        "normal": "Heces blandas, sin moco ni sangre, sin leucocitos, no se observan parasitos.",
    },
    "prueba_h_pylori": {
        "etiqueta": "Antígeno fecal H. pylori", "grupo": "Coprología", "demora": 5,
        "tecnica": "Inmunocromatografía", "muestra": "Materia fecal",
        "normal": "Antigeno fecal para Helicobacter pylori negativo.",
    },
    "rx_abdomen": {
        "etiqueta": "Radiografía de abdomen", "grupo": "Imágenes", "demora": 6,
        "tecnica": "Radiología digital simple", "muestra": "N/A",
        "normal": "Patron gaseoso intestinal normal, sin niveles hidroaereos, sin neumoperitoneo.",
    },
    "ecografia_abdominal": {
        "etiqueta": "Ecografía abdominal", "grupo": "Imágenes", "demora": 7,
        "tecnica": "Ultrasonografía en tiempo real", "muestra": "N/A",
        "normal": "Higado de tamano y ecogenicidad normales, vesicula de paredes delgadas sin calculos, via biliar no dilatada, pancreas sin alteraciones, sin liquido libre.",
    },
    "tac_abdomen": {
        "etiqueta": "TAC de abdomen contrastado", "grupo": "Imágenes", "demora": 8,
        "tecnica": "Tomografía multicorte contrastada", "muestra": "N/A",
        "normal": "Sin alteraciones significativas en organos solidos, asas intestinales ni retroperitoneo.",
    },
    "endoscopia_digestiva_alta": {
        "etiqueta": "Endoscopia digestiva alta", "grupo": "Procedimientos", "demora": 8,
        "tecnica": "Videoendoscopia digestiva alta", "muestra": "N/A",
        "normal": "Esofago, estomago y duodeno con mucosa de aspecto normal, sin lesiones.",
    },
    "colonoscopia": {
        "etiqueta": "Colonoscopia", "grupo": "Procedimientos", "demora": 8,
        "tecnica": "Videocolonoscopia", "muestra": "N/A",
        "normal": "Colon y recto con mucosa de aspecto normal hasta ileon terminal.",
    },
}

PERFILES_DIFICULTAD = {
    "facil": {
        "etiqueta": "Fácil",
        "generador": (
            "Presentacion tipica, de libro de texto. Sintomas clasicos y claros, sin comorbilidades que confundan. "
            "Entre 4 y 5 preguntas clave en la rubrica, 2 o 3 hallazgos por indagar y 2 diagnosticos diferenciales. "
            "Los hallazgos del examen fisico y de los paraclinicos son evidentes."
        ),
        "paciente": (
            "Eres un buen historiador: colaboras, describes tus sintomas con claridad cuando te preguntan y recuerdas bien "
            "fechas y detalles. Aun asi, no cuentas lo que no te preguntan."
        ),
    },
    "intermedio": {
        "etiqueta": "Media",
        "generador": (
            "Presentacion tipica con algun elemento de ruido: una comorbilidad o un medicamento relevante, o un sintoma "
            "acompanante que abra un diagnostico diferencial razonable. Entre 5 y 7 preguntas clave, 3 o 4 hallazgos por "
            "indagar y 3 diagnosticos diferenciales."
        ),
        "paciente": (
            "Eres un paciente promedio: respondes lo que te preguntan sin elaborar mucho, a veces con imprecision en tiempos "
            "o intensidades (\"hace como una semana, o dos\"), y necesitas preguntas concretas para dar detalles."
        ),
    },
    "dificil": {
        "etiqueta": "Difícil",
        "generador": (
            "Presentacion atipica o enmascarada (por ejemplo adulto mayor, diabetico, o uso de AINEs, esteroides o analgesicos "
            "que modifican el cuadro), con al menos una comorbilidad que actue como distractor y diagnosticos diferenciales "
            "cercanos entre si. Los datos clave solo aparecen con preguntas especificas. Entre 6 y 8 preguntas clave, 4 o 5 "
            "hallazgos por indagar y 3 o 4 diagnosticos diferenciales. Las alteraciones de laboratorio pueden ser sutiles."
        ),
        "paciente": (
            "Eres un historiador dificil: minimizas o exageras segun tu personalidad, usas lenguaje coloquial y vago "
            "(\"me da como una cosa aqui\", \"agrieras\", \"llenura\"), a veces te vas por las ramas con informacion poco "
            "relevante y tienes una preocupacion que no dices de entrada (por ejemplo miedo a que sea algo grave); solo la "
            "cuentas si el estudiante te genera confianza. Los datos clave solo los das si la pregunta es especifica."
        ),
    },
}

ESTADOS_EMOCIONALES = [
    "tranquilo", "preocupado", "ansioso", "adolorido", "incomodo",
    "molesto", "triste", "aliviado", "agradecido",
]


def normalizar(texto) -> str:
    """minusculas + sin tildes — mismo criterio que normalizar() en el n8n original."""
    s = str(texto or "").lower()
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def normalizar_dificultad(valor):
    """Acepta alias (baja/media/alta, etc.) y 'auto' -> None (deja que el
    backend ajuste segun desempeno historico). Puerto de normalizarDificultad()."""
    v = normalizar(valor).strip()
    if not v or v in ("auto", "automatica", "adaptativa"):
        return None
    if v in ("facil", "baja", "bajo", "basica", "basico"):
        return "facil"
    if v in ("intermedio", "intermedia", "media", "medio", "moderada"):
        return "intermedio"
    if v in ("dificil", "alta", "alto", "avanzada", "avanzado"):
        return "dificil"
    return None


def normalizar_subtema(valor):
    """Compara sin distinguir mayusculas ni tildes contra SUBTEMAS; None si no coincide."""
    if not valor:
        return None
    v = normalizar(valor).strip()
    for s in SUBTEMAS:
        if normalizar(s) == v:
            return s
    return None
