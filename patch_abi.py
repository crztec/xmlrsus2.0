import sys
import re

filepath = 'api/automation_abi_check.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

pattern = re.compile(
    r'(.*?)'
    r'(\s*if target_status:\n\s*log_task\(f"Atualizando status para.*?log_task\("Dropdown de status não encontrado\.", "WARNING"\)\n)'
    r'(.*?)'
    r'(\s*await browser\.close\(\).*)',
    re.DOTALL
)

match = pattern.search(content)
if match:
    part1, status_block, contact_block, part3 = match.groups()
    # Contact block should go above status block
    new_content = part1 + contact_block + status_block + part3
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Patch successfully applied to abi.")
else:
    print("Markers not found via regex!")
