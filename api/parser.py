import defusedxml.ElementTree as ET
from datetime import datetime, timedelta

import pandas as pd


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

            extracted_data = {}
            competencias_list = []

            # Tags needed for extraction (lowercased for case-insensitive matching)
            tags_of_interest = {
                "numeroabi", "razaosocial", "datarecebimentooficio",
                "dataregistrotransacao", "valortotalprocesso",
                "quantidadeprocesso", "numeroprocesso", "competencia"
            }

            expected_unique = 7 # We need 7 unique fields + up to 3 competencias
            unique_found = 0

            # Single pass over the XML tree with early exit
            for elem in root.iter():
                tag = elem.tag
                idx = tag.rfind('}')
                tag_name = tag[idx+1:].lower() if idx != -1 else tag.lower()

                if tag_name in tags_of_interest:
                    val = elem.text if elem.text else ""
                    if tag_name == "competencia":
                        if val and val not in competencias_list and len(competencias_list) < 3:
                            competencias_list.append(val)
                    elif tag_name not in extracted_data:
                        extracted_data[tag_name] = val
                        unique_found += 1

                # Early exit if we found everything
                if unique_found == expected_unique and len(competencias_list) >= 3:
                    break

            num_abi = extracted_data.get("numeroabi", "")
            razao_social = extracted_data.get("razaosocial", "")
            if not num_abi: continue

            data_recebimento_str = extracted_data.get("datarecebimentooficio", "") or extracted_data.get("dataregistrotransacao", "")
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
            valor_total = formatar_valor_monetario(extracted_data.get("valortotalprocesso", ""))

            dados_extraidos.append({
                "Nome do Arquivo": nome_arq,
                "Número ABI": num_abi,
                "Razão Social": razao_social,
                "Valor Total do Processo": valor_total,
                "Quantidade de Processo": extracted_data.get("quantidadeprocesso", ""),
                "Datas de Competência": competencias_site,
                "Número do Processo": extracted_data.get("numeroprocesso", ""),
                "Data de Registro da Transação": extracted_data.get("dataregistrotransacao", ""),
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
            "atendimento", "guia", "itemResumoApuracao", "procedimentoFaturado",
            "servicoExecutado", "detalheItem", "itemGuia", "dadosProcedimento",
            "procedimentoResumo", "faturamentoItem", "itemFaturamento"
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
                # Pass 1: Captura contexto (beneficiário, data) de forma profunda dentro do vessal
                for child in elem.iter():
                    c_tag = child.tag.split('}')[-1].lower()
                    val = child.text if child.text else ""
                    # print(f"DEBUG TAG: {c_tag} | Val: {val}")
                    if any(t in c_tag for t in ["codigobeneficiario", "numerocarteira", "cdbeneficiario"]):
                        item["beneficiario_cod"] = val
                    elif any(t in c_tag for t in ["nomebeneficiario", "nmbeneficiario", "nomepaciente", "nmpaciente"]):
                        item["beneficiario_nome"] = val
                    elif any(t in c_tag for t in ["dataatendimento", "dtatendimento", "datainicio"]):
                        item["data"] = val

                # Pass 2: Captura sub-procedimentos ou o próprio item
                has_sub_procs = False
                for sub in elem.iter():
                    sub_tag = sub.tag.split('}')[-1].lower()
                    if sub_tag == "procedimento":
                        has_sub_procs = True
                        sub_item = item.copy()
                        for s_child in sub.iter():
                            sc_tag = s_child.tag.split('}')[-1].lower()
                            s_val = s_child.text if s_child.text else ""
                            if any(t in sc_tag for t in ["codigoprocedimento", "cdprocedimento"]): sub_item["procedimento_cod"] = s_val
                            elif any(t in sc_tag for t in ["descricaoprocedimento", "dsprocedimento", "nmprocedimento"]): sub_item["procedimento_nome"] = s_val
                            elif any(t in sc_tag for t in ["valortotalitem", "vltotalitem", "valorprocessado", "vlprocessado"]): sub_item["valor"] = formatar_valor_monetario(s_val)

                        if sub_item["procedimento_nome"] or sub_item["beneficiario_nome"]:
                            detalhes.append(sub_item)

                if not has_sub_procs:
                    # Se não tinha sub-procedimentos, tenta preencher os campos do item principal
                    if not item["procedimento_nome"]:
                        for child in elem.iter():
                            cl_tag = child.tag.split('}')[-1].lower()
                            cl_val = child.text if child.text else ""
                            if any(t in cl_tag for t in ["codigoprocedimento", "cdprocedimento"]): item["procedimento_cod"] = cl_val
                            elif any(t in cl_tag for t in ["descricaoprocedimento", "dsprocedimento", "nmprocedimento"]): item["procedimento_nome"] = cl_val
                            elif any(t in cl_tag for t in ["valortotalitem", "vltotalitem", "valorprocessado", "vlprocessado"]): item["valor"] = formatar_valor_monetario(cl_val)

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

    except Exception:
        pass
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
