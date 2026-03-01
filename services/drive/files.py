import mimetypes
import os
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
import io
from services.drive.utils import GOOGLE_EXPORT_MAP, _get_service


def list_drive_files(max_results: int = 20):
    service = _get_service()

    res = service.files().list(
        pageSize=max_results,
        fields="files(id,name,mimeType,modifiedTime,size,ownedByMe,capabilities(canShare,canDelete,canTrash)),nextPageToken",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    items = res.get("files", [])

    for f in items:
        caps = f.get("capabilities", {}) or {}

        f["canMakePublicLink"] = bool(caps.get("canShare"))
        f["canDelete"] = bool(caps.get("canDelete"))
        f["canTrash"] = bool(caps.get("canTrash"))
        f["ownedByMe"] = bool(f.get("ownedByMe"))

    return {"items": items, "nextPageToken": res.get("nextPageToken")}

def get_public_download_link(file_id: str, export_fmt: str | None = None) -> dict:
    service = _get_service()

    service.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
        fields="id"
    ).execute()

    meta = service.files().get(
        fileId=file_id,
        fields="id,name,mimeType,webViewLink"
    ).execute()

    mime_type = meta["mimeType"]

    if mime_type in GOOGLE_EXPORT_MAP:
        default_fmt, url_tpl = GOOGLE_EXPORT_MAP[mime_type]
        fmt = export_fmt or default_fmt
        download_url = url_tpl.format(id=file_id, fmt=fmt)

        return {
            "id": meta["id"],
            "name": meta["name"],
            "mimeType": mime_type,
            "public": True,
            "downloadUrl": download_url,
            "webViewLink": meta.get("webViewLink"),
            "exportFormat": fmt,
        }

    download_url = f"https://drive.google.com/uc?id={file_id}&export=download"

    return {
        "id": meta["id"],
        "name": meta["name"],
        "mimeType": mime_type,
        "public": True,
        "downloadUrl": download_url,
        "webViewLink": meta.get("webViewLink"),
    }


def delete_drive_file(file_id: str) -> dict:
    service = _get_service()

    try:
        meta = service.files().get(
            fileId=file_id,
            fields="id,name,mimeType"
        ).execute()

        service.files().delete(fileId=file_id).execute()

        return {"deleted": True, **meta}

    except HttpError as e:
        if e.resp.status == 404:
            return {"deleted": False, "error": "File not found", "id": file_id}
        raise

def upload_drive_file(
    filename: str,
    file_data,
    folder_id: str | None = None,
    mime_type: str | None = None,
):
    service = _get_service()

    if not mime_type:
        mime_type, _ = mimetypes.guess_type(filename)
    mime_type = mime_type or "application/octet-stream"

    metadata = {"name": filename}
    if folder_id:
        metadata["parents"] = [folder_id]

    fh = io.BytesIO(file_data)
    media = MediaIoBaseUpload(fh, mimetype=mime_type, resumable=True)

    uploaded = service.files().create(
        body=metadata,
        media_body=media,
        fields="id,name,mimeType,modifiedTime,size"
    ).execute()

    return uploaded

def search_drive_files_by_name(name_query: str, max_results: int = 20):

    service = _get_service()

    query = f"name contains '{name_query}' and trashed=false"

    res = service.files().list(
        q=query,
        pageSize=max_results,
        fields="files(id,name,mimeType,modifiedTime,size,ownedByMe,capabilities(canShare,canDelete,canTrash)),nextPageToken",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    items = res.get("files", [])

    # Normalizamos flags igual que en list
    for f in items:
        caps = f.get("capabilities", {}) or {}

        f["canMakePublicLink"] = bool(caps.get("canShare"))
        f["canDelete"] = bool(caps.get("canDelete"))
        f["canTrash"] = bool(caps.get("canTrash"))
        f["ownedByMe"] = bool(f.get("ownedByMe"))

    return {
        "items": items,
        "nextPageToken": res.get("nextPageToken"),
    }