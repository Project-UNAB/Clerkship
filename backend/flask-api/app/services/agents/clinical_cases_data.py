"""
Clinical cases dataset for gastrointestinal pathologies.

Serves as the knowledge base for:
- Agente 1 (Case Generator) to retrieve/synthesize realistic vignettes.
- Agente 2 (Virtual Patient) to answer anamnesis questions in character.
- Agente 3 (Clinical Evaluator) to contrast student performance against Ground Truth.
"""

from typing import Dict, List, Any
from app.schemas.agentes import (
    GeneratedCaseResponse,
    GroundTruth,
    PatientDemographics,
    VitalSigns,
)

CLINICAL_CASES_DATA: Dict[str, Dict[str, Any]] = {
    "CASE-GI-001": {
        "case_id": "CASE-GI-001",
        "title": "Dolor abdominal agudo tras ingesta copiosa en paciente masculino",
        "specialty": "Gastroenterología",
        "difficulty": "MEDIUM",
        "condition": "Pancreatitis Aguda",
        "demographics": {
            "age": 45,
            "gender": "M",
            "occupation": "Conductor de transporte intermunicipal",
        },
        "chief_complaint": "Doctor, me empezó un dolor insoportable en la boca del estómago que se me va a la espalda.",
        "present_illness": (
            "Paciente masculino de 45 años consulta al servicio de urgencias por cuadro clínico de 12 horas de evolución, "
            "caracterizado por dolor abdominal de inicio súbito, localizado en epigastrio, de intensidad 9/10 en escala análoga visual, "
            "de tipo transfictivo/opresivo, con irradiación en banda o hemicinturón hacia el dorso y región lumbar. "
            "El dolor se desencadenó aproximadamente 3 horas después de una comida copiosa rica en grasas (frituras y cerdo) "
            "acompañada de dos cervezas. Se asocia a náuseas persistentes y múltiples episodios de vómito alimentario y biliar (en 5 ocasiones) "
            "que no alivian el dolor. Manifiesta que el dolor empeora al acostarse boca arriba y mejora levemente al inclinarse hacia adelante "
            "(posición en gatillo o mahometana). Niega fiebre cuantificada, ictericia franca previa o cambios en el hábito intestinal."
        ),
        "medical_history": {
            "pathological": "Colelitiasis diagnosticada hace 8 meses por ecografía (no intervenida por demoras administrativas). Dislipidemia mixta.",
            "surgical": "Apendicectomía a los 18 años sin complicaciones.",
            "pharmacological": "Atorvastatina 20 mg/día (toma irregular). Omeprazol 20 mg/día ocasional. Tomó ibuprofeno 400 mg hace 6 horas sin mejoría.",
            "allergies": "Niega alergias medicamentosas.",
            "habits": "Consumo de alcohol social ocasional (1-2 cervezas cada fin de semana). Tabaquismo inactivo (lo dejó hace 5 años).",
            "family": "Padre hipertenso, madre con colecistectomía por litiasis biliar.",
        },
        "vital_signs": {
            "blood_pressure": "130/85",
            "heart_rate": 104,
            "respiratory_rate": 20,
            "temperature": 37.8,
            "oxygen_saturation": 96,
        },
        "physical_exam": {
            "general": "Paciente diaforético, con facie álgica y posición antálgica encorvada hacia adelante. Lúcido, orientado en las 3 esferas.",
            "head_neck": "Mucosas orales secas, normocoloreadas. Escleras anictéricas.",
            "cardiopulmonary": "Ruidos cardíacos taquicárdicos pero rítmicos, no se auscultan soplos ni galope. Murmullo vesicular conservado en ambos campos pulmonares, sin sobreagregados.",
            "abdomen": "Abdomen globoso a expensas de panículo adiposo, dolor exquisito a la palpación superficial y profunda en epigastrio y mesogastrio. Resistencia muscular voluntaria por dolor. Ruidos hidroaéreos disminuidos. No hay irritación peritoneal franca (Blumberg negativo). Signos de Cullen y Grey-Turner negativos.",
            "extremities": "Extremidades íntegras, llenado capilar de 2 segundos, pulsos periféricos presentes y simétricos, sin edema.",
            "neurological": "Glasgow 15/15, sin focalización motora ni sensitiva.",
        },
        "ground_truth": {
            "definitive_diagnosis": "Pancreatitis aguda de etiología biliar (litiásica)",
            "key_diagnostic_tests": [
                "Lipasa sérica",
                "Amilasa sérica",
                "Ecografía hepatobiliar / abdominal",
                "Hemograma completo",
                "Perfil hepático (ALT, AST, Bilirrubinas, Fosfatasa Alcalina)",
                "Función renal (BUN, Creatinina) y electrolitos",
            ],
            "acceptable_differentials": [
                "Colecistitis aguda",
                "Coledocolitiasis con colangitis",
                "Úlcera péptica perforada o penetrada",
                "Isquemia mesentérica",
                "Infarto agudo de miocardio de cara diafragmática / inferior",
            ],
            "clinical_summary": (
                "Cuadro de pancreatitis aguda litiásica confirmado al cumplir al menos dos de los tres criterios de Atlanta revisados: "
                "1) Dolor típico epigástrico transfictivo irradiado al dorso con posición antálgica; "
                "2) Elevación de lipasa y/o amilasa sérica > 3 veces el límite superior normal; "
                "3) Hallazgos imagenológicos compatibles (edema peripancreático en TAC o ecografía que además evidencia litiasis biliar). "
                "El manejo inicial prioritario incluye resucitación hídrica guiada por metas (Lactato de Ringer), analgesia multimodal "
                "y estratificación temprana de severidad (BISAP / APACHE II)."
            ),
        },
        "dialogue_patterns": {
            "dolor": "Doctor, el dolor es tremendo, como una puñalada viva justo en la boca del estómago. Siento que me atraviesa y me sale por la espalda como si me apretara un cinturón.",
            "intensidad": "Es un 9 sobre 10, doctor. Casi no puedo respirar hondo del dolor tan bravo.",
            "comienzo": "Empezó hace unas 12 horas, más o menos a las 7 de la noche, después de haberme comido una lechona con frituras en una fiesta familiar.",
            "alivio": "Si me acuesto boca arriba me pongo peor. Siento un pequeño alivio cuando me siento y me doblo hacia adelante abrazando las piernas.",
            "vomito": "Sí señor, he vomitado como unas 5 veces. Primero boté la comida y luego puro líquido amarillo verdoso y amargo, pero no me alivió para nada.",
            "antecedentes": "Hace unos meses me dijeron que tenía piedritas en la vesícula en una ecografía de control, pero no me alcancé a operar por citas de la EPS.",
            "medicamentos": "Tomé una pasta de ibuprofeno que tenía en la casa hace unas 6 horas a ver si me calmaba, pero no me hizo ni cosquillas. De resto solo tomo atorvastatina para el colesterol.",
            "alcohol": "Me tomé un par de cervezas con la comida grasosa, pero yo no tomo todos los días, solo socialmente de vez en cuando.",
            "fiebre": "Siento el cuerpo caliente y destemplado, pero no me puse el termómetro en la casa.",
            "deposiciones": "No he hecho del cuerpo hoy doctor, ni tampoco me han salido gases fácilmente.",
            "alergias": "No doctor, no soy alérgico a ningún remedio que yo sepa.",
        },
    },

    "CASE-GI-002": {
        "case_id": "CASE-GI-002",
        "title": "Dolor en fosa ilíaca derecha de inicio periumbilical en paciente joven",
        "specialty": "Gastroenterología",
        "difficulty": "EASY",
        "condition": "Apendicitis Aguda",
        "demographics": {
            "age": 22,
            "gender": "F",
            "occupation": "Estudiante universitaria de Ingeniería",
        },
        "chief_complaint": "Doctor, tengo un dolor bajito en el lado derecho que cada vez que camino o toso me duele más.",
        "present_illness": (
            "Paciente femenina de 22 años acude a urgencias por cuadro clínico de 18 horas de evolución. "
            "Inició con sensación de malestar abdominal difuso, mal localizado en mesogastrio/región periumbilical, "
            "asociado a anorexia marcada y náuseas. Aproximadamente 8 horas después, el dolor migró y se fijó en la fosa ilíaca derecha, "
            "tornándose de tipo punzante, continuo y progresivo en intensidad (7/10). Empeora ostensiblemente con la deambulación, la tos "
            "y los movimientos bruscos. Presentó un vómito de contenido gástrico hace 4 horas y sensación de alza térmica no cuantificada. "
            "Niega sintomatología urinaria (disuria, polaquiuria) y refiere fecha de última menstruación regular hace 14 días."
        ),
        "medical_history": {
            "pathological": "Niega enfermedades crónicas conocidas.",
            "surgical": "Niega antecedentes quirúrgicos.",
            "pharmacological": "Acetaminofén 500 mg una tableta hace 4 horas con alivio mínimo y transitorio.",
            "allergies": "Alergia cutánea a la penicilina (presentó urticaria en la infancia).",
            "habits": "No fuma, no consume bebidas alcohólicas ni sustancias psicoactivas.",
            "family": "Sin antecedentes familiares de relevancia quirúrgica.",
        },
        "vital_signs": {
            "blood_pressure": "110/70",
            "heart_rate": 98,
            "respiratory_rate": 18,
            "temperature": 38.2,
            "oxygen_saturation": 98,
        },
        "physical_exam": {
            "general": "Paciente febril al tacto, camina a paso lento con mano apoyada sobre la fosa ilíaca derecha y marcha antálgica. Lúcida y colaboradora.",
            "head_neck": "Lengua saburral, mucosas ligeramente secas.",
            "cardiopulmonary": "Ruidos cardíacos rítmicos sin soplos. Campos pulmonares bien ventilados.",
            "abdomen": "Plano, dolor exquisito y focalizado en el punto de McBurney. Signo de Blumberg (rebote peritoneal) francamente positivo en FID. Signo de Rovsing positivo (dolor en FID al comprimir FII). Signo del Psoas positivo. Resistencia muscular involuntaria en fosa ilíaca derecha. Ruidos hidroaéreos disminuidos en cuadrantes derechos.",
            "pelvic": "Puñopercusión lumbar bilateral negativa. Sin signos de flujo vaginal anormal al interrogatorio.",
            "neurological": "Alerta, orientada en tiempo, espacio y persona.",
        },
        "ground_truth": {
            "definitive_diagnosis": "Apendicitis aguda supurativa / fase inflamatoria",
            "key_diagnostic_tests": [
                "Hemograma completo (leucocitosis con neutrofilia y desviación a la izquierda)",
                "Proteína C Reactiva (PCR cuantitativa)",
                "Parcial de orina / Uroanálisis (descarte de infección urinaria o hematuria)",
                "Prueba de embarazo (Beta-hCG en sangre u orina para descarte de ectópico)",
                "Ecografía apendicular / abdominal o TAC de abdomen con contraste",
            ],
            "acceptable_differentials": [
                "Infección de vías urinarias / Pielonefritis aguda",
                "Quiste ovárico roto o torsión anexial ovárica derecha",
                "Enfermedad pélvica inflamatoria (EPI)",
                "Embarazo ectópico derecho",
                "Adenitis mesentérica",
            ],
            "clinical_summary": (
                "Cronología clásica de Murphy en apendicitis aguda: dolor visceral periumbilical que migra a somático parietal en FID, "
                "con anorexia, náuseas, vómito y fiebre. Examen físico con signos de irritación peritoneal focal (McBurney, Blumberg, Rovsing). "
                "En mujeres jóvenes en edad fértil es indispensable descartar patología ginecológica y embarazo antes de la conducta quirúrgica."
            ),
        },
        "dialogue_patterns": {
            "dolor": "Doctora/Doctor, al principio me dolía alrededor del ombligo, como un empacho o llenura. Pero anoche se me bajó y se me clavó en el lado derecho de la pelvis y ahí sigue doliéndome punzante.",
            "intensidad": "Es un dolor de 7 u 8 sobre 10, no me deja pararme derecha.",
            "tos": "¡Uy sí doctor! Si toso o si el carro salta en un bache siento que se me va a reventar por dentro esa zona.",
            "comienzo": "Empezó ayer como al mediodía con falta de apetito. No pude ni almorzar.",
            "fiebre": "He sentido escalofríos y me tomé la temperatura hace una hora y marcaba 38.2 en el termómetro digital.",
            "orina": "No doctor, no me arde al orinar ni voy más seguido de lo normal.",
            "regla": "Mi último período fue hace 14 días exactos, soy muy puntual cada 28 días. No creo que esté embarazada.",
            "medicamentos": "Solo una pasta de acetaminofén que me dio mi mamá hace un rato, pero no me calmó nada.",
            "alergias": "Soy alérgica a la penicilina, de chiquita me dio un brote y ronchas con una inyección.",
            "vomito": "Tuve náuseas todo el tiempo y vomité una vez lo poquito que tenía en el estómago.",
        },
    },

    "CASE-GI-003": {
        "case_id": "CASE-GI-003",
        "title": "Melena, hematemesis y compromiso hemodinámico en adulto mayor consumidor de AINEs",
        "specialty": "Gastroenterología",
        "difficulty": "HARD",
        "condition": "Hemorragia de Vías Digestivas Altas",
        "demographics": {
            "age": 62,
            "gender": "M",
            "occupation": "Agricultor pensionado",
        },
        "chief_complaint": "Doctor, he estado botando popó negro como brea y hoy vomité sangre con conchos de café.",
        "present_illness": (
            "Paciente masculino de 62 años traído por sus familiares a urgencias por cuadro de 48 horas de evolución consistente en "
            "evacuaciones diarreicas fétidas, de consistencia pastosa y coloración negra brillante tipo brea (melena), en número de 4 episodios. "
            "La familia nota marcada palidez cutánea y astenia severa. En la mañana del ingreso presenta un episodio de vómito con restos hemáticos "
            "oscuros (en cuncho de café / hematemesis) y un episodio de presíncope (mareo intenso con pérdida transitoria de la estabilidad postural) "
            "al levantarse de la cama. Como antecedente de importancia, refiere diagnóstico de gonartrosis bilateral severa para la cual toma "
            "naproxeno 500 mg cada 12 horas e ibuprofeno 600 mg por automedicación desde hace 4 meses sin protectores gástricos."
        ),
        "medical_history": {
            "pathological": "Osteoartrosis de rodillas severa de 5 años de evolución. Hipertensión arterial en manejo.",
            "surgical": "Colecistectomía laparoscópica hace 10 años.",
            "pharmacological": "Naproxeno 500 mg cada 12h + Ibuprofeno 600 mg rescates frecuentes. Losartán 50 mg/día.",
            "allergies": "Niega alergias medicamentosas.",
            "habits": "Consumo de café 3 tazas al día. Niega tabaquismo ni etilismo activo.",
            "family": "Hermano mayor fallecido por cáncer gástrico a los 70 años.",
        },
        "vital_signs": {
            "blood_pressure": "90/60",
            "heart_rate": 118,
            "respiratory_rate": 22,
            "temperature": 36.4,
            "oxygen_saturation": 94,
        },
        "physical_exam": {
            "general": "Paciente en decúbito supino, pálido (palidez mucocutánea generalizada grado III/IV), sudoroso, con frialdad distal y debilidad motora. Conectado con el entorno pero con lentitud psicomotora.",
            "head_neck": "Mucosas orales secas, palidez conjuntival acentuada. No ingurgitación yugular.",
            "cardiopulmonary": "Taquicardia sinusal, ruidos cardíacos de tono aumentado, soplo sistólico funcional eyectivo II/VI en foco aórtico secundario a anemia aguda. Campos pulmonares limpios.",
            "abdomen": "Blando, depresible, leve dolor difuso a la palpación en epigastrio sin defensa ni signos de irritación peritoneal. No hay visceromegalias ni circulación colateral en cabeza de medusa.",
            "rectal": "Tacto rectal con ampolla ocupada por deposición melénica franca, fétida, negra y pegajosa en el guante explorador.",
            "extremities": "Extremidades frías, pulsos pedios débiles, llenado capilar de 3 a 4 segundos.",
            "neurological": "Somnoliento pero orientable. Escala de Glasgow 14/15.",
        },
        "ground_truth": {
            "definitive_diagnosis": "Hemorragia de vías digestivas altas no variceal secundaria a úlcera péptica gástrica/duodenal inducida por AINEs",
            "key_diagnostic_tests": [
                "Esofagogastroduodenoscopia (EDA / Endoscopia de vías digestivas altas) precoz (<24h)",
                "Hemograma completo con hematocrito y hemoglobina seriada",
                "Clasificación de grupo sanguíneo, factor Rh y pruebas cruzadas para reserva de glóbulos rojos",
                "Tiempos de coagulación (TP, TTP, INR)",
                "BUN y Creatinina (relación BUN/Creatinina elevada > 30 sugerente de sangrado digestivo alto)",
                "Gases arteriales y lactato sérico para perfusión tisular",
            ],
            "acceptable_differentials": [
                "Hemorragia de vías digestivas altas variceal por hepatopatía crónica oculta",
                "Síndrome de Mallory-Weiss (desgarro de la unión esofagogástrica)",
                "Cáncer gástrico ulcerado y sangrante",
                "Gastropatía erosiva difusa por estrés o fármacos",
                "Lesión de Dieulafoy",
            ],
            "clinical_summary": (
                "Hemorragia digestiva alta grave con inestabilidad hemodinámica (hipotensión, taquicardia > 100 lpm, ortostatismo, palidez). "
                "Etiología claramente asociada al consumo crónico de dosis elevadas de dos AINEs concurrentes sin inhibidor de bomba de protones. "
                "Conducta inmediata crítica: asegurar dos accesos venosos periféricos de gran calibre (14-16G), infusión vigorosa de cristaloides, "
                "bolo de inhibidor de bomba de protones (Omeprazol 80 mg IV bolo seguido de infusión o 40 mg IV c/12h), reserva transfusional "
                "y endoscopia digestiva alta urgente diagnóstica y hemostática una vez estabilizado."
            ),
        },
        "dialogue_patterns": {
            "dolor": "En la boca del estómago me venía molestando como un ardor o quemazón desde hace semanas, pero no era tan fuerte. Lo grave es la debilidad y el mareo tan tremendo que tengo.",
            "sangrado": "Doctor, desde antier estoy haciendo popó negro, negro como carbón y huele horrible. Y hoy en la mañana vomité un líquido oscuro con conchos como de café molido.",
            "mareo": "Fui a pararme para ir al baño y se me puso la vista negra, me dio sudor frío y me caí sobre la cama.",
            "medicamentos": "Mire doctor, como me duelen tanto las rodillas por el desgaste, el médico del pueblo me mandó naproxeno, pero cuando no aguanto me tomo también ibuprofeno de 600... Llevo tomando eso diario como 4 meses seguidos.",
            "protector": "No me mandaron omeprazol ni nada para proteger el estómago, solo las pastas del dolor.",
            "alcohol": "No doctor, hace más de diez años no tomo licor ni fumo.",
            "comida": "No he tenido nada de apetito, solo he tomado agua de panela pero hasta el agua me da náuseas.",
            "antecedentes": "Sufro de la tensión y me tomo mi pastilla de Losartán por las mañanas.",
        },
    },

    "CASE-GI-004": {
        "case_id": "CASE-GI-004",
        "title": "Dolor en hipocondrio derecho, fiebre e ictericia leve en mujer multípara",
        "specialty": "Gastroenterología",
        "difficulty": "MEDIUM",
        "condition": "Colecistitis Aguda",
        "demographics": {
            "age": 49,
            "gender": "F",
            "occupation": "Ama de casa y comerciante",
        },
        "chief_complaint": "Doctor, tengo un dolor insoportable debajo de las costillas al lado derecho y me dio fiebre con temblor.",
        "present_illness": (
            "Paciente femenina de 49 años acude por dolor abdominal de 14 horas de evolución en hipocondrio derecho. "
            "El dolor inició tipo cólico tras una cena pesada con comida chatarra y evolucionó a continuo, punzante e invalidante (8/10), "
            "irradiado a la espalda baja del omóplato derecho y hombro ipsilateral. Se acompaña de picos febriles cuantificados en 38.5 °C "
            "con escalofríos, náuseas y 3 vómitos de contenido bilioso. Manifiesta haber notado leve tinte amarillento en los ojos al mirarse "
            "al espejo en la mañana. Refiere antecedentes de cólicos biliares a repetición durante los últimos dos años que cedían con antiespasmódicos."
        ),
        "medical_history": {
            "pathological": "Historia de cólicos biliares a repetición. Obesidad grado I (IMC 31 kg/m²). Multiparidad (G4P4).",
            "surgical": "Ligadura de trompas posparto hace 15 años.",
            "pharmacological": "Hioscina simple (butilbromuro) tomada hace 8 horas sin respuesta.",
            "allergies": "Niega alergias conocidas.",
            "habits": "Sedentarismo, dieta rica en carbohidratos y grasas saturadas. No consume tabaco ni alcohol.",
            "family": "Madre y tía materna colecistectomizadas por litiasis vesicular sintomática.",
        },
        "vital_signs": {
            "blood_pressure": "135/85",
            "heart_rate": 100,
            "respiratory_rate": 19,
            "temperature": 38.5,
            "oxygen_saturation": 97,
        },
        "physical_exam": {
            "general": "Paciente febril, diaforética, con facie dolorosa e intranquila.",
            "head_neck": "Ictericia escleral leve visible a la luz natural. Mucosa oral semihúmeda.",
            "cardiopulmonary": "Ruidos rítmicos, normofonéticos. Sin estertores ni sibilancias.",
            "abdomen": "Globoso a expensas de panículo adiposo. Dolor franco a la palpación en hipocondrio derecho. Maniobra de Murphy positiva: al palpar profundamente el reborde costal derecho y solicitar una inspiración profunda, la paciente corta bruscamente la respiración por dolor intenso. Resistencia muscular involuntaria en hemiabdomen superior derecho. Sin signos francos de peritonitis generalizada.",
            "extremities": "Eutróficas, sin edemas.",
            "neurological": "Alerta y orientada.",
        },
        "ground_truth": {
            "definitive_diagnosis": "Colecistitis aguda calculosa complicada con sospecha de coledocolitiasis secundaria",
            "key_diagnostic_tests": [
                "Ecografía hepatobiliar y de páncreas (engrosamiento de pared vesicular >4mm, litiasis vesicular, líquido perivesicular, Murphy ecográfico)",
                "Hemograma completo (leucocitosis con neutrofilia)",
                "Perfil hepático completo (Bilirrubina total y directa, Fosfatasa Alcalina, GGT, ALT, AST)",
                "Amilasa y Lipasa sérica (para descartar pancreatitis biliar concomitante)",
                "Colangiorresonancia magnética (CRMN) si persiste sospecha de coledocolitiasis",
            ],
            "acceptable_differentials": [
                "Coledocolitiasis sintomática / Colangitis aguda",
                "Cólico biliar simple prolongado",
                "Pancreatitis aguda biliar",
                "Hepatitis aguda",
                "Absceso hepático piógeno",
                "Úlcera duodenal perforada",
            ],
            "clinical_summary": (
                "Cuadro clínico de colecistitis aguda litiásica (criterios de Tokio 2018): 1) Signos locales de inflamación (Murphy positivo, dolor en hipocondrio derecho); "
                "2) Signos sistémicos de inflamación (fiebre 38.5 °C, leucocitosis esperada); 3) Hallazgos imagenológicos de ecografía vesicular. "
                "La presencia de ictericia escleral obliga a evaluar la vía biliar principal para descartar coledocolitiasis asociada o compresión extrínseca (Síndrome de Mirizzi)."
            ),
        },
        "dialogue_patterns": {
            "dolor": "Doctor, tengo una punzada terrible al lado derecho debajo de las costillas. Siento como si me quemara y me pasa hacia la espalda, a la paletilla derecha.",
            "intensidad": "Es fuertísimo, doctor, un 8 o 9 de 10. Si respiro hondo me corta la respiración del dolor.",
            "fiebre": "Anoche empecé con un temblor en todo el cuerpo y me medí la temperatura y estaba en 38.5 grados con mucho sudor.",
            "ojos": "En la mañana cuando me lavé la cara me vi la parte blanca de los ojos un poquito amarillenta, mi esposo también me lo notó.",
            "orina": "He notado la orina un poco más oscura de lo normal, como té cargado.",
            "vomito": "He vomitado tres veces doctor, pura baba amarga verde-amarilla que me deja la garganta raspada.",
            "comida": "Comí una hamburguesa con papas y gaseosa tarde en la noche con mis hijos y a las dos horas me prendió este dolor.",
            "antecedentes": "A mí ya me habían dado dolores parecidos antes cuando comía grasa, pero con dos gotas de buscapina se me quitaban a las dos horas. Esta vez llevo 14 horas y nada que se me pasa.",
            "hijos": "Tengo 4 hijos doctor, todos partos normales.",
        },
    },
}


