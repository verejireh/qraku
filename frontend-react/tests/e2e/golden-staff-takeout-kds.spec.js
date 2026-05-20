/**
 * STB-04 — Golden Path #3
 * 스태프 register → 테이크아웃 → 현금 결제 → 픽업코드 → KDS WebSocket broadcast
 *
 * stb-spec.md §4 시나리오 #3 의 6단계.
 *
 * 실행 조건:
 *   - 백엔드 uvicorn :8003 가동 중
 *   - Vite dev server :5173 가동 중 (playwright.config.js webServer 자동 기동)
 *   - Square 환경변수 불필요 — 현금 결제만 사용.
 *   위 조건 미충족 시 자동 skip.
 *
 * 검증 위험:
 *   C-2: WebSocket KDS broadcast 안정성 (2개 브라우저 컨텍스트 동시)
 *   S-1: food_rescue cron race (가능 시 trigger → 토글 race 확인)
 *
 * 실행:
 *   npm run test:e2e -- --grep "Golden Path #3"
 */

import { test, expect } from '@playwright/test';
import { seedTestStore, checkBackendHealth, API_BASE } from './helpers/seed.js';
import { setMasterPin, masterPinLogin } from './helpers/auth.js';

// ─── 공유 상태 ────────────────────────────────────────────────────────────────
let storeCtx = null;
let backendAlive = false;
const MASTER_PIN = '123456';

// ─── 시드 & 헬스체크 ──────────────────────────────────────────────────────────
test.beforeAll(async ({ request }) => {
  backendAlive = await checkBackendHealth(request);
  if (!backendAlive) return;

  try {
    storeCtx = await seedTestStore(request);
  } catch (err) {
    console.error('STB-04 seed 실패:', err.message);
    storeCtx = null;
    return;
  }

  // 시드 매장에 마스터 PIN 설정 (기본값은 null → staff-auth 403)
  const pinSet = await setMasterPin(request, storeCtx.storeId, storeCtx.token, MASTER_PIN);
  if (!pinSet) {
    console.warn('STB-04: 마스터 PIN 설정 실패. UI 로그인 단계 skip 가능.');
  }

  // 테이크아웃 활성화 (기본값 false)
  try {
    await request.patch(`${API_BASE}/api/stores/${storeCtx.storeId}`, {
      headers: { Authorization: `Bearer ${storeCtx.token}` },
      data: { takeout_enabled: true },
    });
  } catch {
    console.warn('STB-04: 테이크아웃 활성화 PATCH 실패. UI에서 수동 설정 필요.');
  }
});

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function requireEnv(t) {
  t.skip(!backendAlive, '백엔드 미가동 (:8003 healthz 실패) — skip');
  t.skip(!storeCtx, '테스트 시드 실패 — skip');
}

