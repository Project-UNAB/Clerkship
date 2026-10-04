import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Puerto propio (5001) para poder correr ESTE backend (Agentes IA /
    # Consultas / Historial) al mismo tiempo que pruebas/back/flask-api
    # (Auth / Dashboard / Documentos), que ya ocupa el 5000 — ambos hablan
    # contra la MISMA Supabase/Mongo, así que un JWT emitido por cualquiera
    # de los dos sirve para el otro (mismo JWT_SECRET_KEY).
    port = int(os.environ.get("FLASK_RUN_PORT", 5001))
    # threaded=True: sin esto, el servidor de desarrollo de Flask atiende
    # UNA petición a la vez — cualquier pantalla que pida varias cosas en
    # paralelo (ej. carpetas + recientes del Dashboard, o mensajes + "está
    # escribiendo" de Chats) las procesaba en fila, no en simultáneo, lo que
    # se sentía como lentitud aunque cada consulta individual fuera rápida.
    # El depurador de Werkzeug permite ejecutar código: solo en desarrollo.
    debug = os.environ.get("FLASK_ENV") == "development"
    app.run(debug=debug, threaded=True, port=port)
