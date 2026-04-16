import os
import sys
sys.path.append(os.getcwd())
try:
    from api import database as db
    from firebase_admin import auth as admin_auth
    
    email = "victor@cubeti.com.br"
    profile = db.get_user_profile(email)
    print(f"Profile for {email}: {profile}")
    
    # List all users with admin role
    users = db.firestore_db.collection('users').where('role', '==', 'admin').get()
    print("\nAdmin Users:")
    for u in users:
        print(f" - {u.id}: {u.to_dict()}")

    # Check if a specific test user exists
    test_email = "admin@gax.com.br"
    test_profile = db.get_user_profile(test_email)
    print(f"\nProfile for {test_email}: {test_profile}")

except Exception as e:
    print(f"Error: {e}")
