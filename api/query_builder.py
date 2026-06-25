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

def generate_sql_query(prompt: str, schema: str, provider: str, model_name: str, api_key: str = None) -> str:
    """
    Calls Gemini or Claude to translate natural language prompt into SQL query based on DDL schema.
    """
    system_prompt = (
        "Você é um engenheiro de dados e DBA experiente em Microsoft SQL Server (T-SQL).\n"
        "Seu objetivo é gerar estritamente consultas SELECT (DQL) compatíveis com SQL Server com base no esquema de banco de dados fornecido.\n\n"
        "REGRAS DE SEGURANÇA E RETORNO CRÍTICAS:\n"
        "1. É terminantemente PROIBIDO gerar comandos DML ou DDL de modificação ou destruição, tais como INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, REPLACE ou MERGE.\n"
        "2. Responda APENAS com o código SQL bruto, sem nenhuma explicação em português, inglês ou formatação adicional.\n"
        "3. Não inclua blocos de código em markdown (como ```sql ou ```). Retorne o SQL puro diretamente como resposta de texto."
    )

    if provider.lower() == "gemini":
        key = api_key or os.environ.get("GEMINI_API_KEY", "")
        if not key:
            raise ValueError("Chave de API do Gemini (GEMINI_API_KEY) não configurada.")
        
        # Map models
        api_model = "gemini-2.5-flash"
        if "pro" in model_name.lower() or "3.1" in model_name.lower():
            api_model = "gemini-2.5-pro"
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{api_model}:generateContent?key={key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": f"Pergunta: {prompt}\n\nEsquema de Banco de Dados:\n{schema}"}]
                }
            ],
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "temperature": 0.0
            }
        }
        
        resp = requests.post(url, json=payload, headers=headers, timeout=45)
        if resp.status_code != 200:
            raise Exception(f"Erro na API do Gemini: {resp.text}")
            
        result = resp.json()
        generated_text = result["candidates"][0]["content"]["parts"][0]["text"]
        
    elif provider.lower() == "claude":
        key = api_key or os.environ.get("CLAUDE_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            raise ValueError("Chave de API do Claude (CLAUDE_API_KEY) não configurada.")
            
        # Map models
        api_model = "claude-3-5-sonnet-20241022"
        if "opus" in model_name.lower():
            api_model = "claude-3-opus-20240229"
            
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        payload = {
            "model": api_model,
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": f"Pergunta: {prompt}\n\nEsquema de Banco de Dados:\n{schema}"}
            ],
            "temperature": 0.0
        }
        
        resp = requests.post(url, json=payload, headers=headers, timeout=45)
        if resp.status_code != 200:
            raise Exception(f"Erro na API do Claude: {resp.text}")
            
        result = resp.json()
        generated_text = result["content"][0]["text"]
        
    else:
        raise ValueError(f"Provedor de IA desconhecido: {provider}")

    # Sanitization (just in case LLM ignored rules and wrapped in markdown blocks)
    generated_text = re.sub(r'^```sql\s*', '', generated_text, flags=re.IGNORECASE)
    generated_text = re.sub(r'^```\s*', '', generated_text)
    generated_text = re.sub(r'\s*```$', '', generated_text)
    
    return generated_text.strip()
