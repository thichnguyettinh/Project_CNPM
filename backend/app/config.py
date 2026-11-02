import os


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://lopminh:change-me@127.0.0.1:5432/lopminh",
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
SESSION_HOURS = int(os.getenv("SESSION_HOURS", "12"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
