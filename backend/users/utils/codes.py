import secrets

def generate_6_digit_code() -> str:
    # "000123" es válido y conserva ceros a la izquierda
    return f"{secrets.randbelow(1_000_000):06d}"
