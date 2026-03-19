import io
import xml.etree.ElementTree as ET
import pandas as pd
from datetime import datetime, timedelta

def formatar_valor_monetario(valor):
    if pd.isna(valor) or str(valor).strip() == "": return ""
    try:
        if isinstance(valor, (float, int)): 
            return "{:.2f}".format(valor).replace('.', ',')
        s = str(valor).replace('R$', '').replace('.', '').replace(',', '.').strip()
        val_float = float(s)
        return "{:.2f}".format(val_float).replace('.', ',')
    except: 
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
                for elem in root.iter():
                    if elem.tag.split('}')[-1] == tag_nome:
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
        
        # Procura por itens de serviço/resumo em qualquer lugar do XML
        # Tags comuns: itemResumoApuracao, procedimentoResumo, etc.
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]
            if tag in ["itemResumoApuracao", "procedimentoFaturado", "servicoExecutado"]:
                item = {
                    "beneficiario_cod": "",
                    "beneficiario_nome": "",
                    "data": "",
                    "procedimento_cod": "",
                    "procedimento_nome": "",
                    "valor": ""
                }
                # Mapeamento dinâmico baseado em tags conhecidas
                for child in elem.iter():
                    c_tag = child.tag.split('}')[-1]
                    val = child.text if child.text else ""
                    
                    if c_tag in ["codigoBeneficiario", "numeroCarteira"]: item["beneficiario_cod"] = val
                    elif c_tag in ["nomeBeneficiario", "nmBeneficiario"]: item["beneficiario_nome"] = val
                    elif c_tag in ["dataAtendimento", "dtAtendimento", "dataInicio"]: item["data"] = val
                    elif c_tag in ["codigoProcedimento", "cdProcedimento"]: item["procedimento_cod"] = val
                    elif c_tag in ["descricaoProcedimento", "dsProcedimento"]: item["procedimento_nome"] = val
                    elif c_tag in ["valorTotalItem", "vlTotalItem", "valorProcessado"]: item["valor"] = val
                
                # Só adiciona se tiver pelo menos o básico
                if item["beneficiario_nome"] or item["procedimento_nome"]:
                    detalhes.append(item)
                    
        # Fallback se não encontrou nada estruturado: tenta buscar por guias
        if not detalhes:
            for elem in root.iter():
                tag = elem.tag.split('}')[-1]
                if tag in ["guiaSPSADT", "guiaResumoInternacao", "dadosGuia"]:
                    item = {
                      "beneficiario_cod": "",
                      "beneficiario_nome": "Resumo de Guia",
                      "data": "",
                      "procedimento_cod": "-",
                      "procedimento_nome": "Informações da Guia",
                      "valor": ""
                    }
                    for sub in elem.iter():
                        s_tag = sub.tag.split('}')[-1]
                        v = sub.text if sub.text else ""
                        if s_tag in ["codigoBeneficiario", "numeroCarteira"]: item["beneficiario_cod"] = v
                        elif s_tag in ["nomeBeneficiario", "nmBeneficiario"]: item["beneficiario_nome"] = v
                        elif s_tag in ["dataInicioFaturamento", "dtInicioFaturamento"]: item["data"] = v
                        elif s_tag in ["valorTotalGuia", "vlTotalGuia"]: item["valor"] = v
                    if item["beneficiario_nome"] != "Resumo de Guia" or item["beneficiario_cod"]:
                        detalhes.append(item)
    except Exception as e:
        print(f"Erro ao parsear detalhes finos: {e}")
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
