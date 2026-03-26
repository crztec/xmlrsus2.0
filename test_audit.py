import os
import sys

# Adiciona o diretório atual ao path para importar api.database
sys.path.append(os.getcwd())

try:
    from api import database as db
    from firebase_admin import firestore
    
    print("Testando add_audit_log...")
    res = db.add_audit_log("test@example.com", "Teste de Diagnóstico", "Verificando se o log funciona", "INFO")
    print(f"Resultado add_audit_log: {res}")
    
    print("\nTestando get_audit_logs...")
    logs = db.get_audit_logs(limit=5)
    print(f"Total de logs recuperados: {len(logs)}")
    for l in logs:
        print(f" - {l.get('timestamp')} | {l.get('user')} | {l.get('action')}")

    print("\nVerificando constantes do firestore...")
    try:
        print(f"firestore.Query.DESCENDING: {firestore.Query.DESCENDING}")
    except Exception as e:
        print(f"Erro ao acessar firestore.Query.DESCENDING: {e}")

except Exception as e:
    print(f"Erro no script de diagnóstico: {e}")
    import traceback
    traceback.print_exc()
