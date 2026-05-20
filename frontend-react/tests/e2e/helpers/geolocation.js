/**
 * Playwright 브라우저 컨텍스트에 가짜 geolocation 주입.
 * 고텐바 (Gotemba) 좌표 기본값.
 */

export const GOTEMBA_COORDS = { latitude: 35.3083, longitude: 138.9328 };

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ latitude: number, longitude: number }} coords
 */
export async function mockGeolocation(context, coords = GOTEMBA_COORDS) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(coords);
}

/**
 * 매장 위치를 API 로 설정 (nearby 결과에 포함되기 위해).
 * PATCH /api/stores/{storeId} — latitude + longitude + allow_public_listing
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {number} storeId
 * @param {string} token  admin JWT
 * @param {{ latitude: number, longitude: number }} coords
 */
export async function setStoreLocation(request, storeId, token, coords = GOTEMBA_COORDS) {
  const apiBase = process.env.E2E_API_BASE || 'http://localhost:8003';
  const resp = await request.patch(`${apiBase}/api/stores/${storeId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      allow_public_listing: true,
    },
  });
  return resp.ok();
}
