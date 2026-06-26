import re
import os
import logging
import requests
import pymssql

logger = logging.getLogger(__name__)

def extract_sql_schema_ddl(conn_params: dict) -> str:
    """
    Connects to SQL Server and extracts database table schema as DDL code block.
    """
    server = conn_params.get("host")
    port = int(conn_params.get("port", 1433))
    database = conn_params.get("database")
    username = conn_params.get("username")
    password = conn_params.get("password")

    try:
        conn = pymssql.connect(
            server=server,
            port=port,
            user=username,
            password=password,
            database=database,
            timeout=15
        )
        cursor = conn.cursor(as_dict=True)

        # Get tables and columns information
        columns_query = """
        SELECT 
            c.TABLE_NAME, 
            c.COLUMN_NAME, 
            c.DATA_TYPE, 
            c.CHARACTER_MAXIMUM_LENGTH,
            c.IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS c
        INNER JOIN INFORMATION_SCHEMA.TABLES t
            ON c.TABLE_CATALOG = t.TABLE_CATALOG
            AND c.TABLE_SCHEMA = t.TABLE_SCHEMA
            AND c.TABLE_NAME = t.TABLE_NAME
        WHERE t.TABLE_TYPE = 'BASE TABLE'
          AND c.TABLE_SCHEMA = 'dbo'
        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;
        """
        cursor.execute(columns_query)
        columns = cursor.fetchall()

        # Get foreign keys information
        fk_query = """
        SELECT 
            tab1.name AS TABLE_NAME,
            col1.name AS COLUMN_NAME,
            tab2.name AS REFERENCED_TABLE_NAME,
            col2.name AS REFERENCED_COLUMN_NAME
        FROM sys.foreign_key_columns fkc
        INNER JOIN sys.tables tab1 ON tab1.object_id = fkc.parent_object_id
        INNER JOIN sys.columns col1 ON col1.object_id = fkc.parent_object_id AND col1.column_id = fkc.parent_column_id
        INNER JOIN sys.tables tab2 ON tab2.object_id = fkc.referenced_object_id
        INNER JOIN sys.columns col2 ON col2.object_id = fkc.referenced_object_id AND col2.column_id = fkc.referenced_column_id;
        """
        cursor.execute(fk_query)
        fkeys = cursor.fetchall()

        cursor.close()
        conn.close()

        # Group data by table
        tables = {}
        for col in columns:
            tname = col["TABLE_NAME"]
            if tname not in tables:
                tables[tname] = {"columns": [], "fkeys": []}
            
            cmax = col["CHARACTER_MAXIMUM_LENGTH"]
            size = f"({cmax})" if cmax and cmax != -1 else ""
            nullability = "NULL" if col["IS_NULLABLE"] == "YES" else "NOT NULL"
            col_def = f"  [{col['COLUMN_NAME']}] {col['DATA_TYPE'].upper()}{size} {nullability}"
            tables[tname]["columns"].append(col_def)
            
        for fk in fkeys:
            tname = fk["TABLE_NAME"]
            if tname in tables:
                fk_def = f"  FOREIGN KEY ([{fk['COLUMN_NAME']}]) REFERENCES [{fk['REFERENCED_TABLE_NAME']}] ([{fk['REFERENCED_COLUMN_NAME']}])"
                tables[tname]["fkeys"].append(fk_def)

        # Build schema as virtual DDL statements
        ddl_statements = []
        for tname, details in tables.items():
            lines = details["columns"] + details["fkeys"]
            stmt = f"CREATE TABLE [{tname}] (\n" + ",\n".join(lines) + "\n);"
            ddl_statements.append(stmt)

        return "\n\n".join(ddl_statements)

    except Exception as e:
        logger.error(f"Erro ao extrair esquema do banco SQL Server: {e}")
        raise Exception(f"Falha ao conectar ou extrair esquema do SQL Server: {str(e)}")

