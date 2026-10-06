"""
SolarSense platform backend (served at /api through the Kubernetes ingress).

Layers
  solarsense/src/api.py   -> digital twin simulator + ML endpoints (router)
  assistant.py            -> AI maintenance copilot (Gemini, streamed via SSE)
  server.py (this file)   -> composition root: mounts routers, lifecycle, CORS
"""
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
sys.path.insert(0, str(ROOT_DIR / "solarsense" / "src"))

import api as solarsense  # noqa: E402
from assistant import router as assistant_router, client  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    solarsense.load_model()
    solarsense.twin.start()
    yield
    await solarsense.twin.stop()
    client.close()


app = FastAPI(title="SolarSense Platform API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"service": "SolarSense", "status": "online"}


api_router.include_router(solarsense.router)
api_router.include_router(assistant_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
