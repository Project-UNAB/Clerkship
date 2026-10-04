"""
Route and interactive testing console for ClinicAI UNAB Multi-Agent Simulator.

Serves an interactive single-page application at `/simulador` allowing direct testing
<<<<<<< HEAD
of the complete 3-step clinical reasoning workflow:
1. Agente 1 (Generador de Casos - Google Gemini)
2. Agente 2 (Paciente Virtual - ChatGPT / OpenAI)
=======
of the complete 3-step clinical reasoning workflow (un único proveedor: Google Gemini):
1. Agente 1 (Generador de Casos - Google Gemini)
2. Agente 2 (Paciente Virtual - Google Gemini)
>>>>>>> main
3. Agente 3 (Tutor Evaluador - Google Gemini)
"""

import os
from flask import Blueprint, render_template_string

simulador_bp = Blueprint("simulador", __name__)

SIMULADOR_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClinicAI UNAB — Consola de Pruebas del Simulador Clínico</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%230284c7'><path d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z'/></svg>">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: { 50: '#f0f9ff', 100: '#e0f2fe', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1' }
          }
        }
      }
    }
  </script>
  <style>
    .chat-scroll::-webkit-scrollbar { width: 6px; }
    .chat-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 9999px; }
  </style>
</head>
<body class="bg-slate-50 text-slate-800 font-sans min-h-screen flex flex-col">

  <!-- Header -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-teal-500 flex items-center justify-center text-white font-bold text-xl shadow-md">
          🩺
        </div>
        <div>
          <h1 class="text-lg font-bold text-slate-900 leading-tight">ClinicAI UNAB <span class="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200 font-semibold uppercase">Consola de Pruebas</span></h1>
<<<<<<< HEAD
          <p class="text-xs text-slate-500">Simulación Clínica Multi-Agente (Gemini + ChatGPT)</p>
=======
          <p class="text-xs text-slate-500">Simulación Clínica Multi-Agente (Google Gemini)</p>
>>>>>>> main
        </div>
      </div>

      <!-- Auth and Provider Badges -->
      <div class="flex items-center space-x-3">
        <div class="hidden lg:flex items-center space-x-2 text-xs">
          {% if gemini_key %}
          <span class="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-medium flex items-center gap-1.5" title="Google Gemini configurado en .env">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Agente 1: Gemini ({{ gemini_model }})
          </span>
          {% else %}
          <span class="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-1.5" title="Sin clave GEMINI_API_KEY en .env">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span> Agente 1: Mock (Sin Key)
          </span>
          {% endif %}

<<<<<<< HEAD
          {% if openai_key %}
          <span class="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium flex items-center gap-1.5" title="OpenAI ChatGPT configurado en .env">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Agente 2: ChatGPT ({{ openai_model }})
          </span>
          {% else %}
          <span class="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-1.5" title="Sin clave OPENAI_API_KEY en .env">
=======
          {% if gemini_key %}
          <span class="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium flex items-center gap-1.5" title="Google Gemini configurado en .env">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Agente 2: Gemini ({{ gemini_model }})
          </span>
          {% else %}
          <span class="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-1.5" title="Sin clave GEMINI_API_KEY en .env">
>>>>>>> main
            <span class="w-2 h-2 rounded-full bg-amber-500"></span> Agente 2: Mock (Sin Key)
          </span>
          {% endif %}

          {% if gemini_key %}
          <span class="px-2.5 py-1 rounded-md bg-purple-50 text-purple-800 border border-purple-200 font-medium flex items-center gap-1.5" title="Google Gemini configurado en .env">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Agente 3: Gemini ({{ gemini_model }})
          </span>
          {% else %}
          <span class="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium flex items-center gap-1.5" title="Sin clave GEMINI_API_KEY en .env">
            <span class="w-2 h-2 rounded-full bg-amber-500"></span> Agente 3: Mock (Sin Key)
          </span>
          {% endif %}
        </div>

        <div id="authStatusBadge" class="text-xs font-medium px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
          <span>⚠️ Sin sesión</span>
        </div>
        <button id="quickLoginBtn" onclick="quickLogin()" class="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium shadow-sm transition">
          🔑 Login Rápido
        </button>
      </div>
    </div>
  </header>

  <!-- Developer Diagnostics Bar -->
  <div class="bg-slate-900 text-slate-100 text-xs py-2 px-4 sm:px-6 lg:px-8 border-b border-slate-800 shadow-inner">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="px-2 py-0.5 rounded bg-sky-950 text-sky-300 font-mono text-[10px] font-bold uppercase tracking-wider border border-sky-800">🛠️ Consola de Desarrollo</span>
        <span class="text-slate-300 text-[11px]">Transparencia Multi-Agente: Monitoreo en vivo de llamadas reales vs fallbacks Mock</span>
      </div>
      <div class="flex flex-wrap items-center gap-4 text-[11px]">
        <div>
          <span class="text-slate-400">Gemini:</span>
          {% if gemini_key %}
          <span class="text-emerald-400 font-semibold font-mono">🟢 Key Detectada ({{ gemini_model }} ➔ auto 3.5-flash)</span>
          {% else %}
          <span class="text-amber-400 font-semibold font-mono">🟡 Key Vacía (Fallback a Mock)</span>
          {% endif %}
        </div>
