import os
from flask import Blueprint, Response, jsonify, render_template_string
import yaml

docs_bp = Blueprint("docs", __name__)

# Rutas posibles hacia openapi.yaml (busca dentro de flask-api en Docker o subiendo 3 niveles en local)
_CANDIDATE_PATHS = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "openapi.yaml")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "docs", "openapi.yaml")),
]
_CACHED_SPEC = None


def _get_yaml_path():
    for path in _CANDIDATE_PATHS:
        if os.path.exists(path):
            return path
    return None


def _get_spec():
    global _CACHED_SPEC
    if _CACHED_SPEC is None:
        yaml_path = _get_yaml_path()
        if yaml_path:
            with open(yaml_path, "r", encoding="utf-8") as f:
                _CACHED_SPEC = yaml.safe_load(f)
        else:
            _CACHED_SPEC = {"error": "Archivo openapi.yaml no encontrado"}
    return _CACHED_SPEC


@docs_bp.route("/openapi.json", methods=["GET"])
def openapi_json():
    """Retorna la especificación OpenAPI en formato JSON."""
    return jsonify(_get_spec()), 200


@docs_bp.route("/openapi.yaml", methods=["GET"])
def openapi_yaml():
    """Retorna la especificación OpenAPI en formato YAML crudo."""
    if os.path.exists(_YAML_PATH):
        with open(_YAML_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content, mimetype="application/x-yaml")
    return jsonify({"error": "Archivo openapi.yaml no encontrado"}), 404


SWAGGER_UI_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Clerkship API - Documentación Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/favicon-32x32.png" sizes="32x32" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .topbar { display: none !important; }
    .swagger-ui .info { margin: 25px 0; }
    .swagger-ui .info .title { font-size: 32px; color: #1e293b; }
    .swagger-ui .btn.authorize { background-color: #0284c7; border-color: #0284c7; color: #fff; }
    .swagger-ui .btn.authorize svg { fill: #fff; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        docExpansion: "list"
      });
    };
  </script>
</body>
</html>
"""


@docs_bp.route("/docs", methods=["GET"])
@docs_bp.route("", methods=["GET"])
def swagger_ui():
    """Renderiza la interfaz gráfica interactiva de Swagger UI."""
    return render_template_string(SWAGGER_UI_HTML), 200

