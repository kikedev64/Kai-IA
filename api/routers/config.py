from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.config.config_service import (
    get_all_config,
    get_config_value,
    set_config_value,
)

router = APIRouter(prefix="/config", tags=["config"])


class ConfigSetRequest(BaseModel):
    key: str
    value: str


@router.get("")
def read_config(key: str | None = Query(default=None)):
    """
    Si se pasa key, devuelve solo esa config.
    Si no, devuelve toda la configuración.
    """
    if key:
        item = get_config_value(key)
        if not item:
            raise HTTPException(status_code=404, detail="Configuración no encontrada")
        return {
            "ok": True,
            "item": item,
        }

    items = get_all_config()
    return {
        "ok": True,
        "count": len(items),
        "items": items,
    }


@router.post("")
def write_config(req: ConfigSetRequest):
    item = set_config_value(req.key, req.value)
    return {
        "ok": True,
        "item": item,
    }