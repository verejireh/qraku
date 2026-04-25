import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const translations = {
    ko: {
        home: '홈',
        menu: '메뉴',
        orders: '주문내역',
        profile: '프로필',
        pay_now: '결제하기',
        total_payment: '총 결제하기',
        welcome: '환영합니다',
        explore_menu: '메뉴 보러가기',
        kitchen_status: '주방 상태',
        active: '영업중',
        your_table: '내 테이블',
        language: '언어',
        theme: '테마',
        select_language: '언어 선택',
        status: '상태',
        total: '총액',
        details: '상세보기',
        no_orders: '주문 내역이 없습니다.',
        no_menus: '등록된 메뉴가 없습니다.',
        paid: '결제 완료',
        digital_receipt: '디지털 영수증',
        order_summary: '주문 합계',
        checkout_warning: '한번 체크아웃 하시면 다시 주문하실 수 없습니다.',
        checkout_confirm: '주문 완료 및 마감',
        confirm_checkout_title: '주문을 마감하시겠습니까?',
        processing: '처리 중...',
        confirm: '확인',
        cancel: '취소하기',
        print_receipt: '영수증 출력 (80mm)',
        checkout_complete_title: '결제가 완료되었습니다',
        manager_dashboard: '관리자 대시보드',
        main_branch: '본점',
        add_menu: '메뉴 추가',
        generate_qr: 'QR 테이블 생성기',
        todays_sales: '오늘의 총 매출',
        total_covers: '총 방문객 수',
        avg_check: '평균 객단가',
        live_table_status: '실시간 테이블 현황',
        top_items: '오늘의 인기 메뉴',
        generate_qr_title: '테이블 QR 생성하기',
        generate_qr_desc: '각 테이블에 고유 식별자가 연동된 아름다운 디지털 메뉴 QR을 생성하여 즉각적인 주문을 받아보세요.',
        go_to_checkout: '결제하러 가기',
        loyalty_settings: '로열티 프로그램 설정',
        nav_menu_management: '메뉴 관리',
        nav_staff_management: '스태프 관리',
        nav_payment_setting: '결제 설정',
        nav_analytics: '분석',
        staff_page_urls: '스태프 페이지 URL',
        location_security: '보안 및 지역 제한 설정',
        geofence_desc: '매장의 정확한 위치를 설정하여 외부에서의 부정 주문을 차단합니다.',
        set_current_location: '📍 현재 위치로 매장 좌표 설정',
        table_ready: '테이블 초기화',
        reset_confirm: '이 테이블을 초기화하고 다음 손님을 받을 수 있게 할까요?',
        access_denied_title: '접근 차단됨',
        access_denied_msg: 'QR 코드 세션이 유효하지 않거나 만료되었습니다. 매장 테이블에 비치된 전용 QR 코드로만 주문해 주시기 바랍니다.',
        order_success: '주문이 성공적으로 접수되었습니다!',
        'Main': '메인 메뉴',
        'Sub': '사이드 메뉴',
        'Drinks': '음료',
        place_order: '주문하기',
        sending_order: '주문 전송 중...',
        clear_cart: '장바구니 비우기',
        admin: {
            business_hours: '영업시간 설정',
            days: { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' },
            status: { open: '영업', closed: '휴무', sold_out: '품절' },
            nav: { dashboard: '대시보드', menu_manage: '메뉴 관리', orders: '주문 관리', analytics: '분석', operation: '운영 관리', staff: '스태프 관리', payment: '결제 설정' },
            operation: { title: '운영 관리', table_manage: '테이블 관리', table_name: '테이블 번호 (예: A1)', add: '추가', no_tables: '등록된 테이블이 없습니다.', kitchen_mode: '주문 확인 방식', tax_setting: '세금 설정', takeout_setting: '테이크아웃 설정', receipt_custom: '영수증 커스터마이징', language_setting: '언어 설정', staff_urls: '스태프 페이지 URL' },
            menu: { title: '메뉴 관리', manage_your_offerings: '메뉴를 관리하세요', all_items: '전체 메뉴', category_manage: '카테고리 관리', new_category: '새 카테고리명...', sort: '정렬', details: '메뉴 상세', price: '가격', category: '카테고리', status: '상태', takeout_ok: '테이크아웃 가능', takeout_no: '테이크아웃 불가' },
            staff: { title: '스태프 시스템 관리', dashboard: '스태프 포털 바로가기' },
            payment: { title: '결제 시스템', test_mode: '테스트 모드', live_mode: '라이브 모드', pay_at_table: '테이블 결제', pay_at_register: '카운터 결제', currency: '결제 통화' },
            common: { save: '저장', add: '추가', delete: '삭제', cancel: '취소', loading: '로딩 중...' },
            register: { title: '새 메뉴 등록', subtitle: '3단계 워크플로우로 빠르게 등록하세요', step: '단계', upload_photo: '사진 업로드', snap_or_drop: '사진을 촬영하거나 드래그하세요', choose_file: '파일 선택', ai_bg_removal: 'AI 배경 제거', ai_bg_desc: '프로 같은 깔끔한 사진으로 변환', menu_details: '메뉴 상세 및 AI 번역', ai_translate: 'AI 다국어 번역 실행', item_name: '메뉴 이름 (일본어)', description: '설명 (일본어)', price: '가격 (¥)', takeout_available: '테이크아웃 가능', takeout_desc: '테이크아웃 메뉴로 제공', category: '카테고리', custom_options: '커스텀 옵션', options_desc: '예: 사이즈, 토핑 (AI가 자동 번역합니다)', add_option_group: '옵션 그룹 추가', group_name: '그룹 이름 (일본어)', option_name: '옵션 이름', add_choice: '선택지 추가', review_publish: '검토 및 등록', confirm_register: '확인 후 메뉴 등록', option_guide_title: '옵션 설정 가이드', option_guide_desc: '고객이 주문 시 선택할 수 있는 커스터마이즈 항목입니다.' }
        }
    },
    ja: {
        home: 'ホーム',
        menu: 'メニュー',
        orders: '注文履歴',
        profile: 'マイページ',
        pay_now: '支払う',
        total_payment: '一괄お支払い',
        welcome: 'ようこそ',
        explore_menu: 'メニューを見る',
        kitchen_status: '厨房状況',
        active: '営業中',
        your_table: 'テーブル番号',
        language: '言語',
        theme: 'テーマ',
        select_language: '言語選択',
        status: 'ステータス',
        total: '合計',
        details: '詳細を見る',
        no_orders: '注文履歴이ありません。',
        no_menus: '登録されたメニューがありません。',
        paid: '支払い済み',
        digital_receipt: 'デジタル領収書',
        order_summary: 'お会計合計',
        checkout_warning: '一度お会計を確定すると、再度注文することはできません。',
        checkout_confirm: 'お会計を確定する',
        confirm_checkout_title: 'お会計を確定しますか？',
        processing: '処理中...',
        confirm: '確認',
        cancel: 'キャンセル',
        print_receipt: '領収書印刷 (80mm)',
        checkout_complete_title: 'お会計を承りました',
        manager_dashboard: '管理者ダッシュボード',
        main_branch: '本店',
        add_menu: 'メニュー追加',
        generate_qr: 'QRテーブル生成',
        todays_sales: '本日の総売上',
        total_covers: '総来店客数',
        avg_check: '平均客単価',
        live_table_status: '現在のテーブル状況',
        top_items: '本日の人気メニュー',
        generate_qr_title: 'テーブルQRの生成',
        generate_qr_desc: '各テーブルに直接リンクされた美しいデジタルメニューを生成し、即座の注文を可能にします。',
        go_to_checkout: 'お会計に進む',
        loyalty_settings: 'ロイヤリティプログラム設定',
        nav_menu_management: 'メニュー管理',
        nav_staff_management: 'スタッフ管理',
        nav_payment_setting: '決済設定',
        nav_analytics: '分析',
        staff_page_urls: 'スタッフページURL',
        location_security: 'セキュリティと地域制限設定',
        geofence_desc: '店舗の正確な位置を設定して、外部からの不正注文をブロックします。',
        set_current_location: '📍 現在位置で店舗座標を設定',
        table_ready: 'テーブル初期化',
        reset_confirm: 'このテーブルを初期化して、次の客を受け入れられるようにしますか？',
        access_denied_title: 'アクセス拒否',
        access_denied_msg: 'QRコードセッションが無効または有効期限切れです。店舗のテーブルに設置された専用のQRコードからのみご注文ください。',
        order_success: '注文が成功しました！',
        'Main': 'メイン',
        'Sub': 'サイド',
        'Drinks': 'ドリンク',
        place_order: '注文する',
        sending_order: '注文送信中...',
        clear_cart: 'カートをクリア',
        admin: {
            business_hours: '営業時間設定',
            days: { mon: '月', tue: '火', wed: '水', thu: '木', fri: '金', sat: '土', sun: '日' },
            status: { open: '営業', closed: '定休', sold_out: 'SOLD OUT' },
            nav: { dashboard: 'ダッシュボード', menu_manage: 'メニュー管理', orders: '注文', analytics: 'アナリティクス', operation: '運営管理', staff: 'スタッフ管理', payment: '決済設定' },
            operation: { title: '運営管理', table_manage: 'テーブル管理', table_name: 'テーブル名 (例: A1)', add: '追加', no_tables: 'テーブルが登録されていません', kitchen_mode: '注文確認方式', tax_setting: '税金設定', takeout_setting: 'テイクアウト設定', receipt_custom: '領収書カスタマイズ', language_setting: '言語設定', staff_urls: 'スタッフページURL' },
            menu: { title: 'メニュー管理', manage_your_offerings: '提供するメニューの管理', all_items: 'すべてのメニュー', category_manage: 'カテゴリ管理', new_category: '新しいカテゴリ名...', sort: '順序', details: '詳細', price: '価格', category: 'カテゴリ', status: 'ステータス', takeout_ok: 'テイクアウト可', takeout_no: 'テイクアウト不可' },
            staff: { title: 'スタッフシステム管理', dashboard: 'スタッフポータルを開く' },
            payment: { title: '決済システム管理', test_mode: 'テストモード', live_mode: '本番環境', pay_at_table: 'テーブル決済', pay_at_register: 'レジ決済', currency: '決済通貨' },
            common: { save: '保存', add: '追加', delete: '削除', cancel: 'キャンセル', loading: '読み込み中...' },
            register: { title: '新メニュー登録', subtitle: '3ステップのワークフローで即座に登録', step: 'ステップ', upload_photo: '写真をアップロード', snap_or_drop: '写真を撮影またはドラッグ＆ドロップ', choose_file: 'ファイルを選択', ai_bg_removal: 'AI 背景除去', ai_bg_desc: 'プロ仕上げの写真に自動変換', menu_details: 'メニュー詳細＆AI翻訳', ai_translate: 'AI 多言語翻訳実行', item_name: 'メニュー名（日本語）', description: '説明（日本語）', price: '価格（¥）', takeout_available: 'テイクアウト可能', takeout_desc: 'テイクアウトメニューとして提供する', category: 'カテゴリ', custom_options: 'カスタムオプション', options_desc: '例: サイズ、トッピング（名前はAIが自動翻訳します）', add_option_group: 'オプショングループ追加', group_name: 'グループ名（日本語）', option_name: 'オプション名', add_choice: '選択肢を追加', review_publish: '確認＆公開', confirm_register: '確認してメニューを登録', option_guide_title: 'オプション設定ガイド', option_guide_desc: 'お客様がメニュー注文時に選べるカスタマイズ項目です。例えばラーメンの「サイズ」や「トッピング」をグループとして作成し、各選択肢に追加料金を設定できます。' }
        }
    },
    en: {
        home: 'Home',
        menu: 'Menu',
        orders: 'Orders',
        profile: 'Profile',
        pay_now: 'Pay Now',
        total_payment: 'Total Payment',
        welcome: 'Welcome',
        explore_menu: 'Explore Menu',
        kitchen_status: 'Kitchen Status',
        active: 'Operational',
        your_table: 'Your Table',
        language: 'Language',
        theme: 'Theme',
        select_language: 'Select Language',
        status: 'Status',
        total: 'Total',
        details: 'View Details',
        no_orders: 'No orders found.',
        no_menus: 'No menus found.',
        paid: 'Paid',
        digital_receipt: 'Digital Receipt',
        order_summary: 'Order Summary',
        checkout_warning: 'Once you check out, you will no longer be able to place orders.',
        checkout_confirm: 'Complete & Close Table',
        confirm_checkout_title: 'Close Table?',
        processing: 'Processing...',
        confirm: 'Confirm',
        cancel: 'Cancel',
        print_receipt: 'Print Receipt (80mm)',
        checkout_complete_title: 'Checkout Complete',
        manager_dashboard: 'Manager Dashboard',
        main_branch: 'Main Branch',
        add_menu: 'Add Menu',
        generate_qr: 'Launch QR Builder',
        todays_sales: "Today's Total Sales",
        total_covers: 'Total Covers',
        avg_check: 'Avg Check',
        live_table_status: 'Live Table Status',
        top_items: 'Top Performing Items (Today)',
        generate_qr_title: 'Generate Table QRs',
        generate_qr_desc: 'Create beautiful digital menus linked directly to table identifiers for instantaneous ordering.',
        go_to_checkout: 'Go to Checkout',
        loyalty_settings: 'Loyalty Program Settings',
        nav_menu_management: 'Menu Management',
        nav_staff_management: 'Staff Management',
        nav_payment_setting: 'Payment Setting',
        nav_analytics: 'Analytics',
        staff_page_urls: 'Staff Page URLs',
        location_security: 'Location & Security Settings',
        geofence_desc: 'Set your exact store location to block unauthorized external orders.',
        set_current_location: '📍 Set to Current Location',
        table_ready: 'Table Ready',
        reset_confirm: 'Reset this table and make it ready for the next guest?',
        access_denied_title: 'Access Denied',
        access_denied_msg: 'The QR code session is invalid or expired. Please note that orders can only be placed by scanning the dedicated QR code located at your table.',
        order_success: 'Order successful!',
        'Main': 'Main',
        'Sub': 'Side',
        'Drinks': 'Drinks',
        place_order: 'Place Order',
        sending_order: 'Sending Order...',
        clear_cart: 'Clear Cart',
        admin: {
            business_hours: 'Business Hours',
            days: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
            status: { open: 'Open', closed: 'Closed', sold_out: 'Sold Out' },
            nav: { dashboard: 'Dashboard', menu_manage: 'Menu Management', orders: 'Orders', analytics: 'Analytics', operation: 'Operations', staff: 'Staff', payment: 'Payment' },
            operation: { title: 'Operation Management', table_manage: 'Table Management', table_name: 'Table No (e.g. A1)', add: 'Add', no_tables: 'No tables registered.', kitchen_mode: 'Kitchen Display Mode', tax_setting: 'Tax Settings', takeout_setting: 'Takeout Settings', receipt_custom: 'Receipt Customization', language_setting: 'Language Settings', staff_urls: 'Staff Page URLs' },
            menu: { title: 'Menu Management', manage_your_offerings: 'Manage your offerings', all_items: 'All Items', category_manage: 'Manage Categories', new_category: 'New category name...', sort: 'Sort', details: 'Item Details', price: 'Price', category: 'Category', status: 'Status', takeout_ok: 'Takeout OK', takeout_no: 'No Takeout' },
            staff: { title: 'Staff System Management', dashboard: 'Open Staff Portal' },
            payment: { title: 'Payment Settings', test_mode: 'Test Mode', live_mode: 'Live Mode', pay_at_table: 'Pay at Table', pay_at_register: 'Pay at Register', currency: 'Currency' },
            common: { save: 'Save', add: 'Add', delete: 'Delete', cancel: 'Cancel', loading: 'Loading...' },
            register: { title: 'Register New Item', subtitle: 'Follow the 3-step workflow for instant listing', step: 'Step', upload_photo: 'Upload Photo', snap_or_drop: 'Snap or Drop Photo', choose_file: 'Choose File', ai_bg_removal: 'AI Background Removal', ai_bg_desc: 'Isolate your dish for a professional look', menu_details: 'Menu Details & AI Translation', ai_translate: 'AI Multi-language Translation', item_name: 'Item Name (Japanese)', description: 'Description (Japanese)', price: 'Price (\u00a5)', takeout_available: 'Takeout Available', takeout_desc: 'Offer as takeout item', category: 'Category', custom_options: 'Custom Options', options_desc: 'e.g., Size, Toppings (Names translated automatically by AI)', add_option_group: 'Add Option Group', group_name: 'Group Name (Japanese)', option_name: 'Option Name', add_choice: 'Add Choice', review_publish: 'Review & Publish', confirm_register: 'Confirm & Register Menu', option_guide_title: 'Option Setup Guide', option_guide_desc: 'Customization items customers can choose when ordering. Create groups like Size or Toppings, and set extra prices for each choice.' }
        }
    },
    zh: {
        home: '首页',
        menu: '菜单',
        orders: '订单记录',
        profile: '个人主页',
        pay_now: '去结账',
        total_payment: '总计支付',
        welcome: '欢迎光临',
        explore_menu: '查看菜单',
        kitchen_status: '后厨状态',
        active: '营业中',
        your_table: '您的桌号',
        language: '语言',
        theme: '主题',
        select_language: '选择语言',
        status: '状态',
        total: '总计',
        details: '查看详情',
        no_orders: '暂无订单。',
        no_menus: '暂无菜单。',
        paid: '已付款',
        digital_receipt: '电子收据',
        order_summary: '订单小计',
        checkout_warning: '一旦结账，您将无法再次订餐。',
        checkout_confirm: '确认结账',
        confirm_checkout_title: '确认结账？',
        processing: '处理中...',
        confirm: '确认',
        cancel: '取消',
        print_receipt: '打印收据 (80mm)',
        checkout_complete_title: '结账已完成',
        manager_dashboard: '管理员控制台',
        main_branch: '总店',
        add_menu: '添加菜单',
        generate_qr: '生成专属二维码',
        todays_sales: '今日总营业额',
        total_covers: '总接待人数',
        avg_check: '人均消费',
        live_table_status: '实时桌面状态',
        top_items: '今日热门菜品',
        generate_qr_title: '生成桌面二维码',
        generate_qr_desc: '创建与桌面编号绑定的精美数字菜单，提供即时点单服务。',
        go_to_checkout: '去结账',
        loyalty_settings: '积分与奖励设置',
        nav_menu_management: '菜单管理',
        nav_staff_management: '员工管理',
        nav_payment_setting: '支付设置',
        nav_analytics: '数据分析',
        staff_page_urls: '员工页面链接',
        location_security: '安全与地理限制设置',
        geofence_desc: '设置店铺的确切位置以阻止未经授权的外部订单。',
        set_current_location: '📍 设置为当前位置',
        table_ready: '桌面就绪',
        reset_confirm: '重置此桌并为下一位客人做好准备？',
        access_denied_title: '拒绝访问',
        access_denied_msg: 'QR码会话无效或已过期。请注意，只能通过扫描您桌上的专用QR码来进行点餐。',
        order_success: '订单已成功提交！',
        'Main': '主菜',
        'Sub': '小菜',
        'Drinks': '饮料',
        place_order: '下单',
        sending_order: '正在发送订单...',
        clear_cart: '清空购物车',
        admin: {
            business_hours: '营业时间设置',
            days: { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' },
            status: { open: '营业', closed: '休息', sold_out: '售罄' },
            nav: { dashboard: '仪表盘', menu_manage: '菜单管理', orders: '订单', analytics: '数据分析', operation: '运营管理', staff: '员工管理', payment: '支付设置' },
            operation: { title: '运营管理', table_manage: '桌位管理', table_name: '桌号 (例: A1)', add: '添加', no_tables: '未注册桌位。', kitchen_mode: '厨房显示模式', tax_setting: '税率设置', takeout_setting: '外带设置', receipt_custom: '收据定制', language_setting: '语言设置', staff_urls: '员工页面链接' },
            menu: { title: '菜单管理', manage_your_offerings: '管理您的菜品', all_items: '所有菜单', category_manage: '类别管理', new_category: '新类别名称...', sort: '排序', details: '详情', price: '价格', category: '类别', status: '状态', takeout_ok: '可外带', takeout_no: '不可外带' },
            staff: { title: '员工系统管理', dashboard: '打开员工门户' },
            payment: { title: '支付系统管理', test_mode: '测试模式', live_mode: '正式环境', pay_at_table: '桌边支付', pay_at_register: '柜台支付', currency: '支付货币' },
            common: { save: '保存', add: '添加', delete: '删除', cancel: '取消', loading: '加载中...' },
            register: { title: '注册新菜品', subtitle: '按照3步流程快速上架', step: '步骤', upload_photo: '上传照片', snap_or_drop: '拍照或拖拽上传', choose_file: '选择文件', ai_bg_removal: 'AI背景去除', ai_bg_desc: '自动转换为专业级照片', menu_details: '菜品详情 & AI翻译', ai_translate: 'AI多语翻译', item_name: '菜品名称（日语）', description: '描述（日语）', price: '价格（¥）', takeout_available: '可外带', takeout_desc: '作为外带菜品提供', category: '类别', custom_options: '自定义选项', options_desc: '例：大小、配料（名称由AI自动翻译）', add_option_group: '添加选项组', group_name: '组名（日语）', option_name: '选项名', add_choice: '添加选项', review_publish: '确认并发布', confirm_register: '确认并注册菜品', option_guide_title: '选项设置指南', option_guide_desc: '这些是顾客在点餐时可以选择的自定义项目。' }
        }
    }
}

const LanguageContext = createContext()

function detectBrowserLanguage() {
    const supported = ['ja', 'en', 'ko', 'zh']
    const langs = navigator.languages || [navigator.language || 'en']
    for (const lang of langs) {
        const code = lang.toLowerCase().split('-')[0]
        if (supported.includes(code)) return code
    }
    return 'en'
}

export function LanguageProvider({ children }) {
    // Initialize from localStorage, fallback to browser language detection
    const [language, setLanguageState] = useState(() => localStorage.getItem('preferred_language') || detectBrowserLanguage())
    const [availableLanguages, setAvailableLanguages] = useState(['ja', 'en', 'ko', 'zh'])

    useEffect(() => {
        const fetchGuestLanguage = async () => {
            const guestUuid = localStorage.getItem('guest_uuid')
            if (guestUuid) {
                try {
                    const res = await axios.get(`/api/guests/${guestUuid}`)
                    if (res.data && res.data.preferred_language) {
                        setLanguageState(res.data.preferred_language)
                        localStorage.setItem('preferred_language', res.data.preferred_language)
                    }
                } catch (e) {
                    console.error("Failed to fetch guest language preference", e)
                }
            }
        }
        fetchGuestLanguage()
    }, [])

    const setLanguage = async (newLang) => {
        setLanguageState(newLang)
        localStorage.setItem('preferred_language', newLang)
        const guestUuid = localStorage.getItem('guest_uuid')
        if (guestUuid) {
            try {
                await axios.put(`/api/guests/${guestUuid}/language`, { language: newLang })
            } catch (e) {
                console.error("Failed to update guest language preference", e)
            }
        }
    }

    const t = (key) => {
        if (!translations[language]) return key
        
        // Handle nested keys like 'admin.nav.dashboard'
        const keys = key.split('.')
        let result = translations[language]
        for (const k of keys) {
            if (result === undefined || result === null) return key
            result = result[k]
        }
        return result !== undefined ? result : key
    }

    const languageNames = {
        ja: '日本語',
        en: 'English',
        ko: '한국어',
        zh: '简体中文',
        vi: 'Tiếng Việt',
        fr: 'Français',
        es: 'Español',
        de: 'Deutsch',
        it: 'Italiano',
        id: 'Bahasa Indonesia'
    }

    const getMenuName = (item) => {
        if (!item) return ''
        if (language === 'ja') return item.name_jp
        if (language === 'ko' && item.name_ko) return item.name_ko
        if (language === 'en' && item.name_en) return item.name_en
        if (language === 'zh' && item.name_zh) return item.name_zh

        // Handle extra translations
        try {
            const extra = typeof item.extra_translations === 'string'
                ? JSON.parse(item.extra_translations || '{}')
                : (item.extra_translations || {})
            if (extra[language]) return extra[language]
        } catch (e) {
            console.error("Failed to parse extra_translations", e)
        }

        return item.name_jp || item.name_en || item.name_ko || ''
    }

    const getMenuDescription = (item) => {
        if (!item) return ''
        if (language === 'ja' && item.description_jp) return item.description_jp
        if (language === 'ko' && item.description_ko) return item.description_ko
        if (language === 'en' && item.description_en) return item.description_en
        if (language === 'zh' && item.description_zh) return item.description_zh

        return item.description_jp || item.description_en || ""
    }

    return (
        <LanguageContext.Provider value={{
            language,
            setLanguage,
            t,
            availableLanguages,
            setAvailableLanguages,
            languageNames,
            getMenuName,
            getMenuDescription
        }}>
            {children}
        </LanguageContext.Provider >
    )
}

export const useLanguage = () => useContext(LanguageContext)
