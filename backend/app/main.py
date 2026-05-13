from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth
from .routers import contents
from .routers import profile

app = FastAPI(
    title="Saigon Rider API",
    version="1.0.0",
    description=(
        "Saigon Rider 백엔드 API.\n\n"
        "- **인증**: 전화번호 기반 passcode 발급/검증\n"
        "- **컨텐츠**: 이미지 업로드 및 imgproxy URL 서빙\n"
        "- **프로필**: 사진 변경, 닉네임 수정\n"
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(contents.router, prefix="/api")
app.include_router(profile.router, prefix="/api")


@app.get("/api/health", tags=["system"], summary="헬스체크")
async def health():
    return {"status": "ok"}
