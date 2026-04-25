"""
이미지 리사이즈 + WebP 변환 파이프라인 단위 테스트.
GCS 업로드 부분은 mock 처리 (실제 GCS 인증 없이 테스트 가능).

실행: python -m pytest test_image_pipeline.py -v
"""

import io
import sys
import os

# 프로젝트 루트를 path에 추가
sys.path.insert(0, os.path.dirname(__file__))

from PIL import Image
import pytest


def create_test_image(width=2000, height=1500, mode="RGB", fmt="PNG"):
    """테스트용 이미지 바이트 생성"""
    img = Image.new(mode, (width, height), color=(255, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf.read()


class TestResizeAndCompressImage:
    """resize_and_compress_image 함수 테스트"""

    def test_oversized_image_gets_resized(self):
        """1024px 초과 이미지가 리사이즈되는지 확인"""
        from services.gcs_client import resize_and_compress_image

        raw = create_test_image(2000, 1500)
        result = resize_and_compress_image(raw, max_width=1024)

        # 결과가 유효한 WebP인지 확인
        img = Image.open(result)
        assert img.format == "WEBP"
        assert img.size[0] == 1024
        # 비율 유지: 1500 * (1024/2000) = 768
        assert img.size[1] == 768

    def test_small_image_not_resized(self):
        """1024px 이하 이미지는 원본 크기 유지"""
        from services.gcs_client import resize_and_compress_image

        raw = create_test_image(800, 600)
        result = resize_and_compress_image(raw, max_width=1024)

        img = Image.open(result)
        assert img.format == "WEBP"
        assert img.size == (800, 600)

    def test_rgba_to_rgb_conversion(self):
        """RGBA 이미지가 RGB로 변환되는지 확인"""
        from services.gcs_client import resize_and_compress_image

        raw = create_test_image(500, 500, mode="RGBA")
        result = resize_and_compress_image(raw, max_width=1024)

        img = Image.open(result)
        assert img.format == "WEBP"
        assert img.size == (500, 500)

    def test_webp_output_smaller_than_original(self):
        """WebP 변환 결과가 원본보다 작은지 확인 (일반적인 경우)"""
        from services.gcs_client import resize_and_compress_image

        raw = create_test_image(2000, 1500)
        result = resize_and_compress_image(raw, max_width=1024)

        original_size = len(raw)
        webp_size = result.getbuffer().nbytes
        assert webp_size < original_size, (
            f"WebP ({webp_size:,}B) should be smaller than original ({original_size:,}B)"
        )

    def test_invalid_image_raises_error(self):
        """잘못된 이미지 데이터 시 ValueError 발생"""
        from services.gcs_client import resize_and_compress_image

        with pytest.raises(ValueError, match="이미지 파일을 열 수 없습니다"):
            resize_and_compress_image(b"not an image at all")

    def test_quality_parameter(self):
        """quality 파라미터가 출력 크기에 영향을 미치는지 확인 (복잡한 이미지 사용)"""
        from services.gcs_client import resize_and_compress_image
        import random

        # 단색이 아닌 복잡한 그라데이션 이미지 생성 (WebP 압축 차이가 명확)
        img = Image.new("RGB", (800, 600))
        pixels = img.load()
        for x in range(800):
            for y in range(600):
                pixels[x, y] = (x % 256, y % 256, (x + y) % 256)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        raw = buf.getvalue()

        high_q = resize_and_compress_image(raw, quality=95)
        low_q = resize_and_compress_image(raw, quality=30)

        assert low_q.getbuffer().nbytes < high_q.getbuffer().nbytes


class TestUploadImageToGCS:
    """upload_image_to_gcs 함수 테스트 (GCS mock)"""

    def test_upload_returns_public_url(self):
        """GCS 업로드 성공 시 올바른 URL 형식 반환"""
        from unittest.mock import MagicMock
        import sys

        raw = create_test_image(800, 600)

        mock_storage_module = MagicMock()
        mock_client_instance = MagicMock()
        mock_bucket = MagicMock()
        mock_blob = MagicMock()

        mock_storage_module.Client.return_value = mock_client_instance
        mock_client_instance.bucket.return_value = mock_bucket
        mock_bucket.blob.return_value = mock_blob

        # google.cloud 모듈의 storage 속성이 올바른 mock을 가리키도록 설정
        mock_google = MagicMock()
        mock_google_cloud = MagicMock()
        mock_google_cloud.storage = mock_storage_module

        saved_modules = {}
        mock_modules = {
            "google": mock_google,
            "google.cloud": mock_google_cloud,
            "google.cloud.storage": mock_storage_module,
        }
        for mod_name, mod_mock in mock_modules.items():
            saved_modules[mod_name] = sys.modules.get(mod_name)
            sys.modules[mod_name] = mod_mock

        try:
            # 캐시된 모듈 제거 후 재임포트
            if "services.gcs_client" in sys.modules:
                del sys.modules["services.gcs_client"]

            from services.gcs_client import upload_image_to_gcs
            url = upload_image_to_gcs(raw, store_id=42)

            # URL 형식 확인
            assert url.startswith("https://storage.googleapis.com/")
            assert "/menus/42/" in url
            assert url.endswith(".webp")

            # upload_from_file이 image/webp로 호출되었는지 확인
            mock_blob.upload_from_file.assert_called_once()
            call_kwargs = mock_blob.upload_from_file.call_args
            assert call_kwargs.kwargs["content_type"] == "image/webp"
        finally:
            # sys.modules 복원
            for mod_name, original in saved_modules.items():
                if original is None:
                    sys.modules.pop(mod_name, None)
                else:
                    sys.modules[mod_name] = original
            sys.modules.pop("services.gcs_client", None)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
