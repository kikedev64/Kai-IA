# api/routers/user_profile.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.user_profile_service import get_all_user_profile, get_user_profile_value, parse_llm_profile_output, upsert_user_profile_values
router = APIRouter(prefix="/user-profile", tags=["user-profile"])

class UserProfileLLMRequest(BaseModel):
    llm_output: str


class UserProfileManualRequest(BaseModel):
    data: dict[str, object]


@router.get("/")
def read_user_profile():
    items = get_all_user_profile()
    return {
        "ok": True,
        "count": len(items),
        "items": items,
    }


@router.get("/{key}")
def read_user_profile_key(key: str):
    item = get_user_profile_value(key)
    if not item:
        raise HTTPException(status_code=404, detail="Clave no encontrada")

    return {
        "ok": True,
        "item": item,
    }


@router.post("/onboarding/llm")
def save_user_profile_from_llm(req: UserProfileLLMRequest):
    """
    Recibe el JSON textual generado por el LLM, lo parsea y lo guarda.
    """
    try:
        parsed = parse_llm_profile_output(req.llm_output)
        items = upsert_user_profile_values(parsed)

        return {
            "ok": True,
            "saved_keys": list(parsed.keys()),
            "count": len(parsed),
            "items": items,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
