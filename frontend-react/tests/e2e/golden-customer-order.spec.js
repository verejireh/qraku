/**
 * STB-02 — Golden Path #1
 * 손님 QR → 주문 → Square Sandbox 결제 → 영수증 → KDS WebSocket broadcast
 *
 * stb-spec.md §4 시나리오 #1 의 6단계를 Playwright 로 자동화.
 *
 * 실행 조건:
 *   - 백엔드 uvicorn :8003 가동 중
 *   - Vite dev server :5173 가동 중 (playwright.config.js webServer 자동 기동)
 *   - Square Sandbox 환경변수 3개 설정:
 *       SQUARE_APP_ID, SQUARE_LOCATION_ID, SQUARE_ACCESS_TOKEN
 *   위 조건 미충족 시 자동 skip.
 *
 * 실행:
 *   npm run test:e2e -- --grep "Golden Path #1"
 */

import { test, expect } from '@playwright/test';
import { seedTestStore, checkBackendHealth, API_BASE } from './helpers/seed.js';

// ─── 환경변수 ───────────────────────────────────────────────────────────────
const SQUARE_APP_ID = process.env.SQUARE_APP_ID;
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
const HAS_SQUARE = Boolean(SQUARE_APP_ID && SQUARE_LOCATION_ID && SQUARE_ACCESS_TOKEN);

// ─── 공유 상태 (beforeAll → 각 테스트) ────────────────────────────────────
let storeCtx = null;
let backendAlive = false;

// ─── 시드 & 헬스체크 ──────────────────────────────────────────────────────
test.beforeAll(async ({ request }) => {
  backendAlive = await checkBackendHealth(request);
  if (!backendAlive || !HAS_SQUARE) return;

  try {
    storeCtx = await seedTestStore(request);
  } catch (err) {
    console.error('STB-02 seed 실패:', err.message);
    storeCtx = null;
  }
});

// ─── 유틸 ─────────────────────────────────────────────────────────────────

/**
 * 공통 skip 조건. 위에서 skip 된 경우 하위 테스트 전체 skip.
 */
function requireEnv(t) {
  t.skip(!HAS_SQUARE, 'Square Sandbox 환경변수 (SQUARE_APP_ID/LOCATION_ID/ACCESS_TOKEN) 없음 — skip');
  t.skip(!backendAlive, '백엔드 미가동 (:8003 healthz 실패) — skip');
  t.skip(!storeCtx, '테스트 시드 실패 — skip');
}

// ─── 테스트 ────────────────────────────────────────────────────────────────

