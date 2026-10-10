"""Dobles de prueba compartidos por los tests que no tocan la base."""


class ConsultaFalsa:
    """Reemplaza a `Modelo.query` / `db.session.query(...)`: cualquier método
    encadenable (filter, order_by, join, limit, execution_options...) devuelve
    la misma consulta, y los terminales devuelven lo que se le dio al crearla.

    `limit` y `offset` sí se respetan, para poder probar la paginación."""

    _ENCADENABLES = (
        "filter", "filter_by", "order_by", "join", "outerjoin", "group_by", "options",
        "execution_options", "with_for_update", "populate_existing",
    )

    def __init__(self, first=None, todos=None, bloqueos=None, opciones=None):
        self._first = first
        self._todos = list(todos or [])
        self._bloqueos = bloqueos
        self._opciones = opciones if opciones is not None else []
        self._limit = None
        self._offset = 0

    def __getattr__(self, nombre):
        if nombre in self._ENCADENABLES:
            def encadenar(*args, **kwargs):
                if nombre == "with_for_update" and self._bloqueos is not None:
                    self._bloqueos.append(True)
                if nombre == "execution_options":
                    self._opciones.append(kwargs)
                return self
            return encadenar
        raise AttributeError(nombre)

    def limit(self, n):
        self._limit = n
        return self

    def offset(self, n):
        self._offset = n
        return self

    def all(self):
        filas = self._todos[self._offset:]
        return filas[: self._limit] if self._limit is not None else filas

    def count(self):
        return len(self._todos)

    def first(self):
        return self._first if self._first is not None else (self._todos[0] if self._todos else None)

    def one(self):
        return self.first()

    def get(self, _id):
        return self._first

    def scalar(self):
        return self._first

    def delete(self, **kwargs):
        return len(self._todos)


class ColaR2Falsa:
    """Reemplaza a app.services.limpieza_r2 en una ruta: anota lo encolado y,
    al procesar, lo "borra" llamando a `borrar` (el storage.borrar falso del test)."""

    def __init__(self, borrar=None):
        self.encoladas = []
        self.motivos = []
        self.procesadas = []
        self._borrar = borrar

    def encolar(self, claves, motivo=None):
        unicas = list(dict.fromkeys(c for c in claves if c))
        self.encoladas.extend(unicas)
        self.motivos.append(motivo)
        return unicas

    def procesar(self, claves=None, limite=200):
        claves = list(claves or [])
        self.procesadas.extend(claves)
        for clave in claves:
            if self._borrar is not None:
                self._borrar(clave)
        return {"borrados": len(claves), "fallidos": 0}

    def borrar_o_encolar(self, clave, motivo=None):
        if clave and self._borrar is not None:
            self._borrar(clave)
