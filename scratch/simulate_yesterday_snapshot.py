import sys
import os
from datetime import datetime, timedelta
import pytz

# Adiciona o diretório raiz ao path para importar o db
sys.path.append(os.getcwd())
import api.database as db

def simulate_yesterday():
    active_abi = db.get_active_abi()
    if not active_abi:
        print("Nenhum ABI ativo encontrado.")
        return
    
    abi_num = active_abi.get('ABI')
    print(f"Simulando dados para o ABI {abi_num}...")
    
    tz = pytz.timezone('America/Sao_Paulo')
    yesterday = datetime.now(tz) - timedelta(days=1)
    date_str = yesterday.strftime('%Y-%m-%d')
    
    # Busca dados atuais para basear a simulação
    stats = db.get_abi_dashboard_stats()
    clients = stats.get('client_details', [])
    
    print(f"Criando snapshots para {len(clients)} clientes na data {date_str}...")
    
    total_imp = 0
    total_apt = 0
    total_agu = 0
    total_nao = 0
    total_atend = 0
    
    for c in clients:
        c_id = c.get('id')
        if not c_id: continue
        
        # Reduzimos os impugnados em ~15% para simular evolução
        # E aumentamos o aguardando proporcionalmente
        curr_imp = c.get('impugnados', 0)
        curr_agu = c.get('aguardando', 0)
        
        sim_imp = int(curr_imp * 0.85)
        sim_agu = curr_agu + (curr_imp - sim_imp)
        sim_apt = c.get('aptos', 0)
        sim_nao = c.get('nao_impugnando', 0)
        sim_total = c.get('total', 0)
        
        # Save Per-Client
        parent_ref = db.firestore_db.collection('current_abi_evolution').document(str(abi_num)).collection('client_snapshots').document(c_id)
        parent_ref.set({'updated_at': yesterday.strftime('%Y-%m-%d %H:%M:%S'), 'name': c.get('name')}, merge=True)
        
        client_ref = parent_ref.collection('snapshots').document(date_str)
        client_ref.set({
            'date': date_str,
            'impugnados': sim_imp,
            'aptos': sim_apt,
            'aguardando': sim_agu,
            'nao_impugnando': sim_nao,
            'total': sim_total
        })
        
        total_imp += sim_imp
        total_apt += sim_apt
        total_agu += sim_agu
        total_nao += sim_nao
        total_atend += sim_total

    # Save Global
    global_ref = db.firestore_db.collection('current_abi_evolution').document(str(abi_num)).collection('snapshots').document(date_str)
    global_ref.set({
        'date': date_str,
        'impugnados': total_imp,
        'aptos': total_apt,
        'aguardando': total_agu,
        'nao_impugnando': total_nao,
        'total': total_atend
    })
    
    print(f"Sucesso! Snapshots de ontem ({date_str}) criados.")

if __name__ == "__main__":
    simulate_yesterday()