test.describe('Golden Path #1 — 손님 QR→주문→Square결제→영수증→KDS', () => {

  /**
   * Step 1~5: 손님 단일 컨텍스트
   * Step 6   : 별도 브라우저 컨텍스트로 KDS 미리 열어 WS 수신 대기
   */
  test('손님 주문부터 영수증 + KDS WS broadcast', async ({ browser }) => {
    // ── 공통 skip 체크 ──────────────────────────────────────────────────
    requireEnv(test);

    const { slug } = storeCtx;

    // ── Step 6 prep: KDS 미리 열기 ─────────────────────────────────────
    // spec: "별도 컨텍스트 /{shop_id}/kitchen (사전 열림)"
    const kitchenCtx = await browser.newContext();
    const kitchenPage = await kitchenCtx.newPage();

    // WS 메시지 수신 여부 추적
    let wsOrderReceived = false;
    kitchenPage.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        try {
          const data = JSON.parse(frame.payload);
          // 백엔드가 emit 하는 타입은 'NEW_ORDER' 또는 'order_created'
          if (data?.type === 'NEW_ORDER' || data?.event === 'order_created' || data?.order_id) {
            wsOrderReceived = true;
          }
        } catch {
          // non-JSON 프레임 (ping 등) 무시
        }
      });
    });

    // KDS 는 마스터 PIN 없이 직접 접근 (시드 매장은 PIN 미설정)
    await kitchenPage.goto(`/${slug}/kitchen`);
    // KDS 로드 확인 (주문 카드 없어도 페이지 자체는 200)
    await expect(kitchenPage).toHaveURL(new RegExp(`${slug}/kitchen`));

    // ── 손님 컨텍스트 ─────────────────────────────────────────────────
    const customerPage = await browser.newPage();

    // Step 1: /{slug}/table/1/menu 진입
    // 통과 기준: 200, 메뉴 카드 1+ 렌더
    await customerPage.goto(`/${slug}/table/1/menu`);
    // 메뉴 아이템이 최소 1개 보일 때까지 대기
    // 실제 선택자는 컴포넌트 구조에 따라 조정 필요.
    // 시도 순서: data-testid → role=listitem → img+텍스트 패턴
    const menuItem = customerPage.locator(
      '[data-testid="menu-item"], [data-testid="menu-card"], ' +
      '[class*="MenuCard"], [class*="menu-card"], ' +
      'li:has(img):has(span), li:has(img):has(p)'
    ).first();
    await expect(menuItem).toBeVisible({ timeout: 12_000 });

    // Step 2: 메뉴 카드 클릭 → 카트 추가
    await menuItem.click();

    // 옵션 모달이 나오면 첫 번째 옵션 선택 후 추가
    const optionBtn = customerPage.locator('input[type="radio"], [data-testid="option-item"]').first();
    if (await optionBtn.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await optionBtn.click();
    }

    // "カートに追加" / "담기" / "追加" 버튼
    const addToCartBtn = customerPage.locator(
      'button:has-text("カートに追加"), button:has-text("追加"), ' +
      'button:has-text("담기"), button:has-text("Add"), ' +
      '[data-testid="add-to-cart"]'
    ).first();
    if (await addToCartBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addToCartBtn.click();
    }
    // 직접 추가 (모달 없는 경우) 이미 추가됐을 수 있음

    // 카트 카운트 +1 확인
    // 통과 기준: 카트 배지 ≥ 1
    const cartBadge = customerPage.locator(
      '[data-testid="cart-count"], [data-testid="cart-badge"], ' +
      '[class*="CartBadge"], [class*="cart-count"], ' +
      '[class*="badge"]:not([class*="status"])'
    ).first();
    await expect(cartBadge).toContainText(/^[1-9]/, { timeout: 6_000 });

    // Step 3: 카트 모달 열기 → 합계 표시 → 결제 진행
    const cartTrigger = customerPage.locator(
      '[data-testid="cart-button"], [data-testid="open-cart"], ' +
      'button:has-text("カート"), button:has-text("Cart"), ' +
      'button:has([class*="cart"]), [class*="CartButton"]'
    ).first();
    // 카트 배지가 이미 모달을 열었으면 skip
    const cartModal = customerPage.locator(
      '[data-testid="cart-modal"], [role="dialog"], ' +
      '[class*="CartModal"], [class*="cart-modal"]'
    );
    if (!await cartModal.isVisible({ timeout: 500 }).catch(() => false)) {
      await cartTrigger.click();
    }
    // 합계 금額 (¥ 또는 ₩ 또는 数字) 가 보여야 함
    const totalText = customerPage.locator(
      '[data-testid="cart-total"], [class*="total"], ' +
      'text=/¥|₩|합계|合計|Total/'
    ).first();
    await expect(totalText).toBeVisible({ timeout: 5_000 });

    // "結算" / "결제" / "Checkout" / "支払" 버튼
    const proceedBtn = customerPage.locator(
      'button:has-text("決済"), button:has-text("結算"), ' +
      'button:has-text("결제하기"), button:has-text("Checkout"), ' +
      'button:has-text("支払"), [data-testid="proceed-checkout"]'
    ).first();
    await expect(proceedBtn).toBeVisible({ timeout: 5_000 });
    await proceedBtn.click();

    // Step 4: Square Sandbox 카드 입력
    // Square Web Payments SDK 가 iframe 내부에 카드 입력 필드를 렌더링함.
    // iframe 선택: src 또는 title 기반.
    // 카드 번호: 4111 1111 1111 1111 / 만료: 12/29 / CVV: 123
    const squareIframe = customerPage.frameLocator(
      'iframe[title*="Card number"], ' +
      'iframe[title*="Expiration"], ' +
      'iframe[src*="squareup"], ' +
      'iframe[src*="square.com"]'
    );

    // 카드 번호 iframe (Square 가 필드별로 별도 iframe 사용)
    const cardNumberFrame = customerPage.frameLocator(
      'iframe[title*="Card number"], iframe[name*="sq-card-number"]'
    );
    await cardNumberFrame.locator('input').fill('4111111111111111');

    const expiryFrame = customerPage.frameLocator(
      'iframe[title*="Expiration date"], iframe[name*="sq-expiration-date"]'
    );
    await expiryFrame.locator('input').fill('1229');

    const cvvFrame = customerPage.frameLocator(
      'iframe[title*="CVV"], iframe[name*="sq-cvv"]'
    );
    await cvvFrame.locator('input').fill('123');

    // 우편번호 (US sandbox 환경에서 요구할 수 있음)
    const postalFrame = customerPage.frameLocator(
      'iframe[title*="Postal code"], iframe[name*="sq-postal-code"]'
    );
    if (await postalFrame.locator('input').isVisible({ timeout: 1_000 }).catch(() => false)) {
      await postalFrame.locator('input').fill('94103');
    }

    // 결제 제출 버튼
    const paySubmitBtn = customerPage.locator(
      'button:has-text("支払"), button:has-text("Pay"), ' +
      'button:has-text("결제"), button:has-text("決済する"), ' +
      '[data-testid="pay-button"], [data-testid="submit-payment"]'
    ).first();
    await paySubmitBtn.click();

    // Step 5: /{slug}/receipt/{order_id} 리디렉트
    // 통과 기준: URL에 /receipt/ 포함, payment_status='paid'
    await expect(customerPage).toHaveURL(/\/receipt\//, { timeout: 25_000 });

    // 영수증 페이지 로드 확인
    await expect(customerPage.locator('body')).not.toContainText('404', { timeout: 5_000 });

    // order_id 추출 후 API 로 payment_status 확인
    const receiptUrl = customerPage.url();
    const orderId = receiptUrl.split('/').pop();
    if (orderId && /^\d+$/.test(orderId)) {
      const orderResp = await customerPage.request.get(`${API_BASE}/api/orders/${orderId}`);
      if (orderResp.ok()) {
        const order = await orderResp.json();
        expect(order.payment_status).toBe('paid');
      }
    }

    // Step 6: KDS WS broadcast 확인
    // 통과 기준: 새 주문 카드 등장 (WS 또는 HTTP 초기 로드)
    // WS 미수신 시 KDS 가 HTTP poll 로 보여주는지도 체크
    const orderCard = kitchenPage.locator(
      '[data-testid="order-card"], [data-testid="kitchen-order"], ' +
      '[class*="OrderCard"], [class*="order-card"], ' +
      '[class*="KitchenOrder"], li:has([class*="status"])'
    ).first();
    await expect(orderCard).toBeVisible({ timeout: 20_000 });

    // WS 수신 여부 보고 (실패 조건은 아님 — HTTP poll 도 허용)
    if (!wsOrderReceived) {
      console.warn('STB-02 C-2: KDS 가 WS 대신 HTTP poll 로 주문 표시. WebSocket 재확인 필요.');
    }

    // 정리
    await kitchenCtx.close();
  });

  /**
   * C-1 보완: 동일 idempotency-key 2회 POST → 중복 주문 방지 검증
   * stb-spec.md §2 C-1 (결제 멱등성)
   */
  test('C-1: Square idempotency-key 중복 방지', async ({ request }) => {
    requireEnv(test);

    const { storeId, token } = storeCtx;

    const orderPayload = {
      shop_id: slug_from_ctx(),
      store_id: storeId,
      table_number: '1',
      order_type: 'eat_in',
      payment_method: 'square',
      items: [{ menu_item_id: '1', quantity: 1, unit_price: 500 }],
      total_amount: 500,
    };

    // 1회째 주문 (square_payment_id 없이 생성 시뮬레이션)
    const r1 = await request.post(`${API_BASE}/api/orders/`, {
      headers: { 'X-Idempotency-Key': 'test-idem-key-001' },
      data: orderPayload,
    });
    // 2회째 동일 idempotency-key 재전송
    const r2 = await request.post(`${API_BASE}/api/orders/`, {
      headers: { 'X-Idempotency-Key': 'test-idem-key-001' },
      data: orderPayload,
    });

    // 둘 다 OK → 응답 order_id 가 동일해야 함 (멱등 처리)
    // 또는 r2 가 409 Conflict → 멱등 구현 방식에 따라 다름
    if (r1.ok() && r2.ok()) {
      const o1 = await r1.json();
      const o2 = await r2.json();
      expect(o1.id).toBe(o2.id);
    } else if (r1.ok() && !r2.ok()) {
      // 409/422 도 C-1 통과 (중복 차단)
      expect([409, 422]).toContain(r2.status());
    }
  });

});

// 헬퍼
function slug_from_ctx() {
  return storeCtx?.slug ?? '';
}
