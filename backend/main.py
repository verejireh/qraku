from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.routing import APIRouter
from database import init_db, get_session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select
from models import Store
import os

app = FastAPI(title="QR Order System API", version="0.1.0")

# CORS Middleware
# ALLOWED_ORIGINS=https://qraku.com,https://www.qraku.com
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 보안 헤더 미들웨어
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

@app.on_event("startup")
async def on_startup():
    await init_db()
    from utils.redis import init_redis
    await init_redis()

@app.on_event("shutdown")
async def on_shutdown():
    from utils.redis import close_redis
    await close_redis()


# ── 인프라 헬스체크 (INF-05) ─────────────────────────────────────────
from sqlalchemy import text as _sql_text

@app.get("/api/healthz", tags=["infra"])
async def healthz():
    return {"status": "ok"}

@app.get("/api/readyz", tags=["infra"])
async def readyz(session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(_sql_text("SELECT 1"))
        from utils.redis import get_redis
        await get_redis().ping()
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="not ready")


# ── 1) 모든 API 라우터를 /api prefix로 통합 ──────────────────────────
# 프론트엔드에서 axios.get('/api/stores/...') 형태로 호출하므로
# Vite proxy 없이도 /api/* 경로가 FastAPI에 직접 전달되어야 함
from routers import (
    stores, menus, orders, qr, ws, stats, auth, admin,
    billing, pos, reviews, ai, super_admin, loyalty_analytics,
    sessions, translate, tables, guests, oauth, demo, webhooks, square_oauth,
    register, discover, takeout, staff_auth, paypay, messaging, menu_groups, tabehoudai,
    beta, ws_token
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
api_router.include_router(menu_groups.router)
api_router.include_router(beta.router)
api_router.include_router(tabehoudai.router)
api_router.include_router(webhooks.router)
api_router.include_router(ws_token.router)

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
async def serve_spa(full_path: str, session: AsyncSession = Depends(get_session)):
    """React Router SPA fallback — index.html 반환 및 SEO 메타 태그 주입"""
    if not os.path.exists(INDEX_HTML):
        return {"error": "Frontend build not found. Run: npm run build"}

    # 정적 파일 요청이면 무시 (vite나 로컬 개발 시에는 안 탈 수도 있지만 방어 코드)
    if full_path.startswith("assets/") or full_path.endswith((".js", ".css", ".png", ".jpg", ".ico")):
        return FileResponse(INDEX_HTML)

    path_parts = full_path.strip("/").split("/")
    shop_id = path_parts[0] if path_parts and path_parts[0] else None

    # 기본 index.html 읽기
    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        html_content = f.read()

    # /{shop_id} 퍼블릭 페이지 접속일 경우 메타 태그 동적 주입
    if shop_id and len(path_parts) == 1 and not shop_id.startswith("admin") and not shop_id.startswith("owner"):
        result = await session.execute(select(Store).where(Store.slug == shop_id))
        store = result.scalar_one_or_none()
        
        if store and store.allow_public_listing:
            desc = (store.specialty or f"{store.name}のモバイルオーダー").replace('"', '&quot;')
            title = f"{store.name} - QRaku"
            
            meta_tags = f"""
            <title>{title}</title>
            <meta name="description" content="{desc}" />
            <meta property="og:title" content="{title}" />
            <meta property="og:description" content="{desc}" />
            """
            
            # Use exterior photo or interior photo or placeholder if no logo
            image_url = None
            if store.exterior_photos:
                import json
                try:
                    photos = json.loads(store.exterior_photos)
                    if photos and len(photos) > 0: image_url = photos[0]
                except: pass
            
            if image_url:
                meta_tags += f'<meta property="og:image" content="{image_url}" />\n'
                
            # <title>QRaku</title> 태그를 찾아서 치환
            html_content = html_content.replace("<title>QRaku</title>", meta_tags)

    return HTMLResponse(content=html_content)
