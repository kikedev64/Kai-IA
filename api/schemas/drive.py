from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field

class DriveCapabilities(BaseModel):
    canShare: Optional[bool] = None
    canDelete: Optional[bool] = None
    canTrash: Optional[bool] = None

class DriveFile(BaseModel):
    id: str
    name: str
    mimeType: str
    modifiedTime: Optional[str] = None
    size: Optional[str] = None
    capabilities: Optional[DriveCapabilities] = None
    canMakePublicLink: Optional[bool] = None
    ownedByMe: Optional[bool] = None

class DriveListFilesResponse(BaseModel):
    items: list[DriveFile] = Field(default_factory=list)
    nextPageToken: Optional[str] = None

class DrivePublicLinkResponse(BaseModel):
    id: str
    name: str
    mimeType: str
    public: bool
    downloadUrl: str
    webViewLink: Optional[str] = None
    exportFormat: Optional[str] = None

class DriveDeleteResponse(BaseModel):
    deleted: bool
    id: str
    name: Optional[str] = None
    mimeType: Optional[str] = None
    error: Optional[str] = None