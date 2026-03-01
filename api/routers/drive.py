from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query, UploadFile,File,Form
from googleapiclient.errors import HttpError
from api.schemas.drive import (
    DriveListFilesResponse,
    DrivePublicLinkResponse,
    DriveDeleteResponse,
)
from services.drive.files import list_drive_files, get_public_download_link, delete_drive_file,upload_drive_file, search_drive_files_by_name

router = APIRouter(prefix="/drive", tags=["Drive"])

@router.get("/files", response_model=DriveListFilesResponse)
def api_list_files(max_results: int = Query(20, ge=1, le=200)):
    try:
        res = list_drive_files(max_results=max_results)
        return res
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.post("/files/{file_id}/public-link", response_model=DrivePublicLinkResponse)
def api_make_public_and_get_link(file_id: str, export_fmt: str | None = None):
    try:
        return get_public_download_link(file_id=file_id, export_fmt=export_fmt)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))


@router.delete("/files/{file_id}", response_model=DriveDeleteResponse)
def api_delete_file(file_id: str):
    try:
        return delete_drive_file(file_id=file_id)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))
    
@router.post("/upload")
async def api_upload_file(
    file: UploadFile = File(...),
    folder_id: str | None = Form(default=None),
):
    try:
        content = await file.read()

        uploaded = upload_drive_file(
            filename=file.filename,
            file_data=content,
            folder_id=folder_id,
            mime_type=file.content_type,
        )

        return uploaded

    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))
    
@router.get("/files/search")
def api_search_files(name: str, max_results: int = 20):
    try:
        return search_drive_files_by_name(name, max_results)
    except HttpError as e:
        raise HTTPException(status_code=e.resp.status, detail=str(e))