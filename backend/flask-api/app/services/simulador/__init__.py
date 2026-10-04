"""
Simulador clinico de gastroenterologia — puerto 1:1 de la logica de
jrojas710/proyectodegrado2 (simulador-clinico-gastro), antes un workflow de
n8n (33 nodos), a Python nativo sobre nuestro backend Flask.

n8n NO hace falta correrlo: este paquete reemplaza por completo la
orquestacion que hacia n8n. El catalogo clinico, los prompts, los guardrails
deterministas y la formula de puntaje se portaron literal desde
scripts/generar_workflow.py del repo clonado. Lo unico que cambia es el
transporte (nuestras rutas REST autenticadas en app/routes/consultas.py en
vez de un unico webhook con un campo `action`) y donde vive el estado (nuestra
base de datos real -Postgres/Mongo- en vez de que el cliente cargue
`system_prompt_paciente`/`caso_completo_oculto` de un lado a otro).
"""
