import sys

def check_brackets(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    brackets = {'(': ')', '{': '}', '[': ']'}
    line = 1
    col = 1
    
    in_string = False
    string_char = ''
    in_template = False
    
    for i, char in enumerate(content):
        if char == '\n':
            line += 1
            col = 1
            continue
        
        if not in_string and not in_template:
            if char in "\"'":
                in_string = True
                string_char = char
            elif char == '`':
                in_template = True
            elif char in brackets.keys():
                stack.append((char, line, col))
            elif char in brackets.values():
                if not stack:
                    print(f"Extra closing bracket '{char}' at line {line}, col {col}")
                else:
                    top, t_line, t_col = stack.pop()
                    if brackets[top] != char:
                        print(f"Mismatched bracket: opened '{top}' at {t_line}:{t_col}, closed with '{char}' at {line}:{col}")
        elif in_string:
            if char == string_char and content[i-1] != '\\':
                in_string = False
        elif in_template:
            if char == '`' and content[i-1] != '\\':
                in_template = False
            elif char == '$' and i + 1 < len(content) and content[i+1] == '{':
                # This is a nested expression in a template
                stack.append(('${', line, col))
                # Skip the '{'
                # (Actually the logic for nested templates needs to be more robust)
                pass 
            elif char == '}' and stack and stack[-1][0] == '${':
                stack.pop()

    if stack:
        for b, l, c in stack:
            print(f"Unclosed bracket '{b}' opened at line {l}, col {c}")
    else:
        print("Brackets are balanced (roughly)")

if __name__ == "__main__":
    check_brackets(sys.argv[1])