def validate_select_query_only(sql_query: str):
    """
    Validates if a query consists purely of DQL (SELECT) statements.
    Throws ValueError if DML/DDL or any forbidden instruction is found.
    """
    # Remove comments
    clean_sql = re.sub(r'--.*$', '', sql_query, flags=re.MULTILINE)
    clean_sql = re.sub(r'/\*.*?\*/', '', clean_sql, flags=re.DOTALL)
    
    forbidden_keywords = [
        'insert', 'update', 'delete', 'drop', 'alter', 'truncate', 
        'create', 'replace', 'merge', 'exec', 'execute', 'grant', 'revoke'
    ]
    
    words = re.findall(r'\b\w+\b', clean_sql.lower())
    for word in words:
        if word in forbidden_keywords:
            raise ValueError(f"Comando proibido ou destrutivo detectado no SQL: {word.upper()}")
            
    stripped = clean_sql.strip().lower()
    if not (stripped.startswith("select") or stripped.startswith("with")):
        raise ValueError("Apenas consultas de seleção (SELECT) são permitidas para execução.")

def execute_select_query(conn_params: dict, sql_query: str) -> dict:
    """
    Executes a SELECT query on SQL Server with safety checks and a 100-row limit.
    """
    validate_select_query_only(sql_query)
    
    server = conn_params.get("host")
    port = int(conn_params.get("port", 1433))
    database = conn_params.get("database")
    username = conn_params.get("username")
    password = conn_params.get("password")

    try:
        conn = pymssql.connect(
            server=server,
            port=port,
            user=username,
            password=password,
            database=database,
            timeout=15
        )
        cursor = conn.cursor(as_dict=True)
        
        # Enforce maximum return row limit
        cursor.execute(sql_query)
        rows = cursor.fetchmany(100)
        
        # Get columns list
        columns = []
        if cursor.description:
            columns = [desc[0] for desc in cursor.description]
            
        cursor.close()
        conn.close()
        
        # Clean results for JSON response (convert datetimes, bytes, etc.)
        import datetime
        cleaned_rows = []
        for r in rows:
            row_dict = {}
            for col, val in r.items():
                if isinstance(val, (datetime.datetime, datetime.date)):
                    row_dict[col] = val.isoformat()
                elif isinstance(val, bytes):
                    row_dict[col] = val.decode("utf-8", errors="replace")
                else:
                    row_dict[col] = val
            cleaned_rows.append(row_dict)

        return {"columns": columns, "rows": cleaned_rows}

    except Exception as e:
        logger.error(f"Erro ao executar query SELECT no SQL Server: {e}")
        raise Exception(f"Erro na execução da query no SQL Server: {str(e)}")

