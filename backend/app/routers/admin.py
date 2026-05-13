from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, RedirectResponse

router = APIRouter(prefix="/admin", tags=["관리자 (Admin)"])

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates" / "admin"


def _render(name: str) -> HTMLResponse:
    return HTMLResponse((_TEMPLATE_DIR / name).read_text(encoding="utf-8"))


@router.get("/", include_in_schema=False)
async def admin_root():
    return RedirectResponse(url="/admin/login")


@router.get("/login", include_in_schema=False)
async def admin_login_page():
    return _render("login.html")
