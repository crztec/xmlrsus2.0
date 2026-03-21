import re
import os

path = r'c:\Users\victo\Desktop\xmlrsus2.0\api\main.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_until = None

for i, line in enumerate(lines):
    # Skip lines if we are replacing a block
    if skip_until and i < skip_until:
        continue
    
    # 1. Replace set_input_files block (around line 720)
    if 'await file_input.set_input_files(tmp_name)' in line:
        # We need to find the start of the try block
        # Usually 1 line above
        if 'try:' in lines[i-1]:
            # Replace the whole block until the except
            new_lines.pop() # Remove the 'try:' we just added
            indent = " " * (len(line) - len(line.lstrip()))
            new_lines.append(f"{indent}try:\n")
            new_lines.append(f"{indent}    file_input = form_target.locator(\"input[type='file']\").first\n")
            new_lines.append(f"{indent}    # Timeout de 30s para o upload\n")
            new_lines.append(f"{indent}    await asyncio.wait_for(file_input.set_input_files(tmp_name), timeout=30.0)\n")
            new_lines.append(f"{indent}    await asyncio.sleep(2)\n")
            new_lines.append(f"{indent}    db.add_log(task_id, \"INFO\", \"Arquivo XML anexado com sucesso.\")\n")
            new_lines.append(f"{indent}except asyncio.TimeoutError:\n")
            new_lines.append(f"{indent}    db.add_log(task_id, \"ERROR\", \"Timeout ao anexar arquivo XML (Portal não responde).\")\n")
            new_lines.append(f"{indent}    continue\n")
            
            # Find the next 'except' to skip the old block
            for j in range(i, i+10):
                if 'except Exception as dl_err:' in lines[j]:
                    skip_until = j
                    break
            continue

    # 2. Replace the evaluate click (around line 755)
    if 'success_click = await page.evaluate("""() => {' in line:
        indent = " " * (len(line) - len(line.lstrip()))
        new_lines.append(f"{indent}# Clique Final no botão de Importar (Robusto com evaluate + timeout)\n")
        new_lines.append(f"{indent}try:\n")
        new_lines.append(f"{indent}    async def click_import():\n")
        new_lines.append(f"{indent}        return await page.evaluate(\"\"\"() => {{\n")
        new_lines.append(f"{indent}            const buttons = Array.from(document.querySelectorAll('a, button, input[type=\"submit\"]'));\n")
        new_lines.append(f"{indent}            const btn = buttons.find(b => b.innerText.includes('IMPORTAR ARQUIVO') || b.value === 'IMPORTAR ARQUIVO');\n")
        new_lines.append(f"{indent}            if (btn) {{\n")
        new_lines.append(f"{indent}                btn.scrollIntoView();\n")
        new_lines.append(f"{indent}                btn.click();\n")
        new_lines.append(f"{indent}                return true;\n")
        new_lines.append(f"{indent}            }}\n")
        new_lines.append(f"{indent}            return false;\n")
        new_lines.append(f"{indent}        }}\"\"\")\n")
        new_lines.append(f"{indent}    success_click = await asyncio.wait_for(click_import(), timeout=30.0)\n")
        new_lines.append(f"{indent}except asyncio.TimeoutError:\n")
        new_lines.append(f"{indent}    db.add_log(task_id, \"ERROR\", \"Timeout ao clicar em 'IMPORTAR ARQUIVO' (Portal travado).\")\n")
        new_lines.append(f"{indent}    continue\n")
        new_lines.append(f"{indent}except Exception as e:\n")
        new_lines.append(f"{indent}    db.add_log(task_id, \"ERROR\", f\"Erro no clique final: {{e}}\")\n")
        new_lines.append(f"{indent}    success_click = False\n")
        
        # Find the next 'if not success_click:' to skip the old block
        for j in range(i, i+20):
            if 'if not success_click:' in lines[j] and 'WARNING' in lines[j+1]:
                skip_until = j
                break
        continue

    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully patched main.py using line-by-line logic")