def generate_sql_query(messages: list, schema: str, provider: str, model_name: str, api_key: str = None, reasoning_level: str = "standard") -> str:
    """
    Calls Gemini or Claude to translate natural language prompt into SQL query based on DDL schema.
    Maintains chat context.
    """
    system_prompt = (
        "Você é um assistente de banco de dados (Microsoft SQL Server / T-SQL).\n"
        "Você tem acesso ao esquema do banco de dados (enviado junto à primeira mensagem do usuário).\n"
        "Você pode conversar com o usuário em português para tirar dúvidas, sugerir otimizações e explicar como os dados estão estruturados.\n\n"
        "REGRAS DE GERAÇÃO DE SQL:\n"
        "1. Se o usuário pedir para você criar, gerar, corrigir ou escrever uma query/consulta SQL, forneça a resposta dentro de blocos de código markdown (```sql ... ```).\n"
        "2. É terminantemente PROIBIDO gerar comandos DML ou DDL de modificação ou destruição (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, REPLACE, MERGE). Gere apenas comandos de leitura (SELECT, CTEs, etc).\n"
        "3. Você é livre para responder perguntas normais e enviar o código SQL no meio da sua resposta."
    )

    if not messages:
        raise ValueError("A lista de mensagens não pode estar vazia.")

    if provider.lower() == "gemini":
        key = api_key or os.environ.get("GEMINI_API_KEY", "")
        if not key:
            raise ValueError("Chave de API do Gemini (GEMINI_API_KEY) não configurada.")
        
        # Map models
        api_model = "gemini-2.5-flash"
        if "pro" in model_name.lower() or "3.1" in model_name.lower():
            api_model = "gemini-2.5-pro"
        elif reasoning_level.lower() == "extended" or reasoning_level.lower() == "estendido":
            api_model = "gemini-2.0-flash-thinking-exp-01-21"

        gemini_messages = []
        for i, m in enumerate(messages):
            role = "model" if m["role"] == "assistant" else "user"
            content = m["content"]
            if i == 0 and role == "user":
                content = f"Contexto - Esquema de Banco de Dados:\n{schema}\n\n---\n\nPergunta do Usuário:\n{content}"
            gemini_messages.append({
                "role": role,
                "parts": [{"text": content}]
            })
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{api_model}:generateContent?key={key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": gemini_messages,
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "temperature": 0.3
            }
        }
        
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        if resp.status_code != 200:
            raise Exception(f"Erro na API do Gemini: {resp.text}")
            
        result = resp.json()
        generated_text = result["candidates"][0]["content"]["parts"][0]["text"]
        
    elif provider.lower() in ["openai", "chatgpt"]:
        key = api_key or os.environ.get("OPENAI_API_KEY", "")
        if not key:
            raise ValueError("Chave de API da OpenAI (OPENAI_API_KEY) não configurada.")
            
        api_model = "gpt-4o-mini"
        if "gpt-4o" in model_name.lower() and "mini" not in model_name.lower():
            api_model = "gpt-4o"
        elif "o1" in model_name.lower():
            api_model = "o1-mini" if "mini" in model_name.lower() else "o1"
        elif "o3" in model_name.lower():
            api_model = "o3-mini"

        openai_messages = []
        # o1 and o3 models don't support system prompts in the same way, but recent API updates allow 'developer' or 'system' role.
        # We will use 'system' for standard models, and 'user' for o1 if needed, but standard chat completions usually accepts 'system'.
        if not api_model.startswith("o1") and not api_model.startswith("o3"):
            openai_messages.append({"role": "system", "content": system_prompt})
            
        for i, m in enumerate(messages):
            role = m["role"]
            content = m["content"]
            if i == 0 and role == "user":
                schema_ctx = f"Contexto - Esquema de Banco de Dados:\n{schema}\n\n---\n\n"
                if api_model.startswith("o1") or api_model.startswith("o3"):
                    # O1/O3 prefer instructions in the user prompt
                    content = f"{system_prompt}\n\n{schema_ctx}Pergunta do Usuário:\n{content}"
                else:
                    content = f"{schema_ctx}Pergunta do Usuário:\n{content}"
            openai_messages.append({"role": role, "content": content})
            
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": api_model,
            "messages": openai_messages,
        }
        # o1 models don't support temperature
        if not api_model.startswith("o1") and not api_model.startswith("o3"):
            payload["temperature"] = 0.3
            
        if reasoning_level.lower() == "extended" or reasoning_level.lower() == "high":
            if api_model.startswith("o1") or api_model.startswith("o3"):
                payload["reasoning_effort"] = "high"
        
        resp = requests.post(url, json=payload, headers=headers, timeout=90)
        if resp.status_code != 200:
            raise Exception(f"Erro na API da OpenAI: {resp.text}")
            
        result = resp.json()
        generated_text = result["choices"][0]["message"]["content"]

    elif provider.lower() == "deepseek":
        key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        if not key:
            raise ValueError("Chave de API da DeepSeek (DEEPSEEK_API_KEY) não configurada.")
            
        api_model = "deepseek-chat"
        if "reasoner" in model_name.lower() or "r1" in model_name.lower():
            api_model = "deepseek-reasoner"

        ds_messages = [{"role": "system", "content": system_prompt}]
        for i, m in enumerate(messages):
            role = m["role"]
            content = m["content"]
            if i == 0 and role == "user":
                content = f"Contexto - Esquema de Banco de Dados:\n{schema}\n\n---\n\nPergunta do Usuário:\n{content}"
            ds_messages.append({"role": role, "content": content})
            
        url = "https://api.deepseek.com/chat/completions"
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": api_model,
            "messages": ds_messages,
            "temperature": 0.3 if api_model == "deepseek-chat" else 0.0 # R1 might require fixed temp or ignoring it
        }
        
        resp = requests.post(url, json=payload, headers=headers, timeout=90)
        if resp.status_code != 200:
            raise Exception(f"Erro na API da DeepSeek: {resp.text}")
            
        result = resp.json()
        generated_text = result["choices"][0]["message"]["content"]
        
    else:
        raise ValueError(f"Provedor de IA desconhecido: {provider}")

    return generated_text.strip()
