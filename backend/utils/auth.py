import bcrypt

def verify_password(plain_password, hashed_password):
    if not plain_password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (TypeError, ValueError):
        return False

def get_password_hash(password):
    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


def is_password_hash(value: str | None) -> bool:
    return bool(value and value.startswith(("$2a$", "$2b$", "$2y$")))


def verify_pin(plain_pin: str, stored_pin: str | None) -> bool:
    if not stored_pin:
        return False
    if is_password_hash(stored_pin):
        return verify_password(plain_pin, stored_pin)
    return plain_pin == stored_pin
