import hashlib
import secrets

def hash_password(password: str, salt: str = None) -> tuple:
    if not salt:
        salt = secrets.token_hex(16)
    pw_bytes = password.encode("utf-8")
    salt_bytes = salt.encode("utf-8")
    key = hashlib.pbkdf2_hmac("sha256", pw_bytes, salt_bytes, 100000)
    return key.hex(), salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    try:
        pw_bytes = password.encode("utf-8")
        salt_bytes = salt.encode("utf-8")
        key = hashlib.pbkdf2_hmac("sha256", pw_bytes, salt_bytes, 100000)
        return secrets.compare_digest(key.hex(), stored_hash)
    except Exception:
        return False
