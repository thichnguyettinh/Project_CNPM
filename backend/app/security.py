import hashlib
import hmac
import secrets

MAX_FAILED_LOGIN_ATTEMPTS = 3
LOGIN_LOCKOUT_MINUTES = 15


def password_policy_errors(password: str) -> list[str]:
    errors = []
    if len(password) < 8:
        errors.append("ít nhất 8 ký tự")
    if not any("A" <= character <= "Z" for character in password):
        errors.append("ít nhất 1 chữ hoa (A-Z)")
    if not any("0" <= character <= "9" for character in password):
        errors.append("ít nhất 1 chữ số (0-9)")
    if not any(
        not (character.isascii() and character.isalnum()) and not character.isspace()
        for character in password
    ):
        errors.append("ít nhất 1 ký tự đặc biệt")
    return errors


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt_hex, digest_hex = stored_hash.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
