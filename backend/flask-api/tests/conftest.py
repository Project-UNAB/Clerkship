import os

# Los tests NUNCA usan la base de producción: DATABASE_URL y MONGODB_URI se
# fuerzan ANTES de importar la app. Para tests de integración con datos reales
# de prueba, define TEST_DATABASE_URL apuntando a una base de pruebas dedicada.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or "sqlite:///:memory:"
os.environ["MONGODB_URI"] = ""
os.environ["FLASK_ENV"] = "testing"
os.environ["AI_AGENT_PROVIDER"] = "mock"
# Ningún test debe llamar a proveedores de IA reales (red lenta y gasta cuota).
os.environ["GEMINI_API_KEY"] = ""
os.environ["OPENROUTER_API_KEY"] = ""

import pytest
import yaml
from openapi_schema_validator import validate as validate_schema

from app import create_app

SPEC_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "openapi.yaml"))


@pytest.fixture(scope="session")
def spec():
    """Carga y entrega la especificación OpenAPI como diccionario."""
    with open(SPEC_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="session")
def spec_path():
    """Ruta absoluta al archivo openapi.yaml."""
    return SPEC_PATH


@pytest.fixture(scope="session")
def app():
    """Instancia de la aplicación Flask configurada para testing."""
    application = create_app()
    application.config["TESTING"] = True
    return application


@pytest.fixture(autouse=True)
def _tokens_vigentes(monkeypatch):
    """Cada petición autenticada consulta en la base si el token sigue vigente
    (usuario activo, rol actual, lista de revocación). Los tests arman tokens
    para usuarios que no existen en ninguna base, así que por defecto esa
    comprobación se da por pasada; test_fase6_seguridad.py prueba la real."""
    from app.services import sesiones

    monkeypatch.setattr(sesiones, "token_revocado", lambda payload: False)


@pytest.fixture(autouse=True)
def _sin_notificaciones(monkeypatch):
    """Publicar una tarea o un aviso, o calificar, avisa a los estudiantes:
    eso consulta matrículas y escribe en notifications. Los tests de esas
    rutas no tienen base, así que por defecto los avisos no hacen nada;
    test_fase7_funcionalidades.py prueba los reales."""
    from app.services import notificaciones

    for evento in ("tarea_publicada", "aviso_publicado", "tarea_calificada"):
        monkeypatch.setattr(notificaciones, evento, lambda *a, **kw: 0)


@pytest.fixture(scope="session")
def client(app):
    """Cliente de pruebas HTTP de Flask."""
    return app.test_client()


@pytest.fixture(scope="session")
def schema_validator(spec):
    """Función helper para validar instancias de datos contra esquemas OpenAPI."""
    def _validate(instance, schema_or_name):
        if isinstance(schema_or_name, str):
            schema = spec["components"]["schemas"][schema_or_name]
        else:
            schema = schema_or_name
        validate_schema(instance, schema)
    return _validate

