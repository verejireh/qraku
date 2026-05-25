"""Generate PWA icons (192x192 + 512x512) from the QRaku favicon design.

The source SVG is at frontend-react/public/favicon.svg.
Rather than rasterizing the 32x32 SVG (loses crispness), this script
re-renders the same design natively at the target size using Pillow.

Run:
    python tools/generate_pwa_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG_COLOR = (225, 29, 72, 255)  # #E11D48 brand pink
FG_WHITE = (255, 255, 255, 255)
WHITE_70 = (255, 255, 255, 178)
WHITE_50 = (255, 255, 255, 127)

# Font candidates for the 楽 glyph (first match wins)
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\NotoSansJP-VF.ttf",
    r"C:\Windows\Fonts\YuGothB.ttc",
    r"C:\Windows\Fonts\meiryob.ttc",
    r"C:\Windows\Fonts\msgothic.ttc",
]


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise RuntimeError("No suitable Japanese font found")


def render_icon(size: int) -> Image.Image:
    """Render the QRaku icon at the given square size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded square: 32px → radius 7 ≈ 22%
    radius = int(size * 7 / 32)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG_COLOR)

    # QR corner markers — outer 6x6 white, inner 3x3 pink, at (4,4)/(22,4)/(4,22) in 32-grid
    # Outer radius 1/32 ≈ 3%, inner radius 0.5/32 ≈ 1.5%
    def qr_corner(cx32: float, cy32: float) -> None:
        x0 = cx32 * size / 32
        y0 = cy32 * size / 32
        w = 6 * size / 32
        outer_r = max(1, int(1 * size / 32))
        draw.rounded_rectangle(
            (x0, y0, x0 + w, y0 + w), radius=outer_r, fill=FG_WHITE
        )
        # inner 3x3 offset (5.5, 5.5) — center of 6x6
        ix = (cx32 + 1.5) * size / 32
        iy = (cy32 + 1.5) * size / 32
        iw = 3 * size / 32
        inner_r = max(1, int(0.5 * size / 32))
        draw.rounded_rectangle(
            (ix, iy, ix + iw, iy + iw), radius=inner_r, fill=BG_COLOR
        )

    qr_corner(4, 4)
    qr_corner(22, 4)
    qr_corner(4, 22)

    # Small dots bottom-right (2.5x2.5 at 22/25.5)
    dot_r = max(1, int(0.5 * size / 32))
    dot_w = 2.5 * size / 32
    for cx32, cy32, color in [
        (22, 22, WHITE_70),
        (25.5, 22, WHITE_70),
        (22, 25.5, WHITE_70),
        (25.5, 25.5, WHITE_50),
    ]:
        x = cx32 * size / 32
        y = cy32 * size / 32
        draw.rounded_rectangle((x, y, x + dot_w, y + dot_w), radius=dot_r, fill=color)

    # Center 楽 character — font-size 14/32 of base
    font_px = int(14 * size / 32)
    font = _load_font(font_px)
    text = "楽"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # SVG places y=20.5 with text-anchor middle at x=16, font-size 14.
    # That puts the glyph baseline at 20.5; center vertically a bit above middle.
    cx = size / 2 - bbox[0] - tw / 2
    cy = size / 2 - bbox[1] - th / 2
    draw.text((cx, cy), text, font=font, fill=FG_WHITE)

    return img


def main() -> None:
    out_dir = Path(__file__).resolve().parents[1] / "frontend-react" / "public"
    for size in (192, 512):
        icon = render_icon(size)
        out_path = out_dir / f"icon-{size}.png"
        icon.save(out_path, "PNG", optimize=True)
        print(f"wrote {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()
