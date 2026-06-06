from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class DriveCapabilities(BaseModel):
    """Permission flags returned by Google Drive for a file.

    These values tell the frontend which file actions are available
    for the authenticated user.
    """

    canShare: Optional[bool] = None
    canDelete: Optional[bool] = None
    canTrash: Optional[bool] = None


class DriveFile(BaseModel):
    """Public API representation of a Google Drive file.

    Combines Drive metadata with derived flags used by the file
    browser and action buttons.
    """

    id: str
    name: str
    mimeType: str
    modifiedTime: Optional[str] = None
    size: Optional[str] = None
    capabilities: Optional[DriveCapabilities] = None
    canMakePublicLink: Optional[bool] = None
    ownedByMe: Optional[bool] = None


class DriveListFilesResponse(BaseModel):
    """Response payload returned by the Drive file listing endpoint.

    Includes the current page of files and the optional token needed
    to request the next page.
    """

    items: list[DriveFile] = Field(default_factory=list)
    nextPageToken: Optional[str] = None


class DrivePublicLinkResponse(BaseModel):
    """Response payload for a generated public Drive link.

    Describes the target file and the download or export URL exposed
    after updating its sharing permissions.
    """

    id: str
    name: str
    mimeType: str
    public: bool
    downloadUrl: str
    webViewLink: Optional[str] = None
    exportFormat: Optional[str] = None


class DriveDeleteResponse(BaseModel):
    """Response payload returned after deleting a Drive file.

    Contains the deletion result and basic file metadata when Google
    returns it before removal.
    """

    deleted: bool
    id: str
    name: Optional[str] = None
    mimeType: Optional[str] = None
    error: Optional[str] = None
