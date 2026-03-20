import io
import xml.etree.ElementTree as ET
import pandas as pd
from datetime import datetime, timedelta

def formatar_valor_monetario(valor):
    if pd.isna(valor) or str(valor).strip() == "": return ""
    try:
        # Se já for número, apenas formata com 2 casas
        if isinstance(valor, (float, int)): 
            return "{:.2f}".format(valor).replace('.', ',')
        
        # Se for string, limpa símbolos monetários
        s = str(valor).replace('R$', '').strip()
        
        # Lógica para detectar se o ponto é decimal ou separador de milhar
        # No XML (ABI), o padrão costuma ser 12345.67 (ponto decimal)
        if ',' in s and '.' in s:
            # Padrão brasileiro: 1.234,56 -> remove ponto, troca vírgula
            s = s.replace('.', '').replace(',', '.')
        elif ',' in s:
            # Padrão 1234,56 -> troca por ponto para float()
            s = s.replace(',', '.')
        elif '.' in s:
            # Padrão 1234.56 OU 1.234 - dependendo da posição
            # Se tiver apenas um ponto e 2 casas decimais, é decimal
            partes = s.split('.')
            if len(partes) == 2 and len(partes[1]) == 2:
                # É decimal (padrão XML) -> mantém o ponto para float()
                pass
            else:
                # Provável separador de milhar (padrão de sistema legado)
                # s = s.replace('.', '')
                # Mas no RSUS/XML, vamos assumir padrão decimal se for FLOAT-LIKE
                try: 
                    float(s)
                except: 
                    s = s.replace('.', '')
        
        val_float = float(s)
        return "{:.2f}".format(val_float).replace('.', ',')
    except Exception as e:
        print(f"Erro formatar_valor: {e}")
        return str(valor)

def formatar_competencia_site(texto_excel):
    if pd.isna(texto_excel) or str(texto_excel).strip() == "" or str(texto_excel).strip().lower() == 'nat': return ""
    try:
        itens = [i.strip() for i in str(texto_excel).split(',')]
        datas = []
        for i in itens:
            if len(i) == 6: datas.append(datetime.strptime(i, "%m%Y"))
            elif len(i) == 7 and "/" in i: datas.append(datetime.strptime(i, "%m/%Y"))
        datas.sort()
        if not datas: return str(texto_excel)
        meses = [str(d.month) for d in datas]
        ano = datas[0].year
        return f"{'-'.join(meses)}/{ano}"
    except: return str(texto_excel)

def extrair_dados_xml(arquivos_upload):
    """
    Versão portada do extrator de XML do Streamlit para FastAPI.
    Recebe uma lista de tuplas (nome_arquivo, conteudo_bytes).
    """
    dados_extraidos = []
    
    for nome_arq, conteudo_bytes in arquivos_upload:
        try:
            root = ET.fromstring(conteudo_bytes)
            
            def obter_texto(tag_nome):
                # Busca insensível a maiúsculas/minúsculas para maior resiliência
                for elem in root.iter():
                    if elem.tag.split('}')[-1].lower() == tag_nome.lower():
                        return elem.text if elem.text else ""
                return ""
            
            num_abi = obter_texto("numeroABI")
            razao_social = obter_texto("razaoSocial")
            if not num_abi: continue 
            
            competencias_list = []
            for elem in root.iter():
                if elem.tag.split('}')[-1] == "competencia":
                    comp = elem.text
                    if comp and comp not in competencias_list:
                        competencias_list.append(comp)
                        if len(competencias_list) == 3: break
            
            data_recebimento_str = obter_texto("dataRecebimentoOficio") or obter_texto("dataRegistroTransacao")
            prazo_ans_str = ""
            
            if data_recebimento_str:
                try:
                    if "-" in data_recebimento_str:
                        dt_rec = datetime.strptime(data_recebimento_str[:10], "%Y-%m-%d")
                    else:
                        dt_rec = datetime.strptime(data_recebimento_str[:10], "%d/%m/%Y")
                    
                    dt_prazo = dt_rec + timedelta(days=35)
                    prazo_ans_str = dt_prazo.strftime("%d/%m/%Y")
                    data_recebimento_str = dt_rec.strftime("%d/%m/%Y")
                except Exception as e:
                    print(f"Erro ao calcular prazo: {e}")

            # Formatações específicas para o Portal RSUS
            competencias_str = ", ".join(competencias_list)
            competencias_site = formatar_competencia_site(competencias_str)
            valor_total = formatar_valor_monetario(obter_texto("valorTotalProcesso"))

            dados_extraidos.append({
                "Nome do Arquivo": nome_arq,
                "Número ABI": num_abi,
                "Razão Social": razao_social,
                "Valor Total do Processo": valor_total,
                "Quantidade de Processo": obter_texto("quantidadeProcesso"),
                "Datas de Competência": competencias_site,
                "Número do Processo": obter_texto("numeroProcesso"),
                "Data de Registro da Transação": obter_texto("dataRegistroTransacao"),
                "Data Recebimento Ofício": data_recebimento_str,
                "Prazo Resposta ANS": prazo_ans_str,
                "conteudo_bytes": conteudo_bytes
            })
        except Exception as e:
            print(f"Erro ao extrair dados do arquivo {nome_arq}: {e}")
            
    return pd.DataFrame(dados_extraidos)

def parse_fine_details_from_bytes(conteudo_bytes):
    detalhes = []
    try:
        root = ET.fromstring(conteudo_bytes)
        
        # Tags de agrupamento comuns em XMLs de faturamento (ABI/TISS)
        vessel_tags = [
            "itemResumoApuracao", "procedimentoFaturado", "servicoExecutado", 
            "detalheItem", "itemGuia", "dadosProcedimento", "procedimentoResumo",
            "faturamentoItem", "itemFaturamento"
        ]
        
        # Busca por itens estruturados primeiro
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]
            if any(v.lower() == tag.lower() for v in vessel_tags):
                item = {
                    "beneficiario_cod": "",
                    "beneficiario_nome": "",
                    "data": "",
                    "procedimento_cod": "",
                    "procedimento_nome": "",
                    "valor": ""
                }
                for child in elem.iter():
                    c_tag = child.tag.split('}')[-1].lower()
                    val = child.text if child.text else ""
                    
                    if any(t in c_tag for t in ["codigobeneficiario", "numerocarteira", "cdbeneficiario"]): 
                        item["beneficiario_cod"] = val
                    elif any(t in c_tag for t in ["nomebeneficiario", "nmbeneficiario", "beneficiarionome"]): 
                        item["beneficiario_nome"] = val
                    elif any(t in c_tag for t in ["dataatendimento", "dtatendimento", "datainicio", "dtinicio"]): 
                        item["data"] = val
                    elif any(t in c_tag for t in ["codigoprocedimento", "cdprocedimento", "procedimentocodigo"]): 
                        item["procedimento_cod"] = val
                    elif any(t in c_tag for t in ["descricaoprocedimento", "dsprocedimento", "nmprocedimento", "procedimentodesc"]): 
                        item["procedimento_nome"] = val
                    elif any(t in c_tag for t in ["valortotalitem", "vltotalitem", "valorprocessado", "vlprocessado", "valorprocesso"]): 
                        item["valor"] = formatar_valor_monetario(val)
                
                if item["beneficiario_nome"] or item["procedimento_nome"] or item["beneficiario_cod"]:
                    detalhes.append(item)
                    
        # Se não encontrou dados estruturados, tenta buscar por Guias (Nível superior)
        if not detalhes:
            guia_tags = ["guiaSPSADT", "guiaResumoInternacao", "dadosGuia", "guiaFaturamento", "guia"]
            for elem in root.iter():
                tag = elem.tag.split('}')[-1]
                if any(g.lower() == tag.lower() for g in guia_tags):
                    item = {
                      "beneficiario_cod": "",
                      "beneficiario_nome": "Resumo de Guia",
                      "data": "",
                      "procedimento_cod": "-",
                      "procedimento_nome": "Informações da Guia",
                      "valor": ""
                    }
                    for sub in elem.iter():
                        s_tag = sub.tag.split('}')[-1].lower()
                        v = sub.text if sub.text else ""
                        if any(t in s_tag for t in ["codigobeneficiario", "numerocarteira"]): item["beneficiario_cod"] = v
                        elif any(t in s_tag for t in ["nomebeneficiario", "nmbeneficiario"]): item["beneficiario_nome"] = v
                        elif any(t in s_tag for t in ["datainiciofaturamento", "dtiniciofaturamento", "dataemissaodeferimento"]): item["data"] = v
                        elif any(t in s_tag for t in ["valortotalguia", "vltotalguia", "valorpago"]): item["valor"] = formatar_valor_monetario(v)
                    
                    if item["beneficiario_nome"] != "Resumo de Guia" or item["beneficiario_cod"]:
                        detalhes.append(item)

        # Último caso: Busca Global "Fuzzy" para capturar QUALQUER coisa que pareça item de faturamento
        if not detalhes:
            for elem in root.iter():
                tag = elem.tag.split('}')[-1].lower()
                # Se encontrarmos um "nome de beneficiário", assumimos que é um item
                if "nmbeneficiario" in tag or "nomebeneficiario" in tag:
                    detalhes.append({
                        "beneficiario_cod": "Captura Global",
                        "beneficiario_nome": elem.text if elem.text else "N/A",
                        "data": "",
                        "procedimento_cod": "XML",
                        "procedimento_nome": "Extração Genérica",
                        "valor": ""
                    })

    except Exception as e:
        print(f"Erro crítico ao parsear detalhes finos: {e}")
    return detalhes

def extract_razao_social(conteudo_bytes):
    try:
        root = ET.fromstring(conteudo_bytes)
        for elem in root.iter():
            if elem.tag.split('}')[-1] == "razaoSocial":
                return elem.text if elem.text else ""
    except Exception:
        return ""
    return ""
