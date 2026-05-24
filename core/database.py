from pathlib import Path
import json
import sqlite3

DB_PATH = Path("data/kai.db")
BASE_DIR = Path(__file__).resolve().parent.parent


def get_connection() -> sqlite3.Connection:
    """Return the connection.

    Returns:
        sqlite3.Connection
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _build_initial_config() -> dict[str, str]:
    """Build the default configuration written on first database initialization.

    Returns:
        dict[str, str]
    """
    google_scopes = [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/tasks",
        "https://www.googleapis.com/auth/calendar",
    ]
    llm_context_length = 8192
    tool_activation_keywords = [
        "correo",
        "correos",
        "email",
        "emails",
        "gmail",
        "bandeja",
        "remitente",
        "asunto",
        "hilo",
        "hilos",
        "mensaje",
        "mensajes",
        "responde",
        "responder",
        "contesta",
        "contestar",
        "envía un correo",
        "enviar correo",
        "manda un correo",
        "mandar correo",
        "calendario",
        "evento",
        "eventos",
        "reunión",
        "reunion",
        "meet",
        "google meet",
        "agenda",
        "cita",
        "quedar",
        "disponible",
        "ocupado",
        "hueco",
        "recordatorio",
        "recordatorios",
        "recuérdame",
        "recuerdame",
        "tarea",
        "tareas",
        "tasks",
        "pendiente",
        "pendientes",
        "drive",
        "archivo",
        "archivos",
        "documento",
        "documentos",
        "pdf",
        "descarga",
        "enlace",
    ]
    google_credentials_file = str(BASE_DIR / "credentials.json")
    google_token_file = str(BASE_DIR / "token.json")

    email_max_total_size_attachment = 18 * 1024 * 1024

    system_prompt_default = """
    Eres Kai IA, una secretaria personal de alto nivel: amable, eficiente y con gran tacto.
    Tu tono debe ser profesional pero cercano, siempre educada y dispuesta a facilitar la vida del usuario.

    PROHIBICIONES CRÍTICAS:
    - Nunca escribas JSON manual de herramientas dentro del texto.
    - Cuando uses herramientas, debes usar function calling real del modelo (tool_calls).
    - Si el usuario pide crear, modificar, borrar, enviar o consultar algo que requiere herramientas, está prohibido afirmar que se hizo sin resultado real de tool.
    - Si una tool devuelve un enlace, úsalo exactamente. Si no existe enlace en el resultado, no lo inventes.
    - No inventes IDs, enlaces, correos, eventos, archivos ni destinatarios.
    - No uses HTML en las respuestas al usuario; responde en Markdown.

    REGLAS DE COMPORTAMIENTO:
    1. Sé directa, clara y cortés.
    2. Nunca menciones que eres una IA.
    3. Mantén continuidad con el contexto previo.
    4. Responde siempre en Markdown.
    5. Si el usuario pide varias acciones, ejecútalas paso a paso.
    6. Si una tool ya devolvió información suficiente, no vuelvas a llamarla sin motivo.

    USO DE TOOLS:
    - Usa tools solo cuando el usuario necesite acceder a datos externos o realizar acciones.
    - Si necesitas usar una tool, tu mensaje puede tener content vacío.
    - Tras recibir el resultado de la tool, responde al usuario de forma natural.
    - No escribas nunca {"tool_call": ...} como texto.

    REGLAS DE CALENDARIO:
    - Usa freebusy_query únicamente cuando el usuario pida comprobar disponibilidad o antes de agendar una cita, reunión o compromiso.
    - Antes de modificar o borrar eventos mencionados por fecha, nombre o lugar, usa primero find_calendar_events para obtener el event_id real.
    - No inventes event_id.
    - Si el usuario propone una fecha u hora de forma condicional, por ejemplo "pregúntale si puede", "si le viene bien", "si acepta", primero consulta o envía un correo. No crees la reunión hasta recibir confirmación.

    REGLAS DE CORREO:
    - Si el usuario pide responder a un correo o usa expresiones como "respóndele", "contéstale", "dile", "pregúntale", debes preferir reply_email si existe un correo o hilo previo relevante en la conversación.
    - Usa send_email solo para correos nuevos cuando no exista un mensaje previo al que responder.
    - Siempre habla en nombre del usuario, salvo que el usuario pida explícitamente hablar en nombre de Kai.
    - Si el usuario pide información sobre sus correos, debes usar una tool de Gmail antes de responder.
    - Para peticiones como "mis correos", "últimos correos", "emails recientes", usa la tool adecuada de lectura de Gmail.
    - Si el usuario pide detalles de un correo concreto, busca primero el correo y luego usa get_full_email.
    - Si una tool de envío de correo devuelve éxito, no vuelvas a enviar otro correo similar en el mismo turno salvo que el usuario haya pedido varios correos distintos o la tool anterior haya fallado.

    REGLAS DE REFERENCIAS:
    - Cuando el usuario diga "él", "ella", "contéstale", "pregúntale", "envíaselo" o expresiones similares, debes resolver esa referencia usando la última persona, correo o entidad relevante obtenida en la conversación o mediante tools.
    - No sustituyas automáticamente esa referencia por el propio usuario.

    REGLAS DE FECHAS:
    - Si el usuario dice una hora sin aclarar, asume horario de tarde solo si el contexto lo sugiere claramente; si no, usa la interpretación más razonable según el contexto.
    - Si el usuario menciona una cita previa para modificarla, busca primero el evento real antes de actuar.

    Para expresiones matemáticas SIEMPRE usa sintaxis LaTeX estándar:
    - Fórmulas inline: $x^2 + y^2$
    - Fórmulas en bloque: $$\int_0^1 f(x)\,dx$$
    - NUNCA uses corchetes [f(x)] ni paréntesis \(f(x)\) para matemáticas.
    - NUNCA uses \displaystyle fuera de un bloque $$.

    """.strip()

    model_name = "qwen2.5-32b-instruct"
    temperature = 0.0

    return {
        "google_scopes": json.dumps(google_scopes, ensure_ascii=False),
        "google_credentials_file": google_credentials_file,
        "google_token_file": google_token_file,
        "email_max_total_size_attachment": str(email_max_total_size_attachment),
        "system_prompt_default": system_prompt_default,
        "model_name": model_name,
        "temperature": str(temperature),
        "llm_context_length": str(llm_context_length),
        "tool_activation_keywords": json.dumps(
            tool_activation_keywords, ensure_ascii=False
        ),
        "lmstudio_timeout": "600",
        "tool_approval_timeout": "120",
        "shell_command_timeout": "10",
    }


def _seed_initial_config(cur: sqlite3.Cursor) -> None:
    """Insert missing default configuration values into the database.

    Args:
        cur: Database cursor used for inserts and schema setup.

    Returns:
        None
    """
    initial_config = _build_initial_config()

    for key, value in initial_config.items():
        if key == "tool_activation_keywords":
            cur.execute("SELECT value FROM app_config WHERE key = ?", (key,))
            row = cur.fetchone()
            if row and row["value"]:
                try:
                    existing = json.loads(row["value"])
                    defaults = json.loads(value)
                except json.JSONDecodeError:
                    existing = []
                    defaults = json.loads(value)

                if isinstance(existing, list):
                    merged = list(existing)
                    for keyword in defaults:
                        if keyword not in merged:
                            merged.append(keyword)

                    cur.execute(
                        """
                        UPDATE app_config
                        SET value = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE key = ?
                        """,
                        (json.dumps(merged, ensure_ascii=False), key),
                    )
                    continue

        cur.execute(
            """
            INSERT INTO app_config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO NOTHING
        """,
            (key, value),
        )


def init_db() -> None:
    """Create the local database schema and seed default values.

    Returns:
        None
    """
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_sessions (
        chat_id TEXT PRIMARY KEY,
        title TEXT,
        system_prompt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chat_id) REFERENCES chat_sessions(chat_id) ON DELETE CASCADE
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_profile (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS chat_context (
        chat_id TEXT NOT NULL,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(chat_id, key),
        FOREIGN KEY(chat_id) REFERENCES chat_sessions(chat_id) ON DELETE CASCADE
    )
    """)

    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at
    ON chat_messages(chat_id, created_at)
    """)

    _seed_initial_config(cur)

    conn.commit()
    conn.close()
