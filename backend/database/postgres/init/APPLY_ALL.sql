-- ============================================================
-- APPLY_ALL.sql — script consolidado, generado automáticamente
-- Concatena 00-extensions.sql .. 18-triggers_extended.sql en orden.
-- Pensado para pegarse una sola vez en el SQL Editor de Supabase.
-- No editar directamente: los cambios reales van en cada archivo
-- numerado individual; este archivo se puede regenerar.
-- ============================================================

-- ─── 00-extensions.sql ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 01-users.sql ───────────────────────────────────────────────
-- NOTA (modificado): se agregó la columna "username" (el "@sarias202" que
-- sale del correo institucional antes del @, ej. sarias202@unab.edu.co).
-- id (UUID) sigue siendo el identificador real: es la llave que amarra
-- Postgres con Mongo (sender_id en messages, etc.) y nunca cambia. username
-- es solo para mostrar en la UI y para buscar usuarios dentro de la
-- plataforma — por eso es UNIQUE (no puede repetirse) pero sí se puede
-- editar sin romper ninguna relación, porque nada más lo referencia como FK.

CREATE TYPE user_role AS ENUM (
    'STUDENT',
    'TEACHER'
);

CREATE TABLE users (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    username VARCHAR(50) NOT NULL UNIQUE,

    first_name VARCHAR(100) NOT NULL,

    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255) NOT NULL UNIQUE,

    password_hash TEXT NOT NULL,

    role user_role NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

);
-- ─── 02-students.sql ───────────────────────────────────────────────
-- NOTA (modificado): "semester" pasó de NOT NULL a nullable. Se declaró
-- obligatorio en la versión original, pero hoy no hay ninguna lógica en el
-- backend que lo use (no filtra dificultad de casos ni nada parecido) — es
-- solo un dato que el estudiante puede declarar, no debería bloquear el
-- registro de nadie. Si en el futuro se usa para recomendar/filtrar casos
-- clínicos por nivel del estudiante, se puede volver a exigir en ese momento.

CREATE TABLE students (

    user_id UUID PRIMARY KEY,

    student_code VARCHAR(50) UNIQUE NOT NULL,

    semester SMALLINT,

    CONSTRAINT fk_student_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

-- ─── 03-teachers.sql ───────────────────────────────────────────────
CREATE TABLE teachers (

    user_id UUID PRIMARY KEY,

    department VARCHAR(150),

    CONSTRAINT fk_teacher_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);
-- ─── 04-courses.sql ───────────────────────────────────────────────
CREATE TABLE courses (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    teacher_id UUID NOT NULL,

    name VARCHAR(150) NOT NULL,

    description TEXT,

    academic_period VARCHAR(50),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_course_teacher
        FOREIGN KEY (teacher_id)
        REFERENCES teachers(user_id)
        ON DELETE CASCADE

);
-- ─── 05-students_courses.sql ───────────────────────────────────────────────
CREATE TABLE student_courses (

    student_id UUID NOT NULL,

    course_id UUID NOT NULL,

    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (student_id, course_id),

    CONSTRAINT fk_sc_student
        FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sc_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE CASCADE

);
-- ─── 06-consultations.sql ───────────────────────────────────────────────
CREATE TYPE consultation_status AS ENUM (

    'IN_PROGRESS',

    'COMPLETED',

    'ABANDONED'

);

CREATE TYPE difficulty_level AS ENUM (

    'EASY',

    'MEDIUM',

    'HARD'

);

CREATE TABLE consultations (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    student_id UUID NOT NULL,

    course_id UUID NOT NULL,

    title VARCHAR(255) NOT NULL,

    specialty VARCHAR(100) NOT NULL,

    difficulty difficulty_level NOT NULL,

    status consultation_status NOT NULL DEFAULT 'IN_PROGRESS',

    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    finished_at TIMESTAMP,

    score NUMERIC(5,2),

    CONSTRAINT fk_consultation_student
        FOREIGN KEY (student_id)
        REFERENCES students(user_id),

    CONSTRAINT fk_consultation_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)

);
-- ─── 07-ai_evaluations.sql ───────────────────────────────────────────────
CREATE TABLE ai_evaluations (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    consultation_id UUID NOT NULL UNIQUE,

    final_score NUMERIC(5,2),

    feedback_summary TEXT,

    execution_time_seconds NUMERIC(10,2),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_ai_consultation
        FOREIGN KEY (consultation_id)
        REFERENCES consultations(id)
        ON DELETE CASCADE

);
-- ─── 08-articles.sql ───────────────────────────────────────────────
-- NOTA (modificado): tabla ampliada para la Biblioteca real del frontend
-- (frontend/src/pages/contenido/BibliotecaPage.tsx). Se agregó el ENUM
-- article_type y las columnas type, specialty, source, year, pages y
-- created_by, que corresponden a los campos que ya existen en los datos
-- mock de esa página. La columna "category" original se conserva (texto
-- libre), pero el filtro real de la UI usa "type".

