import os
import sys

sys.path.append(os.getcwd())

import api.database as db


def check_admin(email):
    print(f"Verificando usuário: {email}")
    profile = db.get_user_profile(email)

    if profile:
        print(f"Perfil encontrado: {profile}")
        if profile.get('role') != 'admin' or profile.get('status') != 'approved':
            print("Atualizando para admin/approved...")
            db.update_user_role(email, 'admin')
            db.update_user_status(email, 'approved')
            print("Usuário atualizado com sucesso!")
        else:
            print("Usuário já é admin e está aprovado.")
    else:
        print("Usuário não encontrado no Firestore. Criando perfil como admin...")
        db.create_user_profile(email, "Teste", "Admin")
        db.update_user_role(email, 'admin') # Força admin
        db.update_user_status(email, 'approved') # Força approved
        print("Perfil criado e atualizado.")

if __name__ == "__main__":
    check_admin("test@test.com")
