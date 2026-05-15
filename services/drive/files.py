import mimetypes
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
import io

from services.drive.utils import GOOGLE_EXPORT_MAP, _get_service


def list_drive_files(max_results: int = 20) -> dict:
    """Return the drive files list.

    Args:
        max_results: Maximum number of items to return.

    Returns:
        dict
    """
    service = _get_service()

    res = service.files().list(
        pageSize=max_results,
        fields="files(id,name,mimeType,webViewLink,modifiedTime,size,ownedByMe,capabilities(canShare,canDelete,canTrash)),nextPageToken",
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

    return {
        "items": items,
        "nextPageToken": res.get("nextPageToken")
    }


def get_public_download_link(file_id: str, export_fmt: str | None = None) -> dict:
    """Return the public download link.

    Args:
        file_id: Identifier of the Drive file.
        export_fmt: Google export format used for the download link.

    Returns:
        dict
    """
    service = _get_service()

    perms = service.permissions().list(
        fileId=file_id,
        fields="permissions(id,type,role)",
        supportsAllDrives=True,
    ).execute().get("permissions", [])

    already_public = any(
        p.get("type") == "anyone" and p.get("role") == "reader"
        for p in perms
    )

    if not already_public:
        service.permissions().create(
            fileId=file_id,
            body={
                "type": "anyone",
                "role": "reader",
            },
            fields="id",
            supportsAllDrives=True,
        ).execute()

    meta = service.files().get(
        fileId=file_id,
        fields="id,name,mimeType,webViewLink",
        supportsAllDrives=True,
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
    public_view = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"

    return {
        "id": meta["id"],
        "name": meta["name"],
        "mimeType": mime_type,
        "public": True,
        "downloadUrl": download_url,
        "webViewLink": public_view,
    }


def delete_drive_file(file_id: str) -> dict:
    """Delete the drive file.

    Args:
        file_id: Identifier of the Drive file.

    Returns:
        dict
    """
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
            return {
                "deleted": False,
                "error": "File not found",
                "id": file_id
            }
        raise


def upload_drive_file(
    filename: str,
    file_data: bytes,
    folder_id: str | None = None,
    mime_type: str | None = None,
) -> dict:
    """Upload a file to Google Drive.

    Args:
        filename: Name of the uploaded Drive file.
        file_data: Binary content of the uploaded Drive file.
        folder_id: Identifier of the folder.
        mime_type: MIME type assigned to the uploaded file.

    Returns:
        dict
    """
    service = _get_service()

    if not mime_type:
        mime_type, _ = mimetypes.guess_type(filename)

    mime_type = mime_type or "application/octet-stream"

    metadata = {"name": filename}

    if folder_id:
        metadata["parents"] = [folder_id]

    fh = io.BytesIO(file_data)

    media = MediaIoBaseUpload(
        fh,
        mimetype=mime_type,
        resumable=True
    )

    uploaded = service.files().create(
        body=metadata,
        media_body=media,
        fields="id,name,mimeType,modifiedTime,size"
    ).execute()

    return uploaded


def search_drive_files_by_name(name_query: str, max_results: int = 20) -> dict:
    """Search Google Drive files by name.

    Args:
        name_query: Drive filename search query.
        max_results: Maximum number of items to return.

    Returns:
        dict
    """

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

    for f in items:
        file_id = f["id"]

        caps = f.get("capabilities", {}) or {}

        f["canMakePublicLink"] = bool(caps.get("canShare"))
        f["canDelete"] = bool(caps.get("canDelete"))
        f["canTrash"] = bool(caps.get("canTrash"))
        f["ownedByMe"] = bool(f.get("ownedByMe"))

        perms = service.permissions().list(
            fileId=file_id,
            fields="permissions(id,type,role)",
            supportsAllDrives=True,
        ).execute().get("permissions", [])

        already_public = any(
            p.get("type") == "anyone" and p.get("role") == "reader"
            for p in perms
        )

        if not already_public:
            service.permissions().create(
                fileId=file_id,
                body={
                    "type": "anyone",
                    "role": "reader"
                },
                fields="id",
                supportsAllDrives=True,
            ).execute()

        f["publicLink"] = f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
        f["downloadUrl"] = f"https://drive.google.com/uc?id={file_id}&export=download"

    return {
        "items": items,
        "nextPageToken": res.get("nextPageToken"),
    }
