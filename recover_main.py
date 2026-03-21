import sys

path = r'c:\Users\victo\Desktop\xmlrsus2.0\api\main.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip_until = None

for i, line in enumerate(lines):
    if skip_until and i < skip_until:
        continue
    
    # Fix Corruption 1: blob.upload_from_str and missing lines
    if 'blob.upload_from_str' in line and 'except Exception as img_err:' in line:
        indent = " " * (len(line) - len(line.lstrip()))
        new_lines.append(f"{indent}    blob.upload_from_string(buf, content_type='image/png')\n")
        new_lines.append(f"{indent}    db.add_log(task_id, \"DEBUG\", f\"Screenshot salvo: {{remote_path}}\")\n")
        new_lines.append(f"{indent}except Exception as img_err:\n")
        continue

    # Fix Corruption 2: random close() and duplicated lines at 605
    if 'close()' in line and i > 600 and i < 610:
        continue # Just drop the line
    
    # Remove the duplicated lines 606-607 if they appear after the return
    if 'db.firestore_db.collection(\'tasks\').document(task_id).update({\'status\': \'ERRO\'})' in line:
        # Check if we already added this logic correctly above
        # If it's the corrupted duplicate at 606, skip it
        if i > 604 and i < 610:
            continue

    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully recovered main.py from corruption")
