import os

_DEFAULT_ALLOWED_ORIGINS = (
    "capacitor://localhost",
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:18090",
)


def get_allowed_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOWED_ORIGINS")
    origins = [origin.strip() for origin in configured.split(",")] if configured else list(_DEFAULT_ALLOWED_ORIGINS)
    origins = [origin for origin in origins if origin]
    if not origins:
        raise RuntimeError("CORS_ALLOWED_ORIGINS must contain at least one origin")
    if "*" in origins:
        raise RuntimeError("CORS_ALLOWED_ORIGINS must not contain '*'")
    return origins
