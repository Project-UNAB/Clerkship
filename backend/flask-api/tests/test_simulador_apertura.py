"""Apertura del paciente: en la mayoría de los casos (80 % por defecto, pedido
del docente) entra diciendo de una vez qué le pasa; si no, solo saluda."""

import pytest

from app.services.simulador import agentes, mock


def _caso(con_motivo):
    caso = mock.caso_demo("Colelitiasis / colecistitis aguda", "intermedio")
    caso["presentacion_con_motivo"] = con_motivo
    return caso


def _finalizar(caso):
    return agentes._finalizar_caso(caso, "x", "intermedio", [], "Mock", None, True, None)


@pytest.mark.parametrize("azar, abre_con_motivo", [(0.1, True), (0.79, True), (0.85, False)])
def test_con_el_80_por_ciento_entra_contando_el_motivo(monkeypatch, azar, abre_con_motivo):
    monkeypatch.delenv("SIMULADOR_PROB_MOTIVO_INICIAL", raising=False)
    monkeypatch.setattr(agentes.random, "random", lambda: azar)
    texto = "Buenos dias, doctor. Vengo porque me duele mucho la barriga desde ayer."

    r = _finalizar(_caso(texto))

    caso = r["caso_completo_oculto"]
    assert caso["abre_con_motivo"] is abre_con_motivo
    assert (r["presentacion_inicial"] == texto) is abre_con_motivo
    assert "presentacion_con_motivo" not in caso
    # El paciente sabe si ya contó su motivo, para no repetirlo.
    assert ("Ya contaste tu motivo" in r["system_prompt_paciente"]) is abre_con_motivo


def test_si_la_apertura_nombra_el_diagnostico_solo_saluda(monkeypatch):
    monkeypatch.setattr(agentes.random, "random", lambda: 0.0)
    r = _finalizar(_caso("Buenos dias, doctor. Creo que tengo una colecistitis aguda."))
    assert r["caso_completo_oculto"]["abre_con_motivo"] is False
    assert "colecistitis" not in r["presentacion_inicial"].lower()


def test_la_proporcion_se_puede_cambiar(monkeypatch):
    monkeypatch.setenv("SIMULADOR_PROB_MOTIVO_INICIAL", "0")
    monkeypatch.setattr(agentes.random, "random", lambda: 0.0)
    r = _finalizar(_caso("Buenos dias, doctor. Vengo porque me duele la barriga."))
    assert r["caso_completo_oculto"]["abre_con_motivo"] is False
