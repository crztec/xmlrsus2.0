path = r'c:\Users\victo\Desktop\xmlrsus2.0\api\main.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    # Fix the specific lines 567-570 (if they match the corrupted state)
    if 'blob.upload_from_string(buf, content_type=\'image/png\')' in line and i > 560 and i < 575:
        new_lines.append("                        blob.upload_from_string(buf, content_type='image/png')\n")
        continue
    if 'db.add_log(task_id, "DEBUG", f"Screenshot salvo: {remote_path}")' in line and i > 560 and i < 575:
        new_lines.append("                        db.add_log(task_id, \"DEBUG\", f\"Screenshot salvo: {remote_path}\")\n")
        continue
    if 'except Exception as img_err:' in line and i > 560 and i < 575:
        new_lines.append("                except Exception as img_err:\n")
        continue
    if 'pass' in line and i > 560 and i < 575 and len(line.lstrip()) == 4: # Very specific
        new_lines.append("                    pass\n")
        continue

    new_lines.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Formatting fixed")
