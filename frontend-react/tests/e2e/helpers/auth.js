/**
 * STB-03 인증 헬퍼
 *
 * Admin 로그인 API 래퍼.
 * 시드 계정(seedTestStore 로 만든 매장)용으로 설계되었으나
 * 임의의 이메일/비밀번호 쌍에도 사용 가능.
 *
 * 엔드포인트: POST /api/auth/admin/login
 * 바디: { email, password }
 * 응답: { token, store_id, slug, store_name }
 */

export const API_BASE = process.env.E2E_API_BASE || 'http://localhost:8003';

/**
 * Admin 로그인 → JWT 응답 반환.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, store_id: number, slug: string, store_name: string }>}
 */
export async function adminLogin(request, email, password) {
  const resp = await request.post(`${API_BASE}/api/auth/admin/login`, {
    data: { email, password },
  });
  if (!resp.ok()) throw new Error(`adminLogin failed: ${resp.status()}`);
  return await resp.json(); // { token, store_id, slug, store_name }
}

/**
 * 마스터 PIN 설정 — 신규 매장 (기존 PIN 없을 때).
 * PATCH /api/admin/stores/{storeId}/master-pin
 * @returns {boolean} 성공 여부
 */
export async function setMasterPin(request, storeId, token, pin = '123456') {
  const resp = await request.patch(
    `${API_BASE}/api/admin/stores/${storeId}/master-pin`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { master_pin: pin },
    },
  );
  return resp.ok();
}

/**
 * 마스터 PIN 으로 스태프 토큰 취득 (API 직통).
 * POST /api/staff-auth/master/{shopId}
 * @returns {{ role, shop_id, token }}
 */
export async function masterPinLogin(request, shopId, pin = '123456') {
  const resp = await request.post(`${API_BASE}/api/staff-auth/master/${shopId}`, {
    data: { pin },
  });
  if (!resp.ok()) throw new Error(`masterPinLogin failed ${resp.status()}`);
  return await resp.json();
}
