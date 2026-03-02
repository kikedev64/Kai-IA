from typing import Optional
from pydantic import BaseModel

class ToolResult(BaseModel):
    ok: bool
    data: Optional[dict] = None
    error: Optional[dict] = None

    