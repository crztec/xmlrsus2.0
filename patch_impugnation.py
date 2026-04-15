import sys

filepath = 'api/automation_impugnation_check.py'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

status_lines = lines[90:127]
part1 = lines[:90]
part2 = lines[173:]

new_contact_code = """            if contact_message:
                log_task(f"Registrando contato: '{contact_message}'...")
                # Seletores ultra-robustos para o botão + (Lida com variações de DOM no CubeTI)
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
                    
                    modal_area = page.locator("[role='dialog'], .modal-content, [role='document']").first
                    if await modal_area.count() == 0:
                        modal_area = page.locator("body")
                        
                    textbox = modal_area.locator("textarea, input:not([type='hidden']):not([type='checkbox']):not([type='radio'])").filter(visible=True).first
                    if await textbox.count() > 0:
                        await textbox.fill("")
                        await textbox.fill(contact_message)
                        await asyncio.sleep(1)

                    save_btn = page.locator("button:has-text('Salvar'), button:has-text('Confirmar'), .btn-primary, button[type='submit']").filter(visible=True).first
                    if await save_btn.count() > 0:
                        await save_btn.click()
                        await asyncio.sleep(2)
                    log_task("Registro de contato processado.")
                else:
                    log_task("Botão '+' não encontrado.", "WARNING")

"""

new_lines = part1 + [new_contact_code] + status_lines + ["\n"] + part2

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
print('Done!')