CREATE TYPE article_type AS ENUM (

    'LIBRO',

    'GUIA',

    'ENSAYO',

    'PROTOCOLO',

    'CASO'

);

CREATE TABLE articles (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    type article_type NOT NULL,

    title VARCHAR(255) NOT NULL,

    authors TEXT,

    category VARCHAR(100),

    specialty VARCHAR(100),

    source VARCHAR(255),

    year SMALLINT,

    pages SMALLINT,

    description TEXT,

    url TEXT NOT NULL,

    created_by UUID,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_article_teacher
        FOREIGN KEY (created_by)
        REFERENCES teachers(user_id)
        ON DELETE SET NULL

);

-- ─── 09-triggers.sql ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS
$$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_articles_updated_at
BEFORE UPDATE ON articles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ─── 10-article_tags.sql ───────────────────────────────────────────────
CREATE TABLE article_tags (

    article_id UUID NOT NULL,

    tag VARCHAR(50) NOT NULL,

    PRIMARY KEY (article_id, tag),

    CONSTRAINT fk_tag_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE CASCADE

);

-- ─── 11-student_library.sql ───────────────────────────────────────────────
CREATE TYPE shelf_status AS ENUM (

    'NEXT',

    'FINISHED'

);

CREATE TABLE student_library (

    student_id UUID NOT NULL,

    article_id UUID NOT NULL,

    status shelf_status NOT NULL DEFAULT 'NEXT',

    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (student_id, article_id),

    CONSTRAINT fk_library_student
        FOREIGN KEY (student_id)
        REFERENCES students(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_library_article
        FOREIGN KEY (article_id)
        REFERENCES articles(id)
        ON DELETE CASCADE

);

-- ─── 12-ai_agents.sql ───────────────────────────────────────────────
CREATE TABLE ai_agents (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    name VARCHAR(150) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- ─── 13-conversations.sql ───────────────────────────────────────────────
CREATE TYPE conversation_type AS ENUM (

    'DIRECT',

    'GROUP',

    'PUBLIC'

);

-- ai_agent_id: se llena solo cuando la conversación es con un agente IA de
-- Clerkship (no con otro usuario humano). course_id se llena solo cuando la
-- conversación es un grupo de discusión ligado a un curso.

CREATE TABLE conversations (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    type conversation_type NOT NULL,

    name VARCHAR(150),

    course_id UUID,

    ai_agent_id UUID,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_conversation_course
        FOREIGN KEY (course_id)
        REFERENCES courses(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_conversation_ai_agent
        FOREIGN KEY (ai_agent_id)
        REFERENCES ai_agents(id)
        ON DELETE SET NULL

);

-- ─── 14-conversation_participants.sql ───────────────────────────────────────────────
CREATE TABLE conversation_participants (

    conversation_id UUID NOT NULL,

    user_id UUID NOT NULL,

    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    last_read_at TIMESTAMP,

    PRIMARY KEY (conversation_id, user_id),

    CONSTRAINT fk_participant_conversation
        FOREIGN KEY (conversation_id)
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_participant_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

-- ─── 15-community_posts.sql ───────────────────────────────────────────────
CREATE TABLE community_posts (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    author_id UUID NOT NULL,

    content TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_post_author
        FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

-- ─── 16-community_comments.sql ───────────────────────────────────────────────
CREATE TABLE community_comments (

    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    post_id UUID NOT NULL,

    author_id UUID NOT NULL,

    content TEXT NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_comment_post
        FOREIGN KEY (post_id)
        REFERENCES community_posts(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comment_author
        FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

-- ─── 17-community_likes.sql ───────────────────────────────────────────────
CREATE TABLE community_likes (

    post_id UUID NOT NULL,

    user_id UUID NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (post_id, user_id),

    CONSTRAINT fk_like_post
        FOREIGN KEY (post_id)
        REFERENCES community_posts(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_like_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

-- ─── 18-triggers_extended.sql ───────────────────────────────────────────────
-- NOTA: reutiliza la función update_updated_at_column() definida en
-- 09-triggers.sql. Va en un archivo aparte (no dentro del 09) porque
-- conversations y community_posts se crean en archivos posteriores al 09,
-- y los scripts se ejecutan en orden por nombre de archivo — el trigger
-- no puede crearse antes de que exista la tabla.

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


CREATE TRIGGER trg_community_posts_updated_at
BEFORE UPDATE ON community_posts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();



-- ─── 19-users-verification-avatar.sql ──────────────────────────────────────
-- Verificación de correo (código de 6 dígitos vía Mailgun) + avatar DiceBear
-- guardado como SVG real, elegido/personalizado por el usuario en el registro.

ALTER TABLE users
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN verification_code VARCHAR(6),
    ADD COLUMN verification_code_expires_at TIMESTAMP,
    ADD COLUMN verification_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN avatar_svg TEXT;


-- ─── 20-users-mailbox.sql ───────────────────────────────────────────────────
-- Buzón real (Mailgun) — dirección real {username}@clerk-ship.online una vez
-- que el usuario autoriza crearla.

ALTER TABLE users
    ADD COLUMN mailbox_created BOOLEAN NOT NULL DEFAULT FALSE;


-- ─── 21-document-folders.sql ────────────────────────────────────────────────
-- Carpetas de documentos del Dashboard, con color propio. El contenido real
-- de los documentos vive en Mongo (colección "documents"), esta tabla solo
-- maneja la carpeta (dueño, nombre, color).

CREATE TABLE document_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#0284C7',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_folder_owner
        FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_document_folders_owner ON document_folders(owner_user_id);


-- ─── 22-document-folders-nesting.sql ───────────────────────────────────────
-- Permite crear una carpeta DENTRO de otra (subcarpetas). NULL = raíz.

ALTER TABLE document_folders
    ADD COLUMN parent_folder_id UUID NULL;

ALTER TABLE document_folders
    ADD CONSTRAINT fk_folder_parent
        FOREIGN KEY (parent_folder_id)
        REFERENCES document_folders(id)
        ON DELETE CASCADE;

CREATE INDEX idx_document_folders_parent ON document_folders(parent_folder_id);


-- ─── 23-simulador-adaptativo.sql ────────────────────────────────────────────
ALTER TABLE consultations
    ADD COLUMN IF NOT EXISTS subtema VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_consultations_student_subtema
    ON consultations(student_id, subtema);

CREATE TABLE IF NOT EXISTS referencias_clinicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subtema VARCHAR(150) NOT NULL,
    contenido TEXT NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referencias_clinicas_subtema ON referencias_clinicas(subtema);

INSERT INTO referencias_clinicas (subtema, contenido)
SELECT * FROM (VALUES
    ('Enfermedad por reflujo gastroesofagico (ERGE)', 'Pirosis retroesternal y regurgitacion acida son los sintomas cardinales; empeoran en decubito y tras comidas copiosas o irritantes. Signos de alarma que ameritan endoscopia: disfagia, perdida de peso, anemia, hemorragia digestiva.'),
    ('Gastritis y enfermedad ulcerosa peptica', 'Dolor epigastrico urente asociado a la ingesta (mejora con alimento en ulcera duodenal, empeora en ulcera gastrica). Factores de riesgo principales: infeccion por H. pylori y uso de AINEs. Alarma: hemorragia digestiva, perdida de peso, anemia.'),
    ('Sindrome de intestino irritable (SII)', 'Dolor abdominal recurrente asociado a cambios en la frecuencia o consistencia de las deposiciones, sin hallazgos estructurales en estudios. Los criterios de Roma IV exigen sintomas al menos 1 dia por semana en los ultimos 3 meses.'),
    ('Enfermedad inflamatoria intestinal (Crohn / Colitis ulcerosa)', 'Diarrea cronica, a veces con sangre (mas tipica en colitis ulcerosa), dolor abdominal, perdida de peso y fatiga. Puede asociar manifestaciones extraintestinales articulares, cutaneas u oculares.'),
    ('Pancreatitis aguda', 'Dolor epigastrico intenso irradiado en banda hacia la espalda, de inicio agudo, frecuentemente asociado a litiasis biliar o consumo de alcohol. Se acompana de nauseas y vomito; la amilasa/lipasa elevadas apoyan el diagnostico.'),
    ('Hepatitis / hepatopatia', 'Ictericia, coluria, acolia, fatiga y malestar general. Puede haber dolor en hipocondrio derecho. Causas comunes: viral, autoinmune, toxica/medicamentosa, metabolica.'),
    ('Hemorragia digestiva alta o baja', 'Hematemesis o melena sugieren origen alto; hematoquecia sugiere origen bajo (aunque un sangrado alto masivo tambien puede presentarse asi). Signos de inestabilidad hemodinamica (taquicardia, hipotension) definen la urgencia del caso.'),
    ('Colelitiasis / colecistitis aguda', 'Dolor tipo colico en hipocondrio derecho o epigastrio, frecuentemente tras comidas grasas, con posible irradiacion a escapula derecha. Colecistitis aguda anade fiebre y signo de Murphy positivo.'),
    ('Colelitiasis / colecistitis aguda', 'Leucocitosis y PCR elevada apoyan colecistitis aguda; la ecografia abdominal muestra engrosamiento de la pared vesicular, calculos y liquido perivesicular.')
) AS v(subtema, contenido)
WHERE NOT EXISTS (SELECT 1 FROM referencias_clinicas LIMIT 1);
