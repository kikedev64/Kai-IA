import mimetypes
import re
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError
import io

from services.drive.utils import GOOGLE_EXPORT_MAP, _get_service


def _apply_drive_capabilities(file_data: dict) -> None:
    """Add normalized Drive capability flags to a file result.

    Args:
        file_data: File metadata returned by the Drive API.

    Returns:
        None
    """
    caps = file_data.get("capabilities", {}) or {}

    file_data["canMakePublicLink"] = bool(caps.get("canShare"))
    file_data["canDelete"] = bool(caps.get("canDelete"))
    file_data["canTrash"] = bool(caps.get("canTrash"))
    file_data["ownedByMe"] = bool(file_data.get("ownedByMe"))


def _is_insufficient_file_permissions(error: HttpError) -> bool:
    """Check whether Google rejected a file permissions operation.

    Args:
        error: Google API error raised while reading or changing permissions.

    Returns:
        bool
    """
    return error.resp.status in {403, 404}


def _attach_share_links(file_data: dict, public: bool) -> None:
    """Attach Drive view and download links when they are safe to expose.

    Args:
        file_data: File metadata returned by the Drive API.
        public: Whether the file is known to be publicly readable.

    Returns:
        None
    """
    file_id = file_data["id"]
    file_data["public"] = public

    if public:
        file_data["publicLink"] = (
            f"https://drive.google.com/file/d/{file_id}/view?usp=sharing"
        )
        file_data["downloadUrl"] = (
            f"https://drive.google.com/uc?id={file_id}&export=download"
        )
        return

    file_data["publicLink"] = file_data.get("webViewLink")
    file_data["downloadUrl"] = None


def _ensure_public_reader_permission(service: object, file_id: str) -> bool:
    """Ensure a Drive file has an anyone-reader permission when allowed.

    Args:
        service: Google Drive service client.
        file_id: Identifier of the Drive file.

    Returns:
        bool
    """
    perms = (
        service.permissions()
        .list(
            fileId=file_id,
            fields="permissions(id,type,role)",
            supportsAllDrives=True,
        )
        .execute()
        .get("permissions", [])
    )

    already_public = any(
        p.get("type") == "anyone" and p.get("role") == "reader" for p in perms
    )

    if already_public:
        return True

    service.permissions().create(
        fileId=file_id,
        body={
            "type": "anyone",
            "role": "reader",
        },
        fields="id",
        supportsAllDrives=True,
    ).execute()

    return True


def _drive_name_query(name_query: str) -> str:
    """Build a Drive query that supports simple name alternatives.

    Args:
        name_query: Drive filename search query.

    Returns:
        str
    """
    parts = [
        part.strip(" '\"")
        for part in re.split(r"\s+(?:o|or)\s+|[,;|]", name_query, flags=re.IGNORECASE)
        if part.strip(" '\"")
    ]
    terms = parts or [name_query.strip(" '\"")]
    escaped_terms = [term.replace("'", "\\'") for term in terms if term]

    if not escaped_terms:
        return "trashed=false"

    name_filters = " or ".join(f"name contains '{term}'" for term in escaped_terms)
    return f"({name_filters}) and trashed=false"


def list_drive_files(max_results: int = 20) -> dict:
    """Return the drive files list.

    Args:
        max_results: Maximum number of items to return.

    Returns:
        dict
    """
    service = _get_service()

    res = (
        service.files()
        .list(
            pageSize=max_results,
            fields="files(id,name,mimeType,webViewLink,modifiedTime,size,ownedByMe,capabilities(canShare,canDelete,canTrash)),nextPageToken",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )

    items = res.get("files", [])

    for f in items:
        _apply_drive_capabilities(f)

    return {"items": items, "nextPageToken": res.get("nextPageToken")}


def get_public_download_link(file_id: str, export_fmt: str | None = None) -> dict:
    """Return the public download link.

    Args:
        file_id: Identifier of the Drive file.
        export_fmt: Google export format used for the download link.

    Returns:
        dict
    """
    service = _get_service()

    try:
        _ensure_public_reader_permission(service, file_id)
    except HttpError as e:
        if _is_insufficient_file_permissions(e):
            return {
                "id": file_id,
                "public": False,
                "downloadUrl": None,
                "webViewLink": None,
                "error": "No tienes permisos suficientes para compartir este archivo.",
            }
        raise

    meta = (
        service.files()
        .get(
            fileId=file_id,
            fields="id,name,mimeType,webViewLink",
            supportsAllDrives=True,
        )
        .execute()
    )

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
        meta = service.files().get(fileId=file_id, fields="id,name,mimeType").execute()

        service.files().delete(fileId=file_id).execute()

        return {"deleted": True, **meta}

    except HttpError as e:
        if e.resp.status == 404:
            return {"deleted": False, "error": "File not found", "id": file_id}
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

    media = MediaIoBaseUpload(fh, mimetype=mime_type, resumable=True)

    uploaded = (
        service.files()
        .create(
            body=metadata, media_body=media, fields="id,name,mimeType,modifiedTime,size"
        )
        .execute()
    )

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

    query = _drive_name_query(name_query)

    res = (
        service.files()
        .list(
            q=query,
            pageSize=max_results,
            fields="files(id,name,mimeType,webViewLink,modifiedTime,size,ownedByMe,capabilities(canShare,canDelete,canTrash)),nextPageToken",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )

    items = res.get("files", [])

    for f in items:
        file_id = f["id"]

        _apply_drive_capabilities(f)

        if not f["canMakePublicLink"]:
            f["shareStatus"] = "not_shareable"
            f["shareError"] = "No tienes permisos suficientes para compartir este archivo."
            _attach_share_links(f, public=False)
            continue

        try:
            _ensure_public_reader_permission(service, file_id)
            f["shareStatus"] = "public"
            _attach_share_links(f, public=True)
        except HttpError as e:
            if not _is_insufficient_file_permissions(e):
                raise

            f["shareStatus"] = "permission_denied"
            f["shareError"] = (
                "Google Drive no permite leer o cambiar permisos de este archivo."
            )
            _attach_share_links(f, public=False)

    return {
        "items": items,
        "nextPageToken": res.get("nextPageToken"),
    }
