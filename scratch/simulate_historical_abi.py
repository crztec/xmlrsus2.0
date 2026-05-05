import sys
import os
from datetime import datetime, timedelta
import pytz

# Adiciona o diretório raiz ao path para importar o db
sys.path.append(os.getcwd())
import api.database as db

def simulate_historical_abi():
    print("Simulando ABI 104 histórico...")
    
    # Busca alguns clientes para popular o histórico
    stats = db.get_abi_dashboard_stats()
    clients = stats.get('client_details', [])
    if not clients:
        print("Nenhum cliente encontrado para simular histórico.")
        return
    
    # Selecionamos os top 10 clientes para não poluir demais, mas mostrar volume
    target_clients = clients[:10]
    
    tz = pytz.timezone('America/Sao_Paulo')
    archived_date = datetime.now(tz) - timedelta(days=45) # Simula finalizado há 45 dias
    
    for c in target_clients:
        c_id = c.get('id')
        if not c_id: continue
        
        # Dados fakes para o ABI 104
        total = 100 + (c_id.__hash__() % 50)
        impugnados = int(total * 0.7)
        aptos = int(total * 0.1)
        aguardando = 0 # Histórico deve estar zerado
        nao_impugnando = total - impugnados - aptos
        
        # Caminho: client_configs/{c_id}/abi_historical_stats/ABI_104
        hist_ref = db.firestore_db.collection('client_configs').document(c_id).collection('abi_historical_stats').document('ABI_104')
        
        hist_data = {
            'abi': "104",
            'archived_at': archived_date,
            'total': total,
            'impugnados': impugnados,
            'aptos': aptos,
            'aguardando': aguardando,
            'nao_impugnando': nao_impugnando,
            'status': 'Finalizado'
        }
        
        hist_ref.set(hist_data)
        print(f"Histórico ABI 104 criado para: {c.get('name')}")

    print("Sucesso! ABI 104 simulado no histórico.")

if __name__ == "__main__":
    simulate_historical_abi()