<<<<<<< HEAD
        <div>
          <span class="text-slate-400">OpenAI:</span>
          {% if openai_key %}
          <span class="text-emerald-400 font-semibold font-mono">🟢 Key Detectada ({{ openai_model }})</span>
          {% else %}
          <span class="text-amber-400 font-semibold font-mono">🟡 Key Vacía en .env (Fallback a Mock)</span>
          {% endif %}
        </div>
=======
>>>>>>> main
      </div>
    </div>
  </div>

  <!-- Main Content Grid -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">

    <!-- Left Column: Step 1 (Case Generator) & Step 3 (Evaluation Form) -->
    <div class="lg:col-span-6 space-y-6">

      <!-- STEP 1: Agente 1 (Generador de Casos) -->
      <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span class="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <h2 class="font-bold text-slate-900 text-base">Generador de Casos Clínicos</h2>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Google Gemini</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Especialidad</label>
            <select id="caseSpecialty" class="w-full text-sm rounded-lg border-slate-200 border p-2 bg-slate-50 focus:ring-2 focus:ring-sky-500 focus:bg-white transition">
              <option value="Gastroenterología">Gastroenterología</option>
              <option value="Cirugía General">Cirugía General</option>
              <option value="Medicina Interna">Medicina Interna</option>
              <option value="Urgencias Médicas">Urgencias Médicas</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Dificultad</label>
            <select id="caseDifficulty" class="w-full text-sm rounded-lg border-slate-200 border p-2 bg-slate-50 focus:ring-2 focus:ring-sky-500 focus:bg-white transition">
              <option value="MEDIUM">Media (Intermedia)</option>
              <option value="EASY">Básica (Semiología)</option>
              <option value="HARD">Avanzada (Alta Complejidad)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Condición Sugerida</label>
            <input id="caseCondition" type="text" placeholder="Ej: Pancreatitis aguda" class="w-full text-sm rounded-lg border-slate-200 border p-2 bg-slate-50 focus:ring-2 focus:ring-sky-500 focus:bg-white transition" value="Pancreatitis Aguda">
          </div>
        </div>

        <button id="generateCaseBtn" onclick="generateCase()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white font-semibold text-sm shadow-md transition flex items-center justify-center gap-2">
          <span>✨ Generar Caso Clínico con Gemini</span>
        </button>

        <!-- Case Presentation Card -->
        <div id="caseContainer" class="hidden border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
          <!-- Live Telemetry Status Banner -->
          <div id="caseTelemetryBanner" class="p-3 rounded-lg text-xs flex flex-col gap-1 border"></div>

          <div class="flex items-center justify-between">
            <span id="caseIdBadge" class="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-slate-200 text-slate-800">CASE-GI-001</span>
            <span id="caseGroundTruthHint" class="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">🔒 Ground Truth Cargado</span>
          </div>

          <h3 id="caseTitle" class="font-bold text-slate-900 text-sm">Título del caso</h3>

          <div id="caseDemographics" class="text-xs text-slate-600 flex flex-wrap gap-2"></div>

          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg">
            <p class="text-xs font-bold text-amber-900 uppercase">Motivo de Consulta:</p>
            <p id="caseChiefComplaint" class="text-xs text-amber-950 italic mt-0.5">"..."</p>
          </div>

          <div class="space-y-1">
            <p class="text-xs font-bold text-slate-700">Enfermedad Actual:</p>
            <p id="casePresentIllness" class="text-xs text-slate-600 leading-relaxed text-justify max-h-36 overflow-y-auto pr-1 chat-scroll"></p>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-slate-200 text-center" id="vitalSignsGrid"></div>

          <!-- Collapsible JSON Debugger -->
          <details class="text-[11px] bg-slate-100 rounded-lg p-2 border border-slate-200">
            <summary class="cursor-pointer font-bold text-slate-700 hover:text-sky-600">🔍 Ver Telemetría y Payload Completo (Agente 1)</summary>
            <pre id="caseRawJson" class="mt-2 p-2 bg-slate-900 text-emerald-400 rounded overflow-x-auto text-[10px] max-h-48 chat-scroll"></pre>
          </details>
        </div>
      </section>

      <!-- STEP 3: Formulario de Evaluación y Diagnóstico (Agente 3) -->
      <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center space-x-2">
            <span class="w-7 h-7 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">3</span>
            <h2 class="font-bold text-slate-900 text-base">Razonamiento Clínico y Evaluación</h2>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">Google Gemini</span>
        </div>

        <p class="text-xs text-slate-500">Una vez interrogado el paciente virtual, formula tus solicitudes diagnósticas y conclusión clínica:</p>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Exámenes Paraclínicos e Imágenes Solicitados (separados por coma)</label>
            <input id="evalTests" type="text" placeholder="Ej: Lipasa sérica, Amilasa sérica, Ecografía abdominal" class="w-full text-sm rounded-lg border-slate-200 border p-2 focus:ring-2 focus:ring-purple-500 transition" value="Lipasa sérica, Ecografía abdominal, Hemograma">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Diagnósticos Diferenciales Planteados (separados por coma)</label>
            <input id="evalDifferentials" type="text" placeholder="Ej: Colecistitis aguda, Úlcera péptica" class="w-full text-sm rounded-lg border-slate-200 border p-2 focus:ring-2 focus:ring-purple-500 transition" value="Colecistitis aguda, Úlcera péptica perforada">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Diagnóstico Final Definitivo <span class="text-red-500">*</span></label>
            <input id="evalFinalDiag" type="text" placeholder="Ej: Pancreatitis aguda de origen litiásico" class="w-full text-sm rounded-lg border-slate-200 border p-2 focus:ring-2 focus:ring-purple-500 transition" value="Pancreatitis aguda de origen litiásico">
          </div>
        </div>

        <button id="evaluateBtn" onclick="evaluateSession()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-semibold text-sm shadow-md transition flex items-center justify-center gap-2">
          <span>📊 Evaluar Razonamiento Clínico con Gemini</span>
        </button>
      </section>

    </div>

    <!-- Right Column: Step 2 (Virtual Patient Chat) & Step 3 Output (Evaluation Rubric) -->
    <div class="lg:col-span-6 space-y-6 flex flex-col">

      <!-- STEP 2: Agente 2 (Paciente Virtual Estandarizado) -->
      <section class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col flex-1 min-h-[460px]">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
          <div class="flex items-center space-x-2">
            <span class="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            <div>
              <h2 class="font-bold text-slate-900 text-base">Paciente Virtual Estandarizado</h2>
              <p class="text-[11px] text-slate-500">Interrogatorio clínico en lenguaje natural coloquial</p>
            </div>
          </div>
