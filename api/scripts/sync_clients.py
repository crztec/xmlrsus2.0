import os
import sys

# Adiciona o diretório raiz ao path para importar api.database
sys.path.append(os.getcwd())


import api.database as db

clients_data = [
    ("Unimed Cabo Frio", "https://rsuscabofrio.cubeti.com.br/"),
    ("Unimed Ferj", "https://rsusferj.cubeti.com.br/"),
    ("Unimed Marquês de Valença", "https://rsusmarquesdevalenca.cubeti.com.br/"),
    ("Unimed Noroeste Fluminense", "https://rsusnoroestefluminense.cubeti.com.br/"),
    ("Unimed Costa Verde", "https://rsuscostaverde.cubeti.com.br/"),
    ("Unimed Costa do Sol", "https://rsuscostadosol.cubeti.com.br/"),
    ("Unimed Centro Sul Fluminense", "https://rsuscentrosulfluminense.cubeti.com.br/"),
    ("Unimed Três Rios", "https://rsustresrios.cubeti.com.br/"),
    ("Unimed Araruama", "https://rsusararuama.cubeti.com.br/"),
    ("Unimed Resende", "https://rsusresende.cubeti.com.br/"),
    ("Unimed Norte Fluminense", "https://rsusnortefluminense.cubeti.com.br/"),
    ("Unimed Barra Mansa", "https://rsusbarramansa.cubeti.com.br/"),
    ("Unimed Petrópolis", "https://rsuspetropolis.cubeti.com.br/"),
    ("Unimed Volta Redonda", "https://rsusvoltaredonda.cubeti.com.br/"),
    ("Unimed Nova Friburgo", "https://rsusnovafriburgo.cubeti.com.br/"),
    ("Unimed Leste Fluminense", "https://rsuslestefluminense.cubeti.com.br/"),
    ("Unimed Campos", "https://rsuscampos.cubeti.com.br/"),
    ("Unimed Paraná", "https://rsusparana.cubeti.com.br/"),
    ("Unimed Norte do Paraná", "https://rsusnortedoparana.cubeti.com.br/"),
    ("Unimed Norte Pioneiro", "https://rsusnortepioneiro.cubeti.com.br/"),
    ("Unimed Oeste do Paraná", "https://rsusoestedoparana.cubeti.com.br/"),
    ("Unimed Noroeste do Paraná", "https://rsusnoroestedoparana.cubeti.com.br/"),
    ("Unimed Maringá", "https://rsusmaringa.cubeti.com.br/"),
    ("Unimed Cascavel", "https://rsuscascavel.cubeti.com.br/"),
    ("Unimed Cianorte", "https://rsuscianorte.cubeti.com.br/"),
    ("Unimed Apucarana", "https://rsusapucarana.cubeti.com.br/"),
    ("Unimed Campo Mourão", "https://rsuscampomourao.cubeti.com.br/"),
    ("Unimed Paranavaí", "https://rsusparanavai.cubeti.com.br/"),
    ("Unimed Foz do Iguaçu", "https://rsusfozdoiguacu.cubeti.com.br/"),
    ("Unimed Paranaguá", "https://rsusparanagua.cubeti.com.br/"),
    ("Unimed Guarapuava", "https://rsusguarapuava.cubeti.com.br/"),
    ("Unimed Costa Oeste", "https://rsuscostaoeste.cubeti.com.br/"),
    ("Unimed Pato Branco", "https://rsuspatobranco.cubeti.com.br/"),
    ("Unimed Francisco Beltrão", "https://rsusfranciscobeltrao.cubeti.com.br/"),
    ("Unimed Ponta Grossa", "https://rsuspontagrossa.cubeti.com.br/"),
    ("Unimed Goiânia", "https://rsusgoiania.cubeti.com.br/"),
    ("Unimed Itumbiara", "https://rsusitumbiara.cubeti.com.br/"),
    ("Unimed Catalão", "https://rsusunicat.cubeti.com.br/"),
    ("Unimed Anápolis", "https://rsusanapolis.cubeti.com.br/"),
    ("Unimed Rio Verde", "https://rsusrioverde.cubeti.com.br/"),
    ("Unimed Caldas Novas", "https://rsuscaldasnovas.cubeti.com.br/"),
    ("Unimed Mineiros", "https://rsusmineiros.cubeti.com.br/"),
    ("Unimed Gurupi", "https://rsusgurupi.cubeti.com.br/"),
    ("Unimed Vitória", "https://rsus.unimedvitoria.com.br/"),
    ("Unimed Sul Capixaba", "https://rsussulcapixaba.cubeti.com.br/"),
    ("Unimed Uberaba", "https://rsusuberaba.cubeti.com.br/"),
    ("Unimed Belo Horizonte", "https://rsusbh.cubeti.com.br/"),
    ("Unimed Oeste do Pará", "https://rsusoestedopara.cubeti.com.br/"),
    ("Unimed Chapecó", "https://rsuschapeco.cubeti.com.br/"),
    ("Unimed Natal", "https://rsusnatal.cubeti.com.br/"),
    ("Unimed Piracicaba", "https://rsuspiracicaba.cubeti.com.br/"),
    ("Unimed Uberlândia", "https://rsusuberlandia.cubeti.com.br/"),
    ("Unimed Campinas", "https://rsuscampinas.cubeti.com.br/"),
    ("Unimed Erechim", "https://rsuserechim.cubeti.com.br/"),
    ("FSFX", "https://rsusfsfx.cubeti.com.br/"),
    ("CASSEMS", "https://rsuscassems.cubeti.com.br/"),
    ("São Francisco Vida", "https://rsussfvida.cubeti.com.br/"),
    ("São Miguel Saúde", "https://rsussaomiguelsaude.cubeti.com.br/"),
    ("Ipasgo", "https://rsusipasgo.cubeti.com.br/"),
    ("Abertta Saúde", "https://rsusabertta.cubeti.com.br/")
]

def sync():
    print(f"Iniciando sincronização de {len(clients_data)} clientes...")

    for name, url in clients_data:
        # Usa o nome como ID do documento ou busca se já existe
        # No Firestore do GAX, client_configs parecem usar nomes ou IDs uuid
        # Vamos usar o nome como ID para facilitar a busca e evitar duplicados por nome comercial

        client_id = db.normalize_client_id(name)
        doc_ref = db.firestore_db.collection('client_configs').document(client_id)
        doc = doc_ref.get()

        data = {
            'razao_social': name,
            'url_sistema': url,
            'updated_at': db.get_now_br().strftime("%Y-%m-%d %H:%M:%S")
        }

        if doc.exists:
            # Mantém campos extras (CNPJ, ANS) se existirem
            doc_ref.update(data)
            print(f"Atualizado: {name}")
        else:
            # Cria novo
            doc_ref.set(data)
            print(f"Cadastrado: {name}")

    print("Sincronização concluída!")

if __name__ == "__main__":
    sync()
