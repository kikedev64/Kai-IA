from fastapi import FastAPI
from api.routers.gmail import router as gmail_router
from api.routers.auth import router as auth_router
from api.routers.drive import router as drive_router
from api.routers.tasks import router as tasks_router
app = FastAPI(
    title="Kai IA API",
    version="0.1.0"
)

app.include_router(gmail_router)
app.include_router(auth_router)
app.include_router(drive_router)
app.include_router(tasks_router)