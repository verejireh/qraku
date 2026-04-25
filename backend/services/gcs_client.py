"""
GCS 이미지 업로드 서비스
- 메뉴 이미지를 자동으로 리사이즈 (max 1024px) + WebP 변환 후
  GCP Cloud Storage에 업로드하는 파이프라인.
- 모든 작업은 메모리(io.BytesIO) 상에서 처리하여 서버 디스크를 사용하지 않음.
"""

import io
import uuid
import os
import logging

from dotenv import load_dotenv
from PIL import Image, ImageOps

load_dotenv()

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 1단계: 이미지 리사이즈 + WebP 변환
# ──────────────────────────────────────────────

def resize_and_compress_image(
    file_bytes: bytes,
    max_width: int = 1024,
    quality: int = 85,
) -> io.BytesIO:
    """
    원본 이미지 바이트를 받아서:
      1) EXIF 방향 보정
      2) max_width 초과 시 비율 유지 리사이즈
      3) RGBA → RGB 변환 (WebP 호환)
      4) WebP(quality=85)로 변환
    
    Returns:
        io.BytesIO — WebP 바이너리가 담긴 버퍼 (seek(0) 완료)
    
    Raises:
        ValueError: 이미지를 열 수 없거나 형식이 잘못된 경우
    """
    try:
        img = Image.open(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"이미지 파일을 열 수 없습니다: {e}")

    # EXIF 방향 정보 보정 (모바일 촬영 사진 회전 방지)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass  # EXIF 없으면 패스

    # 리사이즈 (가로 max_width 초과 시만)
    w, h = img.size
    if w > max_width:
        ratio = max_width / w
        new_h = int(h * ratio)
        img = img.resize((max_width, new_h), Image.LANCZOS)
        logger.info(f"이미지 리사이즈: {w}x{h} → {max_width}x{new_h}")

    # RGBA → RGB 변환 (투명 배경 → 흰색으로 채움)
    if img.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
        img = background

    # WebP로 변환
    output_buffer = io.BytesIO()
    img.save(output_buffer, format="WEBP", quality=quality, method=4)
    output_buffer.seek(0)

    original_size = len(file_bytes)
    webp_size = output_buffer.getbuffer().nbytes
    logger.info(
        f"WebP 변환 완료: {original_size:,} bytes → {webp_size:,} bytes "
        f"({(1 - webp_size / original_size) * 100:.1f}% 절약)"
    )

    return output_buffer


# ──────────────────────────────────────────────
# 2단계: GCS 업로드
# ──────────────────────────────────────────────

def upload_image_to_gcs(
    file_bytes: bytes,
    store_id: int,
    filename_prefix: str = "menu",
) -> str:
    """
    이미지를 리사이즈/WebP 변환 후 GCS에 업로드.
    GCS 키가 없으면 로컬 서버(static/uploads/)에 저장하는 폴백 로직 포함.

    Args:
        file_bytes: 원본 이미지 바이트
        store_id: 가맹점 ID (GCS 폴더 구분용)
        filename_prefix: 파일명 접두사

    Returns:
        str — 이미지 공개 URL

    Raises:
        ValueError: 이미지 처리 실패
        RuntimeError: 업로드 실패
    """
    # 1) 이미지 최적화
    webp_buffer = resize_and_compress_image(file_bytes)

    # 2) GCS 업로드 시도
    bucket_name = os.getenv("GCS_BUCKET_NAME", "qraku-menu-images")
    gcs_key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

    try:
        from google.cloud import storage as _gcs_storage

        # 키 파일이 명시적으로 설정되어 있고 존재하면 GCS 사용
        if gcs_key_path and os.path.exists(gcs_key_path):
            client = _gcs_storage.Client()
        else:
            # 키 파일이 없으면 기본 credentials 시도
            client = _gcs_storage.Client()

        bucket = client.bucket(bucket_name)

        # 고유 파일명 생성: menus/{store_id}/{prefix}_{uuid}.webp
        unique_id = uuid.uuid4().hex[:12]
        blob_path = f"menus/{store_id}/{filename_prefix}_{unique_id}.webp"
        blob = bucket.blob(blob_path)

        blob.upload_from_file(
            webp_buffer,
            content_type="image/webp",
            rewind=True,
        )

        # 공개 URL 생성
        public_url = f"https://storage.googleapis.com/{bucket_name}/{blob_path}"
        logger.info(f"GCS 업로드 완료: {public_url}")
        return public_url

    except Exception as e:
        logger.warning(f"GCS 업로드 실패, 로컬 폴백으로 전환: {e}")

    # 3) 폴백: 로컬 서버에 저장 (GCS 사용 불가 시)
    try:
        # frontend-react/dist/ 경로가 실제 서빙 경로
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        upload_dir = os.path.join(base_dir, "..", "frontend-react", "dist", "uploads", str(store_id))
        os.makedirs(upload_dir, exist_ok=True)

        unique_id = uuid.uuid4().hex[:12]
        filename = f"{filename_prefix}_{unique_id}.webp"
        filepath = os.path.join(upload_dir, filename)

        webp_buffer.seek(0)
        with open(filepath, "wb") as f:
            f.write(webp_buffer.read())

        # 상대 URL 반환 (프론트엔드에서 접근 가능)
        public_url = f"/uploads/{store_id}/{filename}"
        logger.info(f"로컬 저장 완료: {filepath} → URL: {public_url}")
        return public_url

    except Exception as e2:
        logger.error(f"로컬 저장도 실패: {e2}")
        raise RuntimeError(f"이미지 업로드에 실패했습니다: {e2}")
