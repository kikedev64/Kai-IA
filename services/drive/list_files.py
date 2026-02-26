from googleapiclient.http import MediaFileUpload
from googleapiclient.errors import HttpError
from services.drive.utils import GOOGLE_EXPORT_MAP,_get_service
import mimetypes
import os

def list_drive_files(max_results: int = 20):
    service = _get_service()

    res = service.files().list(
        pageSize=max_results,
        fields="files(id,name,mimeType,modifiedTime,size)"
    ).execute()

    files = res.get("files", [])
    if not files:
        print("No hay archivos.")
        return []

    for f in files:
        print(
            f"- {f.get('name')} | {f.get('mimeType')} | id={f.get('id')} | modified={f.get('modifiedTime')}"
        )

    return files


def upload_drive_file( file_path: str, folder_id: str | None = None ):

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"El archivo no existe: {file_path}")

    service = _get_service()

    file_name = os.path.basename(file_path)

    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    file_metadata = {
        "name": file_name
    }

    if folder_id:
        file_metadata["parents"] = [folder_id]

    media = MediaFileUpload(
        file_path,
        mimetype=mime_type,
        resumable=True
    )

    uploaded_file = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id,name,mimeType,modifiedTime,size"
    ).execute()

    print(
        f"Archivo subido: {uploaded_file.get('name')} | id={uploaded_file.get('id')}"
    )

    return uploaded_file

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

        if "{fmt}" in url_tpl and "export/{fmt}" in url_tpl:
            download_url = url_tpl.format(id=file_id, fmt=fmt)
        else:
            download_url = url_tpl.format(id=file_id, fmt=fmt)

        return {
            "id": meta["id"],
            "name": meta["name"],
            "mimeType": mime_type,
            "public": True,
            "downloadUrl": download_url,
            "webViewLink": meta.get("webViewLink")
        }

    download_url = f"https://drive.google.com/uc?id={file_id}&export=download"

    return {
        "id": meta["id"],
        "name": meta["name"],
        "mimeType": mime_type,
        "public": True,
        "downloadUrl": download_url,
        "webViewLink": meta.get("webViewLink")
    }

def delete_drive_file(file_id: str) -> dict:
    """
    Elimina un archivo de Google Drive por su ID.
    """

    service = _get_service()


    try:
        # Opcional: obtener metadata antes de borrar
        meta = service.files().get(
            fileId=file_id,
            fields="id,name,mimeType"
        ).execute()

        service.files().delete(fileId=file_id).execute()

        return {
            "deleted": True,
            "id": meta["id"],
            "name": meta["name"],
            "mimeType": meta["mimeType"]
        }

    except HttpError as e:
        if e.resp.status == 404:
            return {
                "deleted": False,
                "error": "File not found",
                "id": file_id
            }
        else:
            raise