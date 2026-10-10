"""Dispara peticiones en paralelo contra un backend corriendo y comprueba que
los controles de concurrencia de la fase 2 aguantan.

Necesita un backend con Postgres de verdad (los candados de fila no existen en
sqlite) y una cuenta de ESTUDIANTE matriculada en el curso. Usa un curso de
prueba: el script crea intentos y entregas reales con esa cuenta.

Credenciales por variables de entorno, nunca por argumento:

    CLERKSHIP_TOKEN=<access token>          # o bien
    CLERKSHIP_EMAIL=... CLERKSHIP_PASSWORD=...

Uso (desde backend/flask-api, con el venv activo):

    # Cuestionario: 20 "iniciar intento" a la vez + doble envío del mismo intento
    python scripts/prueba_concurrencia.py quiz \
        --base-url http://localhost:5000 --curso <course_id> --bloque <block_id> --item <quiz_id>

    # Tarea: 10 entregas a la vez -> debe quedar una sola fila
    python scripts/prueba_concurrencia.py entrega \
        --base-url http://localhost:5000 --curso <course_id> --bloque <block_id> --item <tarea_id>

Sale con código 0 si todo se respetó y 1 si algo se coló.
"""
import argparse
import base64
import os
import sys
import threading
from collections import Counter

import requests

PDF_MINIMO = b"%PDF-1.4\n%%EOF\n"
TIMEOUT = 60


