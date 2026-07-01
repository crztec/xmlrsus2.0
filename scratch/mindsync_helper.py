import sys
import json
import urllib.request

PROJECT_ID = "96be79ca"
URL = "http://127.0.0.1:3101/mcp"

def call_mindsync(tool_name, arguments):
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        },
        "id": 1
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            if "error" in res:
                print(f"Error in {tool_name}: {res['error']}")
                return None
            return res.get("result")
    except Exception as e:
        print(f"Failed to connect to mindsync: {e}")
        return None

def index_files(file_paths):
    files_payload = []
    for fp in file_paths:
        try:
            with open(fp, "r", encoding="utf-8") as f:
                content = f.read()
            files_payload.append({
                "path": fp,
                "content": content
            })
            print(f"Prepared file for indexing: {fp} ({len(content)} chars)")
        except Exception as e:
            print(f"Could not read {fp}: {e}")
            
    if not files_payload:
        return
        
    result = call_mindsync("ms_index_code", {
        "projectId": PROJECT_ID,
        "files": files_payload
    })
    print("Indexing result:", result)
    return result

def save_observation(title, content, category, source=""):
    result = call_mindsync("ms_save", {
        "projectId": PROJECT_ID,
        "title": title,
        "content": content,
        "category": category,
        "source": source
    })
    print(f"Saved observation '{title}' ({category}): {result}")
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: mindsync_helper.py [index|save] ...")
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == "index":
        index_files(sys.argv[2:])
    elif cmd == "save":
        if len(sys.argv) < 5:
            print("Usage: mindsync_helper.py save <title> <content> <category> [source]")
            sys.exit(1)
        title = sys.argv[2]
        content = sys.argv[3]
        category = sys.argv[4]
        source = sys.argv[5] if len(sys.argv) > 5 else ""
        save_observation(title, content, category, source)
