from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.routing import APIRouter
from database import init_db
import os

app = FastAPI(title="QR Order System API", version="0.1.0")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    await init_db()

# ── 1) 모든 API 라우터를 /api prefix로 통합 ──────────────────────────
# 프론트엔드에서 axios.get('/api/stores/...') 형태로 호출하므로
# Vite proxy 없이도 /api/* 경로가 FastAPI에 직접 전달되어야 함
from routers import (
    stores, menus, orders, qr, ws, stats, auth, admin,
    billing, pos, reviews, ai, super_admin, loyalty_analytics,
    sessions, translate, tables, guests, oauth, demo, webhooks, square_oauth,
    register, discover, takeout, staff_auth, paypay, messaging
)

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(oauth.router)
api_router.include_router(stores.router)
api_router.include_router(menus.router)
api_router.include_router(orders.router)
api_router.include_router(qr.router)
api_router.include_router(admin.router)
api_router.include_router(ws.router)
api_router.include_router(stats.router)
api_router.include_router(billing.router)
api_router.include_router(pos.router)
api_router.include_router(reviews.router)
api_router.include_router(ai.router)
api_router.include_router(super_admin.router)
api_router.include_router(loyalty_analytics.router)
api_router.include_router(sessions.router)
api_router.include_router(translate.router)
api_router.include_router(tables.router)
api_router.include_router(guests.router)
api_router.include_router(demo.router)
api_router.include_router(register.router)
api_router.include_router(discover.router)
api_router.include_router(takeout.router)
api_router.include_router(staff_auth.router)
api_router.include_router(paypay.router)
api_router.include_router(messaging.router)

app.include_router(api_router)

# ── 2) 정적 파일 경로 설정 ────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend-react", "dist"))
PUBLIC_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend-react", "public"))

if os.path.exists(os.path.join(DIST_DIR, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

images_dir = os.path.join(PUBLIC_DIR, "images")
if os.path.exists(images_dir):
    app.mount("/images", StaticFiles(directory=images_dir), name="images")

# ドキュメント (決済導入ガイド等)
docs_dir = os.path.join(PUBLIC_DIR, "docs")
if os.path.exists(docs_dir):
    app.mount("/docs", StaticFiles(directory=docs_dir, html=True), name="docs")

# 메뉴 이미지 업로드 폴더 (GCS 폴백용 로컬 저장)
uploads_dir = os.path.join(DIST_DIR, "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# ── 3) SPA Catch-all: /api 외 모든 경로 → index.html ─────────────────
INDEX_HTML = os.path.join(DIST_DIR, "index.html")

@app.get("/favicon.png", include_in_schema=False)
async def serve_favicon():
    favicon_path = os.path.join(DIST_DIR, "favicon.png")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    
    # 개발 서버(vite fallback)
    public_path = os.path.join(PUBLIC_DIR, "favicon.png")
    if os.path.exists(public_path):
        return FileResponse(public_path)
        
    return {"error": "Favicon not found"}

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """React Router SPA fallback — index.html 반환"""
    if os.path.exists(INDEX_HTML):
        return FileResponse(INDEX_HTML)
    return {"error": "Frontend build not found. Run: npm run build"}
