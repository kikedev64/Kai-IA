from fastapi import HTTPException, status

from core.config import get_expose_service_endpoints


def require_service_endpoints_exposed() -> None:
    """Reject optional direct service endpoints when exposure is disabled.

    Raises:
        HTTPException: Raised with 404 when the route should not be exposed.

    Returns:
        None
    """
    if not get_expose_service_endpoints():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Direct service endpoints are disabled",
        )
