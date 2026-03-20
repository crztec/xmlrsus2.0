import os
import sys

# Adapta o sys.path para conseguir importar de api.database
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from api.database import storage

def download_latest_screenshot():
    bucket = storage.bucket()
    blob = bucket.blob("debug/screenshots/AUapMerbFHAxQOxK5AMv_dump.html")
    
    desktop_path = os.path.join(os.path.expanduser("~"), "Desktop", "AUapMerbFHAxQOxK5AMv_dump.html")
    blob.download_to_filename(desktop_path)
    print(f"BAIXADO COM SUCESSO: {desktop_path}")

if __name__ == "__main__":
    download_latest_screenshot()