<<<<<<< HEAD
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">ChatGPT / OpenAI</span>
        </div>

        <!-- OpenAI Key Status Warning / Telemetry -->
        <div id="patientStatusBanner" class="mb-3 p-2.5 rounded-xl text-xs border {% if openai_key %}bg-emerald-50 border-emerald-200 text-emerald-900{% else %}bg-amber-50 border-amber-300 text-amber-900{% endif %}">
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1.5">
              <span>{% if openai_key %}🟢{% else %}⚠️{% endif %}</span>
              <span id="patientStatusTitle">{% if openai_key %}ChatGPT Real Activo ({{ openai_model }}){% else %}Modo Fallback Mock Activo (OPENAI_API_KEY no configurada){% endif %}</span>
            </span>
            <span id="patientLatencyBadge" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200">{% if openai_key %}Listo{% else %}Mock Local{% endif %}</span>
          </div>
          <p id="patientStatusDesc" class="text-[11px] mt-1 leading-snug text-slate-600">
            {% if openai_key %}Las respuestas del paciente serán generadas dinámicamente por la API de ChatGPT ({{ openai_model }}).{% else %}Para que el paciente responda con ChatGPT real, configure su clave <code>OPENAI_API_KEY</code> en <code>backend/flask-api/.env</code>. Actualmente está respondiendo con el Mock determinista local.{% endif %}
=======
          <span class="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Google Gemini</span>
        </div>

        <!-- Gemini Key Status Warning / Telemetry -->
        <div id="patientStatusBanner" class="mb-3 p-2.5 rounded-xl text-xs border {% if gemini_key %}bg-emerald-50 border-emerald-200 text-emerald-900{% else %}bg-amber-50 border-amber-300 text-amber-900{% endif %}">
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1.5">
              <span>{% if gemini_key %}🟢{% else %}⚠️{% endif %}</span>
              <span id="patientStatusTitle">{% if gemini_key %}Gemini Real Activo ({{ gemini_model }}){% else %}Modo Fallback Mock Activo (GEMINI_API_KEY no configurada){% endif %}</span>
            </span>
            <span id="patientLatencyBadge" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/80 border border-slate-200">{% if gemini_key %}Listo{% else %}Mock Local{% endif %}</span>
          </div>
          <p id="patientStatusDesc" class="text-[11px] mt-1 leading-snug text-slate-600">
            {% if gemini_key %}Las respuestas del paciente serán generadas dinámicamente por la API de Gemini ({{ gemini_model }}), con guardrail anti-fuga de diagnóstico.{% else %}Para que el paciente responda con Gemini real, configure su clave <code>GEMINI_API_KEY</code> en <code>backend/flask-api/.env</code>. Actualmente está respondiendo con el Mock determinista local.{% endif %}
