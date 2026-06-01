from fastapi import FastAPI
from fastmcp import FastMCP

from . import tools
from .routers import rest

mcp = FastMCP("saigon-dev-context")
tools.register(mcp)

mcp_http = mcp.http_app()

app = FastAPI(title="Saigon Dev MCP Server", docs_url="/docs", redoc_url=None, lifespan=mcp_http.lifespan)

app.include_router(rest.router, prefix="/api/dev")
app.mount("/mcp", mcp_http)
