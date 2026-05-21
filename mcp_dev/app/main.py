from fastapi import FastAPI
from fastmcp import FastMCP

from . import tools
from .routers import rest

app = FastAPI(title="Saigon Dev MCP Server", docs_url="/docs", redoc_url=None)

app.include_router(rest.router, prefix="/api/dev")

mcp = FastMCP("saigon-dev-context")
tools.register(mcp)

app.mount("/mcp", mcp.http_app())