def _token(base_url):
    token = os.environ.get("CLERKSHIP_TOKEN")
    if token:
        return token
    email, password = os.environ.get("CLERKSHIP_EMAIL"), os.environ.get("CLERKSHIP_PASSWORD")
    if not email or not password:
        sys.exit("Define CLERKSHIP_TOKEN, o CLERKSHIP_EMAIL y CLERKSHIP_PASSWORD.")
    res = requests.post(f"{base_url}/api/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
    if res.status_code != 200:
        sys.exit(f"No se pudo iniciar sesión ({res.status_code}).")
    return res.json()["access_token"]


def _en_paralelo(n, peticion):
    """Lanza `peticion(i)` en n hilos que arrancan todos en el mismo instante."""
    barrera = threading.Barrier(n)
    resultados = [None] * n

    def trabajo(i):
        barrera.wait()
        try:
            resultados[i] = peticion(i)
        except requests.RequestException as err:  # la petición ni llegó
            resultados[i] = err

    hilos = [threading.Thread(target=trabajo, args=(i,)) for i in range(n)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    return resultados


def _resumen(titulo, resultados):
    codigos = Counter(r.status_code if isinstance(r, requests.Response) else "error de red" for r in resultados)
    print(f"  {titulo}: " + ", ".join(f"{codigo} x{veces}" for codigo, veces in sorted(codigos.items(), key=str)))
    return codigos


def _veredicto(ok, mensaje):
    print(f"  [{'OK' if ok else 'FALLA'}] {mensaje}")
    return ok


def probar_quiz(base, cabeceras, n):
    todo_bien = True

    antes = requests.get(f"{base}/intentos", headers=cabeceras, timeout=TIMEOUT).json()["intentos"]
    print(f"Intentos antes de empezar: {len(antes)}")

    print(f"\n1) {n} peticiones simultáneas de 'iniciar intento'")
    respuestas = _en_paralelo(n, lambda _i: requests.post(f"{base}/intentos", headers=cabeceras, timeout=TIMEOUT))
    codigos = _resumen("respuestas", respuestas)
    despues = requests.get(f"{base}/intentos", headers=cabeceras, timeout=TIMEOUT).json()["intentos"]
    creados = len(despues) - len(antes)
    abiertos = [i for i in despues if not i["completed"]]
    numeros = [i["attempt_number"] for i in despues]
    ids_devueltos = {r.json()["id"] for r in respuestas if isinstance(r, requests.Response) and r.status_code in (200, 201)}

    todo_bien &= _veredicto(creados <= 1, f"se creó como máximo un intento (se crearon {creados})")
    todo_bien &= _veredicto(len(abiertos) <= 1, f"hay como máximo un intento abierto (hay {len(abiertos)})")
    todo_bien &= _veredicto(len(numeros) == len(set(numeros)), "ningún número de intento se repite")
    todo_bien &= _veredicto(len(ids_devueltos) <= 1, "todas las peticiones atendidas recibieron el mismo intento")
    todo_bien &= _veredicto(codigos.get(201, 0) <= 1, "solo una petición respondió 201 (las demás 200, 400 o 409)")
    todo_bien &= _veredicto(codigos.get(500, 0) == 0, "ninguna petición terminó en 500")

    if not abiertos:
        print("\n   No quedó ningún intento abierto (¿intentos agotados o cuestionario cerrado?): se omite el doble envío.")
        return todo_bien

    intento = abiertos[0]
    detalle = requests.get(f"{base}/intentos/{intento['id']}", headers=cabeceras, timeout=TIMEOUT).json()
    respuestas_quiz = [
        {"question_id": p["id"], "selected_choice_ids": [p["choices"][0]["id"]] if p["choices"] else []}
        for p in detalle.get("preguntas", [])
    ]

    print(f"\n2) {n} envíos simultáneos del MISMO intento")
    respuestas = _en_paralelo(
        n,
        lambda _i: requests.post(
            f"{base}/intentos/{intento['id']}/responder", json={"answers": respuestas_quiz}, headers=cabeceras, timeout=TIMEOUT,
        ),
    )
    codigos = _resumen("respuestas", respuestas)
    todo_bien &= _veredicto(codigos.get(200, 0) == 1, f"exactamente un envío fue aceptado (aceptados: {codigos.get(200, 0)})")
    todo_bien &= _veredicto(codigos.get(409, 0) == n - 1, f"los otros {n - 1} recibieron 409 (recibieron: {codigos.get(409, 0)})")
    todo_bien &= _veredicto(codigos.get(500, 0) == 0, "ninguna petición terminó en 500")

    print("\n3) Modificar el intento ya finalizado")
    guardar = requests.put(
        f"{base}/intentos/{intento['id']}/respuestas", json={"answers": respuestas_quiz}, headers=cabeceras, timeout=TIMEOUT,
    )
    todo_bien &= _veredicto(guardar.status_code == 409, f"guardar respuestas responde 409 (respondió {guardar.status_code})")
    final = requests.get(f"{base}/intentos/{intento['id']}", headers=cabeceras, timeout=TIMEOUT).json()
    una_por_pregunta = all(p.get("tu_respuesta") is not None for p in final.get("preguntas", []))
    todo_bien &= _veredicto(final["completed"] and una_por_pregunta, "el intento quedó finalizado con una respuesta por pregunta")

    print(f"\n4) Otros {n} 'iniciar intento' a la vez — con max_attempts el total no debe pasarse")
    respuestas = _en_paralelo(n, lambda _i: requests.post(f"{base}/intentos", headers=cabeceras, timeout=TIMEOUT))
    _resumen("respuestas", respuestas)
    total = len(requests.get(f"{base}/intentos", headers=cabeceras, timeout=TIMEOUT).json()["intentos"])
    todo_bien &= _veredicto(total - len(despues) <= 1, f"esta ronda creó como máximo un intento (total ahora: {total})")
    print("   Compara ese total con el max_attempts del cuestionario: nunca debe superarlo.")
    return todo_bien


def probar_entrega(base, cabeceras, n):
    cuerpo = lambda i: {  # noqa: E731
        "name": f"entrega-{i}.pdf",
        "file_base64": base64.b64encode(PDF_MINIMO + f"% copia {i}\n".encode()).decode("ascii"),
    }

    print(f"1) {n} entregas simultáneas de la misma tarea")
    respuestas = _en_paralelo(n, lambda i: requests.post(f"{base}/entregas", json=cuerpo(i), headers=cabeceras, timeout=TIMEOUT))
    codigos = _resumen("respuestas", respuestas)
    ids = {r.json()["id"] for r in respuestas if isinstance(r, requests.Response) and r.status_code == 201}
    mia = requests.get(f"{base}/entregas/mia", headers=cabeceras, timeout=TIMEOUT).json()["entrega"]

    todo_bien = _veredicto(len(ids) == 1, f"todas las entregas aceptadas son la MISMA fila (ids distintos: {len(ids)})")
    todo_bien &= _veredicto(mia is not None and mia["id"] in ids, "la entrega que ve el estudiante es esa fila")
    todo_bien &= _veredicto(codigos.get(500, 0) == 0, "ninguna petición terminó en 500")
    print("   Para confirmarlo en la base (debe devolver 1):")
    print("   SELECT COUNT(*) FROM assignment_submissions WHERE item_id = '<tarea_id>' AND student_id = '<estudiante_id>';")
    return todo_bien


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("prueba", choices=["quiz", "entrega"])
    parser.add_argument("--base-url", default="http://localhost:5000")
    parser.add_argument("--curso", required=True)
    parser.add_argument("--bloque", required=True)
    parser.add_argument("--item", required=True)
    parser.add_argument("-n", type=int, default=None, help="peticiones simultáneas (quiz: 20, entrega: 10)")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    cabeceras = {"Authorization": f"Bearer {_token(base_url)}"}
    base = f"{base_url}/api/cursos/{args.curso}/bloques/{args.bloque}/contenido/{args.item}"

    if args.prueba == "quiz":
        ok = probar_quiz(base, cabeceras, args.n or 20)
    else:
        ok = probar_entrega(base, cabeceras, args.n or 10)

    print("\nRESULTADO:", "todo se respetó" if ok else "ALGO SE COLÓ — revisa las líneas [FALLA]")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
