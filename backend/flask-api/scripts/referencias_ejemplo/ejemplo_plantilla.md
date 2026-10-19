subtema: Enfermedad por reflujo gastroesofagico (ERGE)
# EJEMPLO, no validado clínicamente

> **EJEMPLO, no validado clínicamente.** Esta ficha solo muestra el formato que
> espera `scripts/cargar_referencias.py`: la primera línea es
> `subtema: <nombre>` y todo lo que sigue es el contenido que el generador de
> casos recibe como referencia. No contiene contenido clínico real.

El contenido de una ficha real lo aporta y lo revisa el experto clínico del
proyecto. Mientras eso no ocurra, esta ficha no debe cargarse con `--aplicar`:
su único propósito es documentar el formato.

Puntos que conviene incluir en una ficha revisada (a completar por el experto):

- Definición y criterios diagnósticos del subtema.
- Síntomas cardinales y signos de alarma.
- Hallazgos esperables del examen físico y de los paraclínicos del catálogo.
- Diagnósticos diferenciales relevantes.
- Errores frecuentes de los estudiantes en este subtema.

Para crear una ficha nueva: copia este archivo, cambia la primera línea por el
subtema exacto de la lista de `app/services/simulador/catalogo.py`, reemplaza el
texto por el contenido validado y ejecuta el script (primero sin `--aplicar`).
