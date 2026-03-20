import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime

# Import database module for testing
import api.database as db

def test_get_all_clients_metrics(mock_db):
    """
    Testa se o cálculo de total_abis (únicas) e ultima_importacao funciona.
    """
    # 1. Configurar Mock de Clientes
    mock_client = MagicMock()
    mock_client.id = "client_1"
    mock_client.to_dict.return_value = {
        "razao_social": "Cliente Teste",
        "cnpj": "12.345.678/0001-90"
    }
    mock_db.collection('client_configs').stream.return_value = [mock_client]

    # 2. Configurar Mock de Arquivos (task_files)
    # ABI 123 (duplicada) e ABI 456
    file_1 = MagicMock()
    file_1.to_dict.return_value = {
        "numero_abi": "123",
        "data_processamento": "2026-03-20 10:00:00",
        "status_importacao": "SUCESSO"
    }
    file_2 = MagicMock()
    file_2.to_dict.return_value = {
        "numero_abi": "123",
        "data_processamento": "2026-03-20 11:00:00",
        "status_importacao": "SUCESSO"
    }
    file_3 = MagicMock()
    file_3.to_dict.return_value = {
        "numero_abi": "456",
        "data_processamento": "2026-03-20 09:00:00",
        "status_importacao": "SUCESSO"
    }
    
    # Mock da query chain
    mock_db.collection('task_files').where.return_value.where.return_value.stream.return_value = [file_1, file_2, file_3]

    # 3. Executar função
    clients = db.get_all_clients()

    # 4. Asserts
    assert len(clients) == 1
    client = clients[0]
    assert client['name'] == "Cliente Teste"
    # Deve contar unique ABIs: "123" e "456" -> total 2
    assert client['total_abis'] == 2
    # Deve pegar a última data formatada: 20/03/2026 11:00
    assert client['ultima_importacao'] == "20/03/2026 11:00"

def test_update_client_config(mock_db):
    """
    Testa a atualização de configurações de cliente.
    """
    update_data = {
        "cnpj": "99.888.777/0001-00",
        "registro_ans": "12345",
        "endereco": "Rua Teste, 100"
    }
    
    success = db.update_client_config("client_id_123", update_data)
    
    assert success is True
    # Verifica se document().set() foi chamado com os dados corretos (merge=True)
    mock_db.collection('client_configs').document.assert_called_with("client_id_123")
    args, kwargs = mock_db.collection('client_configs').document().set.call_args
    assert args[0]['cnpj'] == update_data['cnpj']
    assert kwargs['merge'] is True

def test_get_all_clients_no_files(mock_db):
    """
    Testa se funciona corretamente quando o cliente não tem nenhum arquivo.
    """
    mock_client = MagicMock()
    mock_client.id = "no_files_client"
    mock_client.to_dict.return_value = {"razao_social": "Cliente Novo"}
    mock_db.collection('client_configs').stream.return_value = [mock_client]
    mock_db.collection('task_files').where.return_value.where.return_value.stream.return_value = []

    clients = db.get_all_clients()
    
    assert clients[0]['total_abis'] == 0
    assert clients[0]['ultima_importacao'] == "-"
