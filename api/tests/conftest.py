import sys
from unittest.mock import MagicMock

# Mock firebase_admin before any other import hits api.database
mock_firestore = MagicMock()

sys.modules['firebase_admin'] = MagicMock()
sys.modules['firebase_admin.credentials'] = MagicMock()

# Mock FieldFilter structure
mock_base_query = MagicMock()
sys.modules['google.cloud.firestore_v1.base_query'] = mock_base_query

import pytest

@pytest.fixture(autouse=True)
def mock_db():
    # Isso garante que o firestore_db em database.py seja um mock
    import api.database as db
    db.firestore_db = MagicMock()
    return db.firestore_db
