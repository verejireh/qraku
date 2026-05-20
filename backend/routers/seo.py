"""SEO endpoints — /sitemap.xml + /robots.txt (root-level, no /api prefix)."""
import os

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from database import get_session
from models import Store

router = APIRouter(tags=["seo"])

_BASE = os.getenv("FRONTEND_BASE_URL", "https://qraku.com").rstrip("/")


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Store.slug, Store.id, Store.created_at)
        .where(Store.allow_public_listing == True)   # noqa: E712
    )
    stores = result.all()

    entries = [
        f"  <url>\n"
        f"    <loc>{_BASE}/discover</loc>\n"
        f"    <changefreq>daily</changefreq>\n"
        f"    <priority>0.8</priority>\n"
        f"  </url>"
    ]
    for row in stores:
        slug = row.slug or str(row.id)
        lastmod = row.created_at.strftime("%Y-%m-%d") if row.created_at else ""
        entries.append(
            f"  <url>\n"
            f"    <loc>{_BASE}/{slug}</loc>\n"
            + (f"    <lastmod>{lastmod}</lastmod>\n" if lastmod else "")
            + f"    <changefreq>weekly</changefreq>\n"
            f"    <priority>0.6</priority>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


@router.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n\n"
        f"Sitemap: {_BASE}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain")