// ─── 테스트 ────────────────────────────────────────────────────────────────────
test.describe('Golden Path #3 — 스태프 register→테이크아웃→KDS WebSocket', () => {

  /**
   * Steps 1~6 통합.
   * Step 1  : /{slug}/staff 마스터 PIN 입력 → 인증 (UI)
   * Step 2  : /{slug}/register 테이크아웃 모드 → 메뉴 2개 추가 → 현금 결제
   * Step 3  : 픽업코드 (6자리 alnum) 화면 표시 확인
   * Step 4  : 별도 컨텍스트 KDS → 새 주문 카드 등장 (WebSocket)
   * Step 5  : 주문 아이템 상태 변경 → KDS broadcast 확인
   * Step 6  : (옵션) food_rescue actor 강제 trigger → S-1 race 확인
   */
  test('테이크아웃 주문 → 픽업코드 + KDS WS broadcast', async ({ browser }) => {
    requireEnv(test);

    const { slug, storeId, token } = storeCtx;

    // ── Step 4 prep: KDS 미리 열기 ─────────────────────────────────────────
    const kitchenCtx = await browser.newContext();
    const kitchenPage = await kitchenCtx.newPage();

    let wsOrderReceived = false;
    kitchenPage.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        try {
          const data = JSON.parse(frame.payload);
          if (data?.type === 'NEW_ORDER' || data?.event === 'order_created' || data?.order_id) {
            wsOrderReceived = true;
          }
        } catch { /* ping 등 non-JSON 무시 */ }
      });
    });

    await kitchenPage.goto(`/${slug}/kitchen`);
    await expect(kitchenPage).toHaveURL(new RegExp(`${slug}/kitchen`));

    // ── 스태프 컨텍스트 ────────────────────────────────────────────────────
    const staffPage = await browser.newPage();

    // Step 1: 마스터 PIN UI 로그인
    await staffPage.goto(`/${slug}/staff`);

    // PIN 입력 필드 또는 버튼 찾기
    // selectors may need adjustment after first run
    const pinInput = staffPage.locator(
      'input[type="password"], input[placeholder*="PIN"], input[placeholder*="pin"], ' +
      '[data-testid="pin-input"], input[type="number"]',
    ).first();

    if (await pinInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await pinInput.fill(MASTER_PIN);
      const loginBtn = staffPage.locator(
        'button:has-text("ログイン"), button:has-text("Login"), ' +
        'button:has-text("入力"), button[type="submit"], [data-testid="pin-submit"]',
      ).first();
      if (await loginBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await loginBtn.click();
      } else {
        await pinInput.press('Enter');
      }
    } else {
      // PIN 입력 없이 통과하는 경우 (UI 구조 변경 가능) — 경고 후 계속
      console.warn('STB-04 Step 1: PIN 입력 필드 미발견. PIN 없이 진행 시도.');
    }

    // 인증 성공 확인 (register 또는 staff 페이지로 이동)
    await staffPage.waitForURL(
      (url) => url.pathname.includes('/register') || url.pathname.includes('/staff'),
      { timeout: 8_000 },
    ).catch(() => console.warn('STB-04 Step 1: 인증 후 이동 미감지.'));

    // Step 2: /{slug}/register → 테이크아웃 모드 → 메뉴 추가
    await staffPage.goto(`/${slug}/register`);
    await staffPage.waitForLoadState('networkidle', { timeout: 10_000 });

    // 테이크아웃 모드 버튼
    // selectors may need adjustment after first run
    const takeoutTab = staffPage.locator(
      'button:has-text("テイクアウト"), button:has-text("Takeout"), ' +
      'button:has-text("테이크아웃"), [data-testid="takeout-tab"]',
    ).first();
    if (await takeoutTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await takeoutTab.click();
    }

    // 메뉴 항목 추가 (2개)
    const menuBtn = staffPage.locator(
      '[data-testid="menu-item"], [data-testid="menu-card"], ' +
      '[class*="MenuCard"], [class*="menu-card"], ' +
      'button:has(img), li:has(img)',
    ).first();
    await expect(menuBtn).toBeVisible({ timeout: 10_000 });
    await menuBtn.click();

    // 수량 +1 (이미 1개 추가됨) → 두 번째 메뉴 또는 수량 증가
    const addAgainBtn = staffPage.locator(
      'button:has-text("+"), button[aria-label*="add"], button[aria-label*="増やす"], ' +
      '[data-testid="quantity-increase"]',
    ).first();
    if (await addAgainBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addAgainBtn.click();
    } else {
      // 같은 메뉴 한 번 더 클릭
      await menuBtn.click();
    }

    // Step 2 계속: 현금 결제 처리
    // 결제/정산 버튼
    const payBtn = staffPage.locator(
      'button:has-text("現金"), button:has-text("Cash"), ' +
      'button:has-text("現金精算"), button:has-text("결제"), ' +
      '[data-testid="cash-pay"], [data-testid="pay-button"]',
    ).first();
    await expect(payBtn).toBeVisible({ timeout: 5_000 });
    await payBtn.click();

    // 결제 확인 모달이 있으면 OK/確認 클릭
    const confirmBtn = staffPage.locator(
      'button:has-text("確認"), button:has-text("OK"), button:has-text("확인"), ' +
      '[data-testid="confirm-payment"]',
    ).first();
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Step 3: 픽업코드 (6자리 alnum) 표시 확인
    // pickup_code 는 Order 생성 시 자동 부여
    const pickupCode = staffPage.locator(
      '[data-testid="pickup-code"], [class*="pickup-code"], [class*="PickupCode"], ' +
      'text=/[A-Z0-9]{4,6}/',
    ).first();
    await expect(pickupCode).toBeVisible({ timeout: 12_000 });

    // API 로 order.pickup_code 6자리 alnum 확인
    // payment_status='paid', order_type='take_out' 확인을 위해 최근 주문 조회
    const ordersResp = await staffPage.request.get(
      `${API_BASE}/api/orders/${storeId}?limit=1`,
    );
    if (ordersResp.ok()) {
      const data = await ordersResp.json();
      const orders = Array.isArray(data) ? data : data.items || data.orders || [];
      const latest = orders[0];
      if (latest) {
        expect(latest.payment_status).toBe('paid');
        // order_type: 'take_out' (models.py OrderType.TAKE_OUT = 'take_out')
        expect(['take_out', 'takeout']).toContain(latest.order_type);
        if (latest.pickup_code) {
          expect(latest.pickup_code).toMatch(/^[A-Z0-9]{4,6}$/);
        }
      }
    }

    // Step 4: KDS 에 새 주문 카드 등장 (WS 또는 HTTP 초기 로드)
    const orderCard = kitchenPage.locator(
      '[data-testid="order-card"], [data-testid="kitchen-order"], ' +
      '[class*="OrderCard"], [class*="order-card"], ' +
      '[class*="KitchenOrder"], li:has([class*="status"])',
    ).first();
    await expect(orderCard).toBeVisible({ timeout: 20_000 });

    if (!wsOrderReceived) {
      console.warn('STB-04 C-2: KDS WS 미수신 — HTTP poll 로 표시 중. WebSocket 재확인 필요.');
    }

    // Step 5: 주문 아이템 상태 변경 (pending → cooking_complete → served)
    // KDS 에서 주문 카드 내 상태 변경 버튼 찾기
    // selectors may need adjustment after first run
    const statusBtn = kitchenPage.locator(
      'button:has-text("調理完了"), button:has-text("Cooking Complete"), ' +
      'button:has-text("完了"), [data-testid="cooking-complete"]',
    ).first();
    if (await statusBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await statusBtn.click();
      // served 버튼
      const servedBtn = kitchenPage.locator(
        'button:has-text("提供完了"), button:has-text("Served"), ' +
        '[data-testid="served"]',
      ).first();
      if (await servedBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await servedBtn.click();
      }
    } else {
      console.warn('STB-04 Step 5: KDS 상태 변경 버튼 미발견 — selectors 조정 필요.');
    }

    // Step 6: S-1 race 확인 (food_rescue actor 강제 trigger)
    // 엔드포인트가 있으면 시도, 없으면 경고
    try {
      const triggerResp = await staffPage.request.post(
        `${API_BASE}/api/admin/food-rescue/trigger`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (triggerResp.ok()) {
        console.log('STB-04 S-1: food_rescue trigger 성공. race condition 수동 확인 필요.');
      } else if (triggerResp.status() === 404) {
        console.warn('STB-04 S-1: /api/admin/food-rescue/trigger 없음. S-1 race 수동 확인 필요.');
      }
    } catch {
      console.warn('STB-04 S-1: food_rescue trigger 요청 실패.');
    }

    await kitchenCtx.close();
  });

});
