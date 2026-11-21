from fastapi.testclient import TestClient
from main import app, SolveRequest
client=TestClient(app)
def test_health():
    r=client.get("/health")
    assert r.status_code==200 and r.json()["status"]=="ok"
def test_invalid_mode():
    try: SolveRequest(mode="delete_everything")
    except Exception: return
    assert False, "Unsupported mode should be rejected"
def test_reject_non_image_data():
    try: SolveRequest(image="data:text/plain;base64,SGVsbG8=")
    except Exception: return
    assert False, "Non-image data URL should be rejected"