# Mismos 8 subtemas de gastroenterología del prototipo original
# (jrojas710/simulador-clinico-gastro) que este proyecto adoptó como fuente
# de verdad para el Agente 1 — mantiene el alcance de la plataforma acotado
# a gastroenterología en vez de "cualquier especialidad".
GASTRO_SUBTEMAS: List[str] = [
    "Enfermedad por reflujo gastroesofágico (ERGE)",
    "Gastritis y enfermedad ulcerosa péptica",
    "Síndrome de intestino irritable (SII)",
    "Enfermedad inflamatoria intestinal (Crohn / Colitis ulcerosa)",
    "Pancreatitis aguda",
    "Hepatitis / hepatopatía",
    "Hemorragia digestiva alta o baja",
    "Colelitiasis / colecistitis aguda",
]


def get_case_by_id(case_id: str) -> Dict[str, Any]:
    """Retrieve case data dict by ID or return default CASE-GI-001."""
    return CLINICAL_CASES_DATA.get(case_id, CLINICAL_CASES_DATA["CASE-GI-001"])


def get_case_as_response(case_id: str, include_ground_truth: bool = True) -> GeneratedCaseResponse:
    """Build a GeneratedCaseResponse from internal dictionary."""
    data = get_case_by_id(case_id)
    demographics = PatientDemographics(**data["demographics"])
    vital_signs = VitalSigns(**data["vital_signs"])
    ground_truth = GroundTruth(**data["ground_truth"]) if include_ground_truth else None

    return GeneratedCaseResponse(
        case_id=data["case_id"],
        title=data["title"],
        specialty=data["specialty"],
        difficulty=data["difficulty"],
        demographics=demographics,
        chief_complaint=data["chief_complaint"],
        present_illness=data["present_illness"],
        medical_history=data["medical_history"],
        vital_signs=vital_signs,
        physical_exam=data["physical_exam"],
        ground_truth=ground_truth,
        provider_used="Mock (Modo Local)",
        model_used="deterministic-mock",
        is_mock=True,
        error_details=None,
    )

