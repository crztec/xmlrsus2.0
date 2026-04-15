import sys
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    status_start = content.find("            # Selecionar status no dropdown do CubeTI")
    contact_start = content.find("            log_task(f\"Registrando contato:")
    browser_close = content.find("            await browser.close()")

    if status_start == -1 or contact_start == -1 or browser_close == -1:
        print(f"Marcadores não encontrados em {filepath}")
        return

    part1 = content[:status_start]
    status_block = content[status_start:contact_start]
    contact_block = content[contact_start:browser_close]
    part3 = content[browser_close:]

    # Reorder
    new_content = part1 + contact_block + status_block + part3

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Sucesso em {filepath}")

process_file('api/automation_impugnation_check.py')
process_file('api/automation_abi_check.py')