>>>>>>> main
          </p>
        </div>

        <!-- Chat Container -->
        <div id="chatMessages" class="flex-1 overflow-y-auto pr-2 space-y-3 chat-scroll min-h-[260px] max-h-[380px] bg-slate-50/50 p-3 rounded-xl border border-slate-100">
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">🤒</div>
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 max-w-[85%] shadow-xs space-y-1">
              <p class="text-xs text-slate-700">Buenos días doctor(a), me siento muy mal desde hace unas horas y el dolor en el estómago no me deja tranquilo.</p>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Dolor: 8/10</span>
                <span>• Quejumbroso</span>
                <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">Mensaje inicial</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Input Bar -->
        <form id="chatForm" onsubmit="sendPatientMessage(event)" class="mt-3 flex gap-2">
          <input id="chatInput" type="text" placeholder="Escribe tu pregunta clínica (ej: ¿Dónde le duele exactamente y desde qué horas?)..." class="flex-1 text-sm rounded-xl border-slate-200 border p-2.5 focus:ring-2 focus:ring-emerald-500 transition">
          <button type="submit" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition shrink-0 flex items-center gap-1 shadow-sm">
            <span>Enviar</span> 💬
          </button>
        </form>
      </section>

      <!-- Results Display: Evaluation Rubric Card -->
      <section id="evaluationResultsCard" class="hidden bg-white rounded-2xl border border-purple-200 shadow-md p-5 space-y-4">
        <!-- Live Telemetry Banner -->
        <div id="evalTelemetryBanner" class="p-3 rounded-lg text-xs flex flex-col gap-1 border"></div>

        <div class="flex items-center justify-between border-b border-purple-100 pb-3">
          <div class="flex items-center space-x-2">
            <span class="text-xl">🏆</span>
            <div>
              <h3 class="font-bold text-slate-900 text-base">Resultado de la Evaluación Clínica</h3>
              <p class="text-xs text-slate-500">Rúbrica cuantitativa y Detección de Sesgos Cognitivos</p>
            </div>
          </div>
          <div id="finalScoreBadge" class="px-3 py-1 rounded-xl text-lg font-extrabold bg-purple-100 text-purple-800 border border-purple-300">
            -- / 100
          </div>
        </div>

        <!-- 4 Domains Progress -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" id="domainsGrid"></div>

        <!-- Cognitive Biases Card (Dual Process Theory) -->
        <div class="space-y-2 pt-2 border-t border-slate-100">
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <span>🧠</span> Sesgos Cognitivos (Teoría de Procesamiento Dual - Sistema 1 vs 2):
          </h4>
          <div id="biasesContainer" class="space-y-2"></div>
        </div>

        <!-- Strengths and Areas for Improvement -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
          <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <h5 class="font-bold text-emerald-900 flex items-center gap-1 mb-1"><span>✅</span> Fortalezas:</h5>
            <ul id="strengthsList" class="list-disc list-inside space-y-1 text-emerald-800"></ul>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <h5 class="font-bold text-amber-900 flex items-center gap-1 mb-1"><span>💡</span> Áreas de Mejora:</h5>
            <ul id="improvementsList" class="list-disc list-inside space-y-1 text-amber-800"></ul>
          </div>
        </div>

        <!-- Summary text -->
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-700 leading-relaxed" id="feedbackSummaryText"></div>

        <!-- Collapsible JSON Debugger for Evaluation -->
        <details class="text-[11px] bg-slate-100 rounded-lg p-2 border border-slate-200">
          <summary class="cursor-pointer font-bold text-slate-700 hover:text-purple-600">🔍 Ver Telemetría y Rúbrica Completa (Agente 3)</summary>
          <pre id="evalRawJson" class="mt-2 p-2 bg-slate-900 text-purple-300 rounded overflow-x-auto text-[10px] max-h-48 chat-scroll"></pre>
        </details>
      </section>

    </div>

  </main>

  <!-- Notification Toast -->
  <div id="toast" class="fixed bottom-5 right-5 z-50 transform transition-all duration-300 translate-y-20 opacity-0 pointer-events-none px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium"></div>

  <!-- Client-side Application Logic -->
  <script>
    let authToken = localStorage.getItem('clerkship_token') || '';
    let currentCase = null;
    let chatHistory = [];

    // Initialize UI on load
    window.addEventListener('DOMContentLoaded', () => {
      if (authToken) {
        updateAuthBadge(true);
      }
    });

    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.innerText = message;
      toast.className = `fixed bottom-5 right-5 z-50 transform transition-all duration-300 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 ${
        type === 'error' ? 'bg-rose-600 text-white' : type === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
      }`;
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
      }, 3500);
    }

    function updateAuthBadge(isAuth, email = 'sarias202@unab.edu.co') {
      const badge = document.getElementById('authStatusBadge');
      if (isAuth) {
        badge.className = 'text-xs font-medium px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1';
        badge.innerHTML = `<span>🟢 Autenticado: ${email}</span>`;
      } else {
        badge.className = 'text-xs font-medium px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1';
        badge.innerHTML = `<span>⚠️ Sin sesión activa</span>`;
      }
    }

    async function quickLogin() {
      const btn = document.getElementById('quickLoginBtn');
      btn.innerText = 'Autenticando...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'sarias202@unab.edu.co', password: 'Estudiante2026*' })
        });
        const data = await res.json();
        if (res.ok) {
          authToken = data.access_token || (data.tokens && data.tokens.access_token);
          localStorage.setItem('clerkship_token', authToken);
          updateAuthBadge(true, data.user?.email || 'sarias202@unab.edu.co');
          showToast('Sesión iniciada exitosamente como Estudiante UNAB', 'success');
        } else {
          showToast(`Error al iniciar sesión: ${data.message || 'Credenciales inválidas'}`, 'error');
        }
      } catch (err) {
        showToast('Error de conexión con el servidor', 'error');
      } finally {
        btn.innerText = '🔑 Login Rápido';
        btn.disabled = false;
      }
    }

    async function checkAuth() {
      if (!authToken) {
        await quickLogin();
      }
      return !!authToken;
    }

    // --- STEP 1: GENERAR CASO CON GEMINI ---
    async function generateCase() {
      if (!await checkAuth()) return;

      const btn = document.getElementById('generateCaseBtn');
      btn.innerHTML = `<span>⏳ Invocando Agente 1 (Google Gemini)...</span>`;
      btn.disabled = true;

      const specialty = document.getElementById('caseSpecialty').value;
      const difficulty = document.getElementById('caseDifficulty').value;
      const condition = document.getElementById('caseCondition').value;

      try {
        const res = await fetch('/api/agentes/caso', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ specialty, difficulty, condition })
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (pe) {
          showToast(`Error ${res.status}: Respuesta del servidor no es JSON`, 'error');
          return;
        }

        if (!res.ok) {
          showToast(`Error (${res.status}): ${data.message || data.error || 'Error al generar caso'}`, 'error');
          return;
        }

        currentCase = data;
        renderCase(data);

        if (data.is_mock) {
          showToast('Caso cargado en Modo Fallback Mock (Revisar diagnóstico)', 'info');
        } else {
          showToast(`¡Caso generado en vivo con ${data.provider_used || 'Gemini'} [${data.model_used || ''}]!`, 'success');
        }

        // Reset chat with patient
        chatHistory = [];
        const chatBox = document.getElementById('chatMessages');
        chatBox.innerHTML = `
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">🤒</div>
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 max-w-[85%] shadow-xs space-y-1">
              <p class="text-xs text-slate-700">Buenos días doctor(a), ${escapeHtml(data.chief_complaint || 'tengo un malestar intenso y necesito ayuda.')}</p>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Dolor: 8/10</span>
                <span>• Inquieto</span>
                <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono">Mensaje inicial del caso</span>
              </div>
            </div>
          </div>
        `;
      } catch (err) {
        showToast(`Fallo de conexión con Agente 1: ${err.message}`, 'error');
      } finally {
        btn.innerHTML = `<span>✨ Generar Caso Clínico con Gemini</span>`;
        btn.disabled = false;
      }
    }

    function renderCase(c) {
      document.getElementById('caseContainer').classList.remove('hidden');
      document.getElementById('caseIdBadge').innerText = c.case_id || 'CASE-001';
      document.getElementById('caseTitle').innerText = c.title || 'Caso Clínico Simulado';
      document.getElementById('caseChiefComplaint').innerText = `"${c.chief_complaint || ''}"`;
      document.getElementById('casePresentIllness').innerText = c.present_illness || '';

      // Telemetry Banner for Step 1
      const tel = document.getElementById('caseTelemetryBanner');
      if (c.is_mock) {
        tel.className = 'p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1';
        tel.innerHTML = `
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1.5">⚠️ MODO FALLBACK MOCK ACTIVO</span>
            <span class="text-[10px] font-mono bg-amber-200/80 px-2 py-0.5 rounded text-amber-900">MOCK DETERMINISTA</span>
          </div>
          <p class="text-[11px] text-amber-800">El caso fue cargado desde el repositorio de casos locales de respaldo porque el modelo no pudo responder.</p>
          ${c.error_details ? `<div class="mt-1 p-1.5 bg-amber-100/70 rounded text-[10px] font-mono text-amber-900 break-all"><b>Detalle técnico:</b> ${escapeHtml(c.error_details)}</div>` : ''}
        `;
      } else {
        tel.className = 'p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs space-y-1';
        tel.innerHTML = `
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1.5">🟢 MODELO REAL EJECUTADO: ${escapeHtml(c.provider_used || 'Google Gemini')}</span>
            <span class="text-[10px] font-mono bg-emerald-200/80 px-2 py-0.5 rounded text-emerald-900 font-bold">${c.latency_ms || 0} ms</span>
          </div>
          <p class="text-[11px] text-emerald-800">Caso generado dinámicamente por Google Gemini usando el modelo <b>${escapeHtml(c.model_used || 'gemini')}</b>.</p>
        `;
      }

      document.getElementById('caseRawJson').innerText = JSON.stringify(c, null, 2);

      const demo = c.demographics || {};
      document.getElementById('caseDemographics').innerHTML = `
        <span class="px-2 py-0.5 bg-slate-200 rounded font-medium">Edad: ${demo.age || 45} años</span>
        <span class="px-2 py-0.5 bg-slate-200 rounded font-medium">Sexo: ${demo.gender === 'M' ? 'Masculino' : 'Femenino'}</span>
        <span class="px-2 py-0.5 bg-slate-200 rounded font-medium">Ocupación: ${demo.occupation || 'No especificada'}</span>
      `;

      const vs = c.vital_signs || {};
      document.getElementById('vitalSignsGrid').innerHTML = `
        <div class="bg-white border rounded-lg p-1.5"><p class="text-[10px] text-slate-400">PA</p><p class="text-xs font-bold text-slate-800">${vs.blood_pressure || '120/80'}</p></div>
        <div class="bg-white border rounded-lg p-1.5"><p class="text-[10px] text-slate-400">FC</p><p class="text-xs font-bold text-slate-800">${vs.heart_rate || 80} lpm</p></div>
        <div class="bg-white border rounded-lg p-1.5"><p class="text-[10px] text-slate-400">FR</p><p class="text-xs font-bold text-slate-800">${vs.respiratory_rate || 18} rpm</p></div>
        <div class="bg-white border rounded-lg p-1.5"><p class="text-[10px] text-slate-400">Temp</p><p class="text-xs font-bold text-slate-800">${vs.temperature || 37.0} °C</p></div>
        <div class="bg-white border rounded-lg p-1.5"><p class="text-[10px] text-slate-400">SpO2</p><p class="text-xs font-bold text-slate-800">${vs.oxygen_saturation || 98}%</p></div>
      `;
    }

    // --- STEP 2: CHAT CON PACIENTE VIRTUAL (CHATGPT) ---
    async function sendPatientMessage(e) {
      e.preventDefault();
      if (!await checkAuth()) return;

      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      input.focus();

      const chatBox = document.getElementById('chatMessages');

      // Append student message
      chatBox.innerHTML += `
        <div class="flex items-start gap-2.5 justify-end">
          <div class="bg-sky-600 text-white rounded-2xl rounded-tr-sm p-3 max-w-[85%] shadow-xs">
            <p class="text-xs">${escapeHtml(text)}</p>
            <span class="text-[10px] text-sky-200 block text-right mt-1">Doctor (Estudiante)</span>
          </div>
          <div class="w-8 h-8 rounded-full bg-sky-100 text-sky-800 font-bold text-xs flex items-center justify-center shrink-0">👨‍⚕️</div>
        </div>
      `;
      chatBox.scrollTop = chatBox.scrollHeight;

      chatHistory.push({ sender: 'doctor', message: text });

      // Temporary typing bubble
      const typingId = 'typing_' + Date.now();
      chatBox.innerHTML += `
        <div id="${typingId}" class="flex items-start gap-2.5">
          <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">🤒</div>
          <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-2.5 text-xs text-slate-400 italic flex items-center gap-1">
            <span>Paciente formulando respuesta...</span>
          </div>
        </div>
      `;
      chatBox.scrollTop = chatBox.scrollHeight;

      try {
        const res = await fetch('/api/agentes/paciente/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            case_id: currentCase?.case_id || 'CASE-GI-001',
            message: text
          })
        });

        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        const rawText = await res.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (pe) {
          showToast(`Error ${res.status}: Respuesta no es JSON válido`, 'error');
          return;
        }

        if (!res.ok) {
          showToast(`Error (${res.status}): ${data.message || data.error || 'Error al interrogar paciente'}`, 'error');
          return;
        }

        const reply = data.reply || 'Sí doctor.';
        const pain = data.pain_scale_reported ?? 8;
        const emotion = data.emotional_state || 'adolorido';
        const isMock = !!data.is_mock;
        const latency = data.latency_ms ? `${data.latency_ms} ms` : '';
        const model = data.model_used || (isMock ? 'Mock Local' : 'ChatGPT');

        chatHistory.push({ sender: 'patient', message: reply });

        // Update top patient status banner
        const pBanner = document.getElementById('patientStatusBanner');
        const pTitle = document.getElementById('patientStatusTitle');
        const pDesc = document.getElementById('patientStatusDesc');
        const pLat = document.getElementById('patientLatencyBadge');

        if (isMock) {
          pBanner.className = 'mb-3 p-2.5 rounded-xl text-xs border bg-amber-50 border-amber-300 text-amber-900';
          pTitle.innerText = 'Modo Fallback Mock Activo (Agente 2)';
          pDesc.innerHTML = data.error_details ?
            `<b>Causa técnica:</b> ${escapeHtml(data.error_details)}` :
            'Respondiendo mediante reglas heurísticas locales preprogramadas.';
          pLat.innerText = latency ? `${latency} (Mock)` : 'Mock Local';
        } else {
          pBanner.className = 'mb-3 p-2.5 rounded-xl text-xs border bg-emerald-50 border-emerald-200 text-emerald-900';
<<<<<<< HEAD
          pTitle.innerText = `ChatGPT Real Activo: ${model}`;
          pDesc.innerText = 'Respuesta generada en vivo por la API de OpenAI en lenguaje natural.';
=======
          pTitle.innerText = `Gemini Real Activo: ${model}`;
          pDesc.innerText = 'Respuesta generada en vivo por la API de Gemini en lenguaje natural.';
>>>>>>> main
          pLat.innerText = latency;
        }

        const badgeHtml = isMock
          ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 font-mono font-semibold">🟡 Mock Local</span>`
          : `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono font-semibold">🟢 ChatGPT (${escapeHtml(model)}${latency ? ' | ' + latency : ''})</span>`;

        chatBox.innerHTML += `
          <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center shrink-0">🤒</div>
            <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 max-w-[85%] shadow-xs space-y-1.5">
              <p class="text-xs text-slate-700 leading-relaxed">${escapeHtml(reply)}</p>
              <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Dolor: ${pain}/10</span>
                <span>• ${escapeHtml(emotion)}</span>
                ${badgeHtml}
              </div>
            </div>
          </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;
      } catch (err) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        showToast(`Fallo de conexión al comunicar con paciente: ${err.message}`, 'error');
      }
    }

    // --- STEP 3: EVALUAR CON GEMINI ---
    async function evaluateSession() {
      if (!await checkAuth()) return;

      const finalDiag = document.getElementById('evalFinalDiag').value.trim();
      if (!finalDiag) {
        showToast('Por favor escribe tu diagnóstico final definitivo', 'error');
        return;
      }

      const tests = document.getElementById('evalTests').value.split(',').map(s => s.trim()).filter(Boolean);
      const diffs = document.getElementById('evalDifferentials').value.split(',').map(s => s.trim()).filter(Boolean);

      const btn = document.getElementById('evaluateBtn');
      btn.innerHTML = `<span>⏳ Evaluando con Agente 3 (Google Gemini)...</span>`;
      btn.disabled = true;

      try {
        const res = await fetch('/api/agentes/evaluar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            case_id: currentCase?.case_id || 'CASE-GI-001',
            chat_history: chatHistory.length > 0 ? chatHistory : [
              { sender: 'doctor', message: '¿Dónde le duele y desde cuándo?' },
              { sender: 'patient', message: 'En la boca del estómago desde anoche.' }
            ],
            requested_tests: tests,
            differential_diagnoses: diffs,
            final_diagnosis: finalDiag
          })
        });

        const rawText = await res.text();
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (pe) {
          showToast(`Error ${res.status}: Respuesta del evaluador no es JSON válido (${rawText.slice(0, 100)})`, 'error');
          return;
        }

        if (!res.ok) {
          showToast(`Error (${res.status}): ${data.message || data.error || 'Error al evaluar sesión'}`, 'error');
          return;
        }

        renderEvaluation(data);

        if (data.is_mock) {
          showToast('Evaluación generada con Mock de respaldo', 'info');
        } else {
          showToast(`¡Evaluación completada exitosamente con ${data.provider_used || 'Gemini'} [${data.model_used || ''}]!`, 'success');
        }
      } catch (err) {
        showToast(`Fallo de conexión al evaluar: ${err.message}`, 'error');
      } finally {
        btn.innerHTML = `<span>📊 Evaluar Razonamiento Clínico con Gemini</span>`;
        btn.disabled = false;
      }
    }

    function renderEvaluation(evalData) {
      const card = document.getElementById('evaluationResultsCard');
      card.classList.remove('hidden');
      card.scrollIntoView({ behavior: 'smooth' });

      // Telemetry Banner for Step 3
      const tel = document.getElementById('evalTelemetryBanner');
      if (evalData.is_mock) {
        tel.className = 'p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-1';
        tel.innerHTML = `
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1.5">⚠️ EVALUACIÓN POR FALLBACK MOCK</span>
            <span class="text-[10px] font-mono bg-amber-200/80 px-2 py-0.5 rounded text-amber-900">MOCK DETERMINISTA</span>
          </div>
          <p class="text-[11px] text-amber-800">La rúbrica fue evaluada con el motor local de contingencia.</p>
          ${evalData.error_details ? `<div class="mt-1 p-1.5 bg-amber-100/70 rounded text-[10px] font-mono text-amber-900 break-all"><b>Detalle técnico:</b> ${escapeHtml(evalData.error_details)}</div>` : ''}
        `;
      } else {
        tel.className = 'p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs space-y-1';
        tel.innerHTML = `
          <div class="flex items-center justify-between font-bold">
            <span class="flex items-center gap-1.5">🟢 EVALUACIÓN REAL CON GOOGLE GEMINI: ${escapeHtml(evalData.provider_used || 'Google Gemini')}</span>
            <span class="text-[10px] font-mono bg-emerald-200/80 px-2 py-0.5 rounded text-emerald-900 font-bold">${evalData.latency_ms || 0} ms</span>
          </div>
          <p class="text-[11px] text-emerald-800">Evaluación de razonamiento clínico y sesgos cognitivos calculada por el modelo <b>${escapeHtml(evalData.model_used || 'gemini')}</b>.</p>
        `;
      }

      document.getElementById('evalRawJson').innerText = JSON.stringify(evalData, null, 2);

      const score = evalData.final_score ?? 0;
      const scoreBadge = document.getElementById('finalScoreBadge');
      scoreBadge.innerText = `${score} / 100`;

      if (score >= 85) scoreBadge.className = 'px-3 py-1 rounded-xl text-lg font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300';
      else if (score >= 70) scoreBadge.className = 'px-3 py-1 rounded-xl text-lg font-extrabold bg-blue-100 text-blue-800 border border-blue-300';
      else scoreBadge.className = 'px-3 py-1 rounded-xl text-lg font-extrabold bg-amber-100 text-amber-800 border border-amber-300';

      const ds = evalData.domain_scores || {};
      document.getElementById('domainsGrid').innerHTML = `
        <div class="bg-slate-50 border rounded-lg p-2 text-center"><p class="text-[10px] text-slate-500 font-semibold">Anamnesis (30%)</p><p class="text-sm font-extrabold text-slate-800">${ds.anamnesis || 0}</p></div>
        <div class="bg-slate-50 border rounded-lg p-2 text-center"><p class="text-[10px] text-slate-500 font-semibold">Paraclínicos (25%)</p><p class="text-sm font-extrabold text-slate-800">${ds.diagnostic_tests || 0}</p></div>
        <div class="bg-slate-50 border rounded-lg p-2 text-center"><p class="text-[10px] text-slate-500 font-semibold">Diferenciales (20%)</p><p class="text-sm font-extrabold text-slate-800">${ds.differential_hypotheses || 0}</p></div>
        <div class="bg-slate-50 border rounded-lg p-2 text-center"><p class="text-[10px] text-slate-500 font-semibold">Diagnóstico (25%)</p><p class="text-sm font-extrabold text-slate-800">${ds.final_diagnosis || 0}</p></div>
      `;

      // Cognitive Biases
      const biasesBox = document.getElementById('biasesContainer');
      const biases = evalData.detected_biases || [];
      biasesBox.innerHTML = biases.map(b => `
        <div class="p-2.5 rounded-lg border text-xs ${b.detected ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200 text-slate-700'}">
          <div class="flex items-center justify-between font-bold">
            <span>${b.bias_name || 'Sesgo Cognitivo'}</span>
            <span class="px-2 py-0.5 rounded text-[10px] ${b.detected ? 'bg-rose-200 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">${b.detected ? '⚠️ DETECTADO' : '✅ No detectado'}</span>
          </div>
          <p class="text-[11px] mt-1 text-slate-600 leading-relaxed">${b.explanation || ''}</p>
        </div>
      `).join('');

      // Strengths & Improvements
      const strengthsList = document.getElementById('strengthsList');
      strengthsList.innerHTML = (evalData.strengths || ['Interrogatorio ordenado']).map(s => `<li>${escapeHtml(s)}</li>`).join('');

      const improvementsList = document.getElementById('improvementsList');
      improvementsList.innerHTML = (evalData.areas_for_improvement || ['Profundizar en antecedentes']).map(i => `<li>${escapeHtml(i)}</li>`).join('');

      document.getElementById('feedbackSummaryText').innerText = evalData.feedback_summary || 'Evaluación completada exitosamente.';
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  </script>
</body>
</html>
"""


@simulador_bp.route("/simulador", methods=["GET"])
def simulador_interfaz():
    """Renderiza la consola web interactiva para probar el simulador clínico con telemetría de desarrollador."""
    gemini_key = bool(os.getenv("GEMINI_API_KEY", "").strip())
<<<<<<< HEAD
    openai_key = bool(os.getenv("OPENAI_API_KEY", "").strip())
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
=======
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
>>>>>>> main

    return render_template_string(
        SIMULADOR_HTML,
        gemini_key=gemini_key,
<<<<<<< HEAD
        openai_key=openai_key,
        gemini_model=gemini_model,
        openai_model=openai_model,
=======
        gemini_model=gemini_model,
>>>>>>> main
    )

