import os
from dotenv import load_dotenv

load_dotenv()

key = os.environ.get("FIREBASE_API_KEY")
print(f"CWD: {os.getcwd()}")
print(f"FIREBASE_API_KEY found: {bool(key)}")
if key:
    print(f"Key starts with: {key[:10]}...")
else:
    print("Key is MISSING!")
