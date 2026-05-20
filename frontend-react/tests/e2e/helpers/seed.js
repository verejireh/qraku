/**
 * STB-02 테스트 시드 헬퍼
 *
 * 테스트 실행 전 격리된 Store + Table + Menu 를 생성합니다.
 * POST /api/stores/signup → POST /api/stores/{id}/tables → POST /api/menus/
 *
 * 사용법:
 *   import { seedTestStore } from './helpers/seed.js';
 *   const ctx = await seedTestStore(request);
 *   // ctx = { store, token, menu, slug, storeId }
 */

export const API_BASE = process.env.E2E_API_BASE || 'http://localhost:8003';

/**
 * 백엔드 헬스체크. 미가동 시 null 반환 (test.skip 으로 처리).
 */
export async function checkBackendHealth(request) {
  try {
    const resp = await request.get(`${API_BASE}/api/healthz`, { timeout: 5_000 });
    return resp.ok();
  } catch {
    return false;
  }
}

/**
 * 테스트 전용 Store + Table + Menu 생성.
 * slug 는 ts 기반 유니크 값으로 충돌 없음.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {{ store, token, menu, slug, storeId }}
 */
export async function seedTestStore(request) {
  const ts = Date.now();
  const slug = `stb-test-${ts}`;
  const email = `stb-${ts}@test.invalid`;

  // 1. 매장 생성 (POST /api/stores/signup)
  const signupResp = await request.post(`${API_BASE}/api/stores/signup`, {
    data: {
      owner_name: 'STB Tester',
      email,
      password: 'Test1234!',
      store_name: 'STB Test Store',
      category: 'restaurant',
      address: '富士山',
      slug,
    },
  });
  if (!signupResp.ok()) {
    const body = await signupResp.text();
    throw new Error(`seed: signup failed ${signupResp.status()} — ${body}`);
  }
  const { store, token } = await signupResp.json();

  // 2. 테이블 생성 (POST /api/stores/{id}/tables — 인증 불필요)
  await request.post(`${API_BASE}/api/stores/${store.id}/tables`, {
    data: { table_number: '1', store_id: store.id },
  });

  // 3. 메뉴 생성 (POST /api/menus/ — Bearer 필요)
  const menuResp = await request.post(`${API_BASE}/api/menus/`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      store_id: store.id,
      name_jp: 'テストラーメン',
      name_en: 'Test Ramen',
      name_ko: '테스트 라면',
      price: 500,
      category: 'テスト',
      is_available: true,
    },
  });
  // 번역 Dramatiq 태스크 실패로 5xx 가 올 수 있으나 메뉴 자체는 DB 에 저장됨.
  // ok() 체크는 2xx 만 통과 → 503(dramatiq) 시 경고만.
  let menu = null;
  if (menuResp.ok()) {
    menu = await menuResp.json();
  } else {
    console.warn(`seed: menu create returned ${menuResp.status()} (dramatiq 미가동?). 계속 진행.`);
  }

  return { store, token, menu, slug, storeId: store.id };
}
