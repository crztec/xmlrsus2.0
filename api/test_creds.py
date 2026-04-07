import asyncio
import os
import sys

sys.path.append(os.getcwd())
import api.database as db

async def run():
    clients = db.get_all_clients()
    for c in clients:
        if "Petr" in c['name']:
            print("Found client:", c['name'])
            url, user, pw, name = await db.get_rsus_auth_by_url(c['url_sistema'])
            print(f"URL: {url}")
            print(f"USER: {user}")
            print(f"PASS: {pw}")

if __name__ == "__main__":
    asyncio.run(run())
