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

