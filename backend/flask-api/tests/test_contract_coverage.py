"""
Pruebas de Cobertura y Paridad Contrato vs Implementación.
Valida que el 100% de las rutas y operaciones de la API en Flask coincidan
exactamente con lo documentado en la especificación OpenAPI 3.0.3.
"""
import re


def _normalize_path(path: str) -> str:
    """Normaliza rutas de Flask y OpenAPI al formato canónico /recurso/{param}."""
    p = re.sub(r"<(?:\w+:)?(\w+)>", r"{\1}", path)
    p = re.sub(r"\{[a-zA-Z0-9_]+\}", r"{param}", p)
    return p[:-1] if len(p) > 1 and p.endswith("/") else p


def _get_flask_routes(app):
    """Extrae el mapeo de rutas y métodos soportados por Flask (excluyendo estáticos y docs internos)."""
    routes = {}
    doc_paths = {"/docs", "/api", "/api/docs", "/api/openapi.json", "/api/openapi.yaml", "/simulador"}

    for rule in app.url_map.iter_rules():
        if rule.endpoint == "static":
            continue
        norm = _normalize_path(rule.rule)
        if norm in doc_paths:
            continue
        # Descartar métodos internos de HTTP
        methods = {m.lower() for m in rule.methods if m not in ("HEAD", "OPTIONS")}
        if norm not in routes:
            routes[norm] = set()
        routes[norm].update(methods)
    return routes


def _get_spec_routes(spec):
    """Extrae el mapeo de rutas y métodos definidos en la especificación OpenAPI."""
    routes = {}
    for path, path_item in spec.get("paths", {}).items():
        norm = _normalize_path(path)
        methods = {m.lower() for m in path_item.keys() if m.lower() in ("get", "post", "put", "patch", "delete")}
        if norm not in routes:
            routes[norm] = set()
        routes[norm].update(methods)
    return routes


def test_all_spec_paths_exist_in_flask(app, spec):
    """Verifica que cada ruta documentada en OpenAPI esté efectivamente implementada en Flask."""
    flask_routes = _get_flask_routes(app)
    spec_routes = _get_spec_routes(spec)

    missing_in_flask = set(spec_routes.keys()) - set(flask_routes.keys())
    assert len(missing_in_flask) == 0, f"Rutas en OpenAPI que faltan por implementar en Flask: {missing_in_flask}"


def test_all_flask_routes_are_documented_in_spec(app, spec):
    """Verifica que ninguna ruta de negocio en Flask quede sin documentar en OpenAPI."""
    flask_routes = _get_flask_routes(app)
    spec_routes = _get_spec_routes(spec)

    # Rutas alias internas (como /documentos que es alias de /archivos)
    alias_paths = {
        "/api/documentos/documentos",
        "/api/documentos/documentos/{param}",
        "/api/documentos/documentos/{param}/vista-previa",
    }
    undocumented = (set(flask_routes.keys()) - set(spec_routes.keys())) - alias_paths

    assert len(undocumented) == 0, f"Rutas en Flask no documentadas en OpenAPI: {undocumented}"


def test_http_methods_parity(app, spec):
    """Verifica que para cada endpoint, todos los métodos HTTP declarados coincidan entre Flask y OpenAPI."""
    flask_routes = _get_flask_routes(app)
    spec_routes = _get_spec_routes(spec)

    for path, spec_methods in spec_routes.items():
        assert path in flask_routes, f"Ruta {path} no encontrada en Flask"
        flask_methods = flask_routes[path]
        missing_methods = spec_methods - flask_methods
        assert len(missing_methods) == 0, f"En la ruta {path}, faltan métodos en Flask: {missing_methods}"

