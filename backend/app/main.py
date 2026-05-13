from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth

app = FastAPI(title="Saigon Rider API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
