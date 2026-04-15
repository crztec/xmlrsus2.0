import sys

filepath = 'api/automation_abi_check.py'
with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

status_code = """        if target_status:
            log_task(f"Atualizando status para '{target_status}'")
            # Gatilho de status independe da coluna exata. Procura por botões/comboboxes na linha atual.
            # Baseado na foto, é text "Não Iniciou", "Importou e Analisou", etc.
            status_trigger = target_row.locator("button, [role='combobox'], .cursor-pointer, span.inline-flex, span[aria-haspopup='dialog']").filter(has_text=re.compile(r"Não iniciou|Importou|Impugnando|Impugnado|Finalizou|Agendou|Erro", re.IGNORECASE)).first
            
            if await status_trigger.count() > 0:
                await status_trigger.scroll_into_view_if_needed()
                # Dispara mousedown para componentes que dependem dele (Radix/Angular)
                await status_trigger.dispatch_event("mousedown")
                await status_trigger.click(force=True)
                await asyncio.sleep(2)
                
                # Procura a opção pelo texto dinâmico (não mais fixo)
                # target_status pode ser "Nao iniciou", "Importou o ABI", "Importou e Analisou"
                # Usamos regex ignorando case e espaços para ser resiliente
                option_regex = re.compile(f"^{target_status}$".replace(" ", ".*"), re.I)
                option = page.locator("[role='menuitem'], [role='option'], .dropdown-item, button").filter(has_text=option_regex).first
                
                if await option.count() > 0:
                    await option.click(force=True)
                    log_task(f"Status '{target_status}' selecionado.")
                    await asyncio.sleep(2)
                else:
                    # Fallback por texto exato se regex falhar
                    log_task(f"Popover não detectado via regex '{target_status}', tentando fallback literal...", "WARNING")
                    option_fallback = page.locator(f"button:has-text('{target_status}'), a:has-text('{target_status}')").filter(visible=True).first
                    if await option_fallback.count() > 0:
                        await option_fallback.click(force=True)
                        log_task(f"Status '{target_status}' selecionado via fallback.")
                    else:
                        log_task("Menu de status não reconheceu a opção, tentando teclado...", "WARNING")
                        await page.keyboard.press("ArrowDown")
                        await asyncio.sleep(1)
                        await page.keyboard.press("Enter")
            else:
                log_task("Dropdown de status não encontrado.", "WARNING")"""

contact_code = """        # Seletores ultra-robustos para o botão + (Lida com variações de DOM no CubeTI)
        possible_btn_selectors = [
            "button[title*='Registrar']",
            "a[title*='Registrar']",
            "button[data-original-title*='Registrar']",
            "a[data-original-title*='Registrar']",
            "a.btn-success i.fa-plus",
            "button.btn-success i.fa-plus",
            ".btn-success"
        ]
        
        btn_add = None
        for btn_sel in possible_btn_selectors:
            try:
                # Primeiro tenta restringir à linha do cliente
                sel = f"tr:has-text('{client_name}') {btn_sel}"
                btn_add = page.locator(sel).first
                if await btn_add.count() > 0 and await btn_add.is_visible():
                    log_task(f"Botão '+' localizado via seletor específico: {sel}")
                    break
            except: pass

        if not btn_add or await btn_add.count() == 0 or not await btn_add.is_visible():
            log_task("Busca secundária por botão '+' em andamento...", "WARNING")
            # Fallback genérico na página inteira
            for btn_sel in possible_btn_selectors:
                try:
                    btn_add = page.locator(btn_sel).filter(visible=True).first
                    if await btn_add.count() > 0:
                        log_task(f"Botão '+' encontrado no fallback via: {btn_sel}", "WARNING")
                        break
                except: pass
        

        if btn_add and await btn_add.count() > 0:
            await btn_add.click(force=True)
            await asyncio.sleep(2)
            
            # Se abrir modal, procura o campo de preenchimento (Geralmente textarea ou input de observação)
            modal_area = page.locator("[role='dialog'], .modal-content, [role='document']").first
            if await modal_area.count() == 0:
                modal_area = page.locator("body") # fallback caso o modal não tenha as tags claras
                
            textbox = modal_area.locator("textarea, input:not([type='hidden']):not([type='checkbox']):not([type='radio'])").filter(visible=True).first
            if await textbox.count() > 0:
                await textbox.fill("")
                if mensagem_analise:
                    await textbox.fill(mensagem_analise)
                else:
                    await textbox.fill(target_status)
                await asyncio.sleep(1)

            save_btn = page.locator("button:has-text('Salvar'), button:has-text('Confirmar'), .btn-primary, button[type='submit']").filter(visible=True).first
            if await save_btn.count() > 0:
                await save_btn.click()
                await asyncio.sleep(2)
            log_task("Registro de contato processado.")
        else:
            log_task("Botão '+' não encontrado.", "WARNING")"""

if status_code not in text:
    print('status_code not found', flush=True)
if contact_code not in text:
    print('contact_code not found', flush=True)

new_text = text.replace(status_code, '')
new_text = new_text.replace(contact_code, '')

marker = '        await browser.close()'
new_text = new_text.replace(marker, f'{contact_code}\n\n{status_code}\n\n{marker}')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_text)

print('Success', flush=True)
