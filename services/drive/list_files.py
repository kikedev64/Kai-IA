from googleapiclient.discovery import build
from core.auth import get_creds

def list_drive_files(max_results: int = 20):
    creds = get_creds()
    service = build("drive", "v3", credentials=creds)

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

if __name__ == "__main__":
    list_drive_files(20)