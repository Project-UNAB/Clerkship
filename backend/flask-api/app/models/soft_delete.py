"""Borrado suave: la fila no se borra, se marca con `deleted_at`.

Todo SELECT del ORM sobre un modelo con SoftDeleteMixin excluye solo las
filas marcadas — no hay que acordarse de filtrar en cada consulta, y un
curso en la papelera deja de existir para el resto de la aplicación (da 404
como cualquier id desconocido). Para verlas a propósito (papelera,
restaurar, borrado definitivo):

    Course.query.execution_options(include_deleted=True)

El filtro no aplica a consultas escritas con text() ni al refrescar un
objeto ya cargado.
"""
from datetime import datetime, timezone

from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

from app import db


class SoftDeleteMixin:
    # NULL = vigente. Con fecha = en la papelera desde ese momento.
    deleted_at = db.Column(db.DateTime(timezone=True))

    @property
    def eliminado(self) -> bool:
        return self.deleted_at is not None

    def marcar_eliminado(self):
        self.deleted_at = datetime.now(timezone.utc)

    def restaurar(self):
        self.deleted_at = None


@event.listens_for(Session, "do_orm_execute")
def _excluir_eliminados(execute_state):
    if (
        execute_state.is_select
        and not execute_state.is_column_load
        and not execute_state.is_relationship_load
        and not execute_state.execution_options.get("include_deleted", False)
    ):
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(SoftDeleteMixin, lambda cls: cls.deleted_at.is_(None), include_aliases=True)
        )
