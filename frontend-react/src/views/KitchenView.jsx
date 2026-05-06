import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, Clock, Bell, X, Eye, LayoutGrid, List, Layers } from 'lucide-react';
import { useDisplayGuard, BlockedScreen } from '../hooks/useDisplayGuard';
import { StaffSidebar, StaffBottomNav } from '../components/StaffNav';

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #kitchen-print-area, #kitchen-print-area * { visibility: visible !important; }
  #kitchen-print-area {
    position: absolute; inset: 0;
    font-family: monospace; font-size: 12px; color: #000; background: #fff;
  }
  .print-ticket { width: 72mm; border: 1px solid #000; padding: 6px; margin-bottom: 8px; page-break-inside: avoid; display: inline-block; }
  .print-ticket-header { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; text-align: center; }
  .no-print { display: none !important; }
}
`;

// ─── Table accent colors — muted, sophisticated tones ────────────────────────
const TABLE_ACCENTS = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f59e0b', // amber
    '#6366f1', // indigo
    '#a855f7', // purple
    '#10b981', // emerald
    '#64748b', // slate
    '#84cc16', // lime
];

// ─── Category accent colors — subtle left-bar indicators ─────────────────────
const CATEGORY_ACCENTS = [
    '#f43f5e', // rose
    '#f97316', // orange
    '#22c55e', // emerald
    '#3b82f6', // blue
    '#a855f7', // purple
    '#eab308', // yellow
    '#06b6d4', // cyan
    '#ef4444', // red
    '#6366f1', // indigo
    '#84cc16', // lime
    '#ec4899', // pink
    '#14b8a6', // teal
];

const getTableAccent = (tableNumber) => {
    const num = parseInt(tableNumber) || 0;
    return TABLE_ACCENTS[num % TABLE_ACCENTS.length];
};

// ─── Elapsed time component (live mm:ss) ────────────────────────────────────
function ElapsedTime({ since }) {
    const [, forceUpdate] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => forceUpdate(n => n + 1), 1000);
        return () => clearInterval(timer);
    }, []);
    // Server returns UTC datetime without 'Z' suffix — append it so JS doesn't treat as local time
    const utcSince = typeof since === 'string' && !since.endsWith('Z') && !since.includes('+') ? since + 'Z' : since;
    const diff = Math.max(0, Math.floor((Date.now() - new Date(utcSince).getTime()) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    const color = m >= 10 ? 'text-red-400' : m >= 5 ? 'text-amber-400' : 'text-white/40';
    return <span className={`text-[10px] font-mono tabular-nums ${color}`}>{m}:{s.toString().padStart(2, '0')}</span>;
}

export default function KitchenView() {
    const { shop_id, storeId } = useParams();
    const [searchParams] = useSearchParams();
    const hideNav = searchParams.get('hidenav') === '1';
    const actualStoreId = shop_id || storeId;
    const { isAllowed, loading: guardLoading } = useDisplayGuard('kitchen');

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [wsConnected, setWsConnected] = useState(false);
    const [menus, setMenus] = useState({});
    const [allMenus, setAllMenus] = useState([]);
    const [numericStoreId, setNumericStoreId] = useState(null);
    const [sortNewest, setSortNewest] = useState(false);
    const [soldOutPanel, setSoldOutPanel] = useState(false);
    const [showFullView, setShowFullView] = useState(false);
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'category' | 'menu'
    const [tables, setTables] = useState([]);
    const [guestMap, setGuestMap] = useState({}); // guest_uuid → { visit_count, days_since_last_visit }

    // ── Audio ─────────────────────────────────────────────────────────────────
    const [audioUnlocked, setAudioUnlocked] = useState(() =>
        sessionStorage.getItem('kitchen_audio_unlocked') === 'true'
    );
    const audioCtxRef = useRef(null);

    useEffect(() => {
        if (audioUnlocked && !audioCtxRef.current) {
            try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        }
    }, [audioUnlocked]);

    const handleUnlockAudio = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = 0.001;
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.01);
            audioCtxRef.current = ctx;
        } catch (e) {}
        sessionStorage.setItem('kitchen_audio_unlocked', 'true');
        setAudioUnlocked(true);
    };

    const playDingDong = useCallback(() => {
        try {
            const ctx = audioCtxRef.current;
            if (!ctx) return;
            const playTone = (freq, start, dur) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = freq; osc.type = 'sine';
                gain.gain.setValueAtTime(0.5, start);
                gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
                osc.start(start); osc.stop(start + dur);
            };
            playTone(880, ctx.currentTime, 0.4);
            playTone(660, ctx.currentTime + 0.45, 0.5);
        } catch (e) {}
    }, []);

    // ── Data Fetching ─────────────────────────────────────────────────────────
    const wsRef = useRef(null);
    const pollingRef = useRef(null);
    const reconnectAttemptRef = useRef(0);

    const fetchData = useCallback(async () => {
        try {
            const storeRes = await axios.get(`/api/stores/${actualStoreId}`);
            const sId = storeRes.data.id;
            setNumericStoreId(sId);

            const menuRes = await axios.get(`/api/menus/${actualStoreId}`);
            const rawMenus = Array.isArray(menuRes.data) ? menuRes.data : (menuRes.data?.data || []);
            const menuDict = {};
            rawMenus.forEach(m => { menuDict[String(m.id)] = m; });
            setMenus(menuDict);
            setAllMenus(rawMenus);

            // 데모 모드: 인증 불필요 엔드포인트 사용
            // ⚠️ 보안: ?demo=1 + demo_tmp_ 접두사 슬러그일 때만 데모 분기 허용
            const storeSlug = storeRes.data.slug || actualStoreId;
            const isTempDemoStore = typeof storeSlug === 'string' && storeSlug.startsWith('demo_tmp_');
            const isDemoMode = new URLSearchParams(window.location.search).get('demo') === '1' && isTempDemoStore;
            let rawOrders = [];
            let rawTables = [];
            if (isDemoMode) {
                const [ordersRes, tablesRes] = await Promise.all([
                    axios.get(`/api/demo/orders/${storeSlug}`).catch(() => ({ data: [] })),
                    axios.get(`/api/demo/tables/${storeSlug}`).catch(() => ({ data: [] })),
                ]);
                rawOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
                rawTables = Array.isArray(tablesRes.data) ? tablesRes.data : [];

            } else {
                const [res, tablesRes] = await Promise.all([
                    axios.get('/api/orders/', { params: { store_id: actualStoreId } }),
                    axios.get(`/api/staff/shops/${actualStoreId}/register-tables`)
                ]);
                rawOrders = Array.isArray(res.data) ? res.data : (res.data?.orders || []);
                rawTables = Array.isArray(tablesRes.data) ? tablesRes.data : [];
            }
            setOrders(rawOrders);
            setTables(rawTables);


            // guest 방문 정보 배치 조회
            const uuids = [...new Set(
                rawOrders
                    .map(o => o.guest_uuid)
                    .filter(u => u && u !== 'POS_MANUAL')
            )];
            if (uuids.length > 0) {
                try {
                    const guestRes = await axios.post('/api/guests/batch', { guest_uuids: uuids });
                    const map = {};
                    (guestRes.data || []).forEach(g => { map[g.guest_uuid] = g; });
                    setGuestMap(map);
                } catch (e) {
                    // guest 정보 실패는 조용히 무시
                }
            }
        } catch (error) {
            console.error('Kitchen fetch error:', error);
        } finally {
            setLoading(false);
        }
    }, [actualStoreId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ── [1] Adaptive Polling: fast when offline, slow when online ─────────────
    useEffect(() => {
        const startPolling = () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
            const interval = wsConnected ? 20000 : 4000; // 20s online, 4s offline
            pollingRef.current = setInterval(fetchData, interval);
        };
        startPolling();
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [wsConnected, fetchData]);

    // ── [3] Page Visibility: instant refresh when tab/screen becomes active ───
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchData();
                // Also force WebSocket reconnect if disconnected
                if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN && wsRef.current.readyState !== WebSocket.CONNECTING) {
                    wsRef.current.close();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        // Also handle mobile wake-up via online event
        const handleOnline = () => { fetchData(); };
        window.addEventListener('online', handleOnline);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('online', handleOnline);
        };
    }, [fetchData]);

    // ── [2] WebSocket with exponential backoff reconnect ──────────────────────
    useEffect(() => {
        if (!numericStoreId) return;
        let reconnectTimer = null;
        let disposed = false;

        const connect = () => {
            if (disposed) return;
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                ? `${window.location.hostname}:8003` : window.location.host;
            const ws = new WebSocket(`${protocol}//${host}/api/ws/kitchen/${numericStoreId}`);
            wsRef.current = ws;

            ws.onopen = () => {
                setWsConnected(true);
                reconnectAttemptRef.current = 0; // Reset backoff on success
                fetchData(); // Immediately sync data on reconnect
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'NEW_ORDER') { playDingDong(); }
                } catch (e) {}
                fetchData();
            };

            ws.onclose = () => {
                if (disposed) return;
                setWsConnected(false);
                // Exponential backoff: 1s → 2s → 4s → 8s → max 10s
                const attempt = reconnectAttemptRef.current;
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                reconnectAttemptRef.current = attempt + 1;
                reconnectTimer = setTimeout(connect, delay);
            };

            ws.onerror = () => ws.close();
        };

        connect();
        return () => {
            disposed = true;
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };
    }, [numericStoreId, fetchData, playDingDong]);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleItemComplete = async (itemId) => {
        try {
            await axios.patch(`/api/orders/items/${itemId}/status`, { status: 'cooking_complete' });
            setOrders(prev => prev.map(o => ({
                ...o,
                items: o.items?.map(i => i.id === itemId ? { ...i, status: 'cooking_complete' } : i)
            })));
        } catch (e) {
            alert('調理完了の処理に失敗しました。');
        }
    };

    const handleCompleteAllTable = async (tableItems) => {
        try {
            const pendingItems = tableItems.filter(i => i.status !== 'cooking_complete' && i.status !== 'served');
            await Promise.all(pendingItems.map(i =>
                axios.patch(`/api/orders/items/${i.id}/status`, { status: 'cooking_complete' })
            ));
            fetchData();
        } catch (e) {
            alert('調理完了の処理に失敗しました。');
        }
    };

    const toggleSoldOut = async (menuId, isAvailable) => {
        const newStatus = !isAvailable;
        setAllMenus(prev => prev.map(m => m.id === menuId ? { ...m, is_available: newStatus } : m));
        try {
            await axios.patch(`/api/menus/${menuId}/availability?is_available=${newStatus}`);
        } catch (e) {
            setAllMenus(prev => prev.map(m => m.id === menuId ? { ...m, is_available: isAvailable } : m));
            alert('更新に失敗しました');
        }
    };

    // ── Category color map ────────────────────────────────────────────────────
    const categoryAccentMap = useMemo(() => {
        const cats = Array.from(new Set(allMenus.map(m => m.category).filter(Boolean)));
        const map = {};
        cats.forEach((cat, i) => { map[cat] = CATEGORY_ACCENTS[i % CATEGORY_ACCENTS.length]; });
        return map;
    }, [allMenus]);

    // ── Active session tokens from occupied/checkout tables ─────────────────
    const activeSessionTokens = useMemo(() => {
        return new Set(
            tables
                .filter(t => t.status === 'occupied' || t.status === 'CHECKOUT_REQUESTED')
                .map(t => t.session_token)
                .filter(Boolean)
        );
    }, [tables]);

    // ── Takeout orders (paid only, not yet served) ──────────────────────────
    const takeoutOrders = useMemo(() => {
        return orders
            .filter(o => o.order_type === 'take_out')
            .filter(o => o.status !== 'cancelled' && o.status !== 'served')
            .filter(o => o.payment_status === 'paid' || o.payment_status === 'completed')
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }, [orders]);

    // ── Filter orders for kitchen display ────────────────────────────────────
    const kitchenOrders = useMemo(() => {
        if (showFullView) {
            // 전체보기: occupied 테이블의 현재 세션 주문만 (서브 완료 포함)
            return orders.filter(o => {
                if (o.status === 'cancelled' || o.order_type === 'take_out') return false;
                return o.session_token && activeSessionTokens.has(o.session_token);
            });
        }
        return orders.filter(o => {
            if (o.status === 'cancelled' || o.order_type === 'take_out') return false;
            if (!o.session_token || !activeSessionTokens.has(o.session_token)) return false;
            const hasActiveItems = o.items?.some(i => i.status !== 'served');
            return hasActiveItems;
        });
    }, [orders, showFullView, activeSessionTokens]);

    // ── Merged orders by table ────────────────────────────────────────────────
    const mergedGroups = useMemo(() => {
        const map = new Map();
        kitchenOrders.forEach(o => {
            const key = `${o.table_number}__${o.session_token}`;
            if (!map.has(key)) {
                map.set(key, { tableNumber: o.table_number, orders: [], allItems: [], minTime: o.created_at, maxTime: o.created_at, guestUuid: null });
            }
            const group = map.get(key);
            group.orders.push(o);
            if (new Date(o.created_at) < new Date(group.minTime)) group.minTime = o.created_at;
            if (new Date(o.created_at) > new Date(group.maxTime)) group.maxTime = o.created_at;
            if (!group.guestUuid && o.guest_uuid && o.guest_uuid !== 'POS_MANUAL') {
                group.guestUuid = o.guest_uuid;
            }
            (o.items || []).forEach(item => {
                group.allItems.push({ ...item, orderId: o.id, orderTime: o.created_at });
            });
        });
        const groups = Array.from(map.values());
        return groups.sort((a, b) => sortNewest
            ? new Date(b.maxTime) - new Date(a.maxTime)
            : new Date(a.minTime) - new Date(b.minTime)
        );
    }, [kitchenOrders, sortNewest]);

    // ── Menu accent color map ──────────────────────────────────────────────────
    const MENU_ACCENTS = [
        '#f43f5e', '#f97316', '#22c55e', '#3b82f6', '#a855f7',
        '#eab308', '#06b6d4', '#ef4444', '#6366f1', '#84cc16',
        '#ec4899', '#14b8a6', '#64748b', '#f59e0b', '#8b5cf6',
    ];
    const menuAccentMap = useMemo(() => {
        const names = Array.from(new Set(
            allMenus.map(m => m.name_jp || m.name_ko || m.name_en).filter(Boolean)
        ));
        const map = {};
        names.forEach((name, i) => { map[name] = MENU_ACCENTS[i % MENU_ACCENTS.length]; });
        return map;
    }, [allMenus]);

    // ── Category-grouped view data ──────────────────────────────────────────
    const categoryGroups = useMemo(() => {
        const allItems = [];
        kitchenOrders.forEach(o => {
            (o.items || []).forEach(item => {
                allItems.push({ ...item, tableNumber: o.table_number, orderTime: o.created_at, orderId: o.id });
            });
        });
        const filtered = showFullView ? allItems : allItems.filter(i => i.status !== 'served');
        const map = new Map();
        filtered.forEach(item => {
            const m = menus[String(item.menu_item_id)] || {};
            const cat = m.category || 'その他';
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat).push({ ...item, menuData: m });
        });
        return Array.from(map.entries()).map(([cat, items]) => ({
            category: cat,
            accent: categoryAccentMap[cat] || '#64748b',
            items: items.sort((a, b) => new Date(a.orderTime) - new Date(b.orderTime)),
        }));
    }, [kitchenOrders, menus, categoryAccentMap, showFullView]);

    // ── Menu-grouped view data ──────────────────────────────────────────────
    const menuGroups = useMemo(() => {
        const allItems = [];
        kitchenOrders.forEach(o => {
            (o.items || []).forEach(item => {
                allItems.push({ ...item, tableNumber: o.table_number, orderTime: o.created_at, orderId: o.id });
            });
        });
        const filtered = showFullView ? allItems : allItems.filter(i => i.status !== 'served');
        const map = new Map();
        filtered.forEach(item => {
            const m = menus[String(item.menu_item_id)] || {};
            const menuName = m.name_jp || m.name_ko || `#${item.menu_item_id}`;
            if (!map.has(menuName)) map.set(menuName, { menuData: m, items: [], totalQty: 0, pendingQty: 0 });
            const group = map.get(menuName);
            group.items.push({ ...item, menuData: m });
            group.totalQty += item.quantity;
            if (item.status === 'pending' || !item.status) group.pendingQty += item.quantity;
        });
        return Array.from(map.entries()).map(([menuName, data]) => ({
            menuName,
            accent: menuAccentMap[menuName] || '#64748b',
            ...data,
            items: data.items.sort((a, b) => new Date(a.orderTime) - new Date(b.orderTime)),
        }));
    }, [kitchenOrders, menus, menuAccentMap, showFullView]);

    // ── Sold-out panel categories ─────────────────────────────────────────────
    const soldOutCategories = useMemo(() => {
        const cats = {};
        allMenus.forEach(m => {
            const c = m.category || 'その他';
            if (!cats[c]) cats[c] = [];
            cats[c].push(m);
        });
        return cats;
    }, [allMenus]);

    // ── Print area ────────────────────────────────────────────────────────────
    const renderPrintArea = () => (
        <div id="kitchen-print-area" style={{ display: 'none' }}>
            <div style={{ textAlign: 'center', marginBottom: 8, fontWeight: 'bold', fontSize: 14 }}>Kitchen Order Sheet</div>
            <div style={{ textAlign: 'center', fontSize: 10, marginBottom: 12 }}>{new Date().toLocaleString('ja-JP')}</div>
            {mergedGroups.map((group, gi) => (
                <div key={gi} className="print-ticket">
                    <div className="print-ticket-header">
                        <div style={{ fontSize: 18, fontWeight: 'bold' }}>TABLE {group.tableNumber}</div>
                        <div style={{ fontSize: 10 }}>{new Date(group.minTime).toLocaleTimeString('ja-JP')}</div>
                    </div>
                    {group.allItems.map((item, ii) => {
                        const m = menus[String(item.menu_item_id)] || {};
                        return (
                            <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px dotted #ccc' }}>
                                <span>{m.name_jp || m.name_ko || `#${item.menu_item_id}`}</span><strong>x{item.quantity}</strong>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading || guardLoading) return (
        <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
    );

    if (isAllowed === false) return <BlockedScreen shop_id={actualStoreId} viewName="주방 (Kitchen KDS)" />;

    // ── Audio Unlock Overlay ──────────────────────────────────────────────────
    if (!audioUnlocked) {
        return (
            <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-8">
                <div className="text-center max-w-sm">
                    <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/10">
                        <Bell size={40} className="text-white/80" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Kitchen Display</h1>
                    <p className="text-white/40 mb-1 text-sm">新しい注文が入るたびに通知音が鳴ります</p>
                    <p className="text-xs text-white/20 mb-10">タップして音声通知を有効にしてください</p>
                    <button
                        onClick={handleUnlockAudio}
                        className="w-full py-4 bg-white text-[#0f1117] text-base font-bold rounded-xl hover:bg-white/90 transition-all flex items-center justify-center gap-2"
                    >
                        <Bell size={18} />
                        音声通知をオンにする
                    </button>
                </div>
            </div>
        );
    }

    // ── Main Render ───────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#0c0e14] text-white font-['Inter',system-ui,sans-serif] flex flex-col lg:flex-row">
            {!hideNav && <StaffSidebar activePage="kitchen" />}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <style>{PRINT_STYLE}</style>
            {renderPrintArea()}

            {/* ── Header ── */}
            <header className="no-print sticky top-0 z-40 bg-[#0c0e14]/95 backdrop-blur-lg border-b border-white/[0.06] border-t-2 border-t-[#e84057] px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-base font-bold tracking-tight text-white cursor-pointer active:opacity-60"
                        onClick={() => window.dispatchEvent(new Event('staff-nav-show'))}>Kitchen</h1>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${wsConnected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                        {wsConnected ? 'LIVE' : 'OFFLINE'}
                    </div>
                    <span className="text-[10px] text-white/40 font-mono tabular-nums">{mergedGroups.length} tables</span>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* View mode toggles */}
                    <div className="flex items-center bg-white/[0.06] rounded-lg p-0.5 gap-0.5">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                                viewMode === 'table' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white/80'
                            }`}
                            title="テーブル別"
                        >
                            <LayoutGrid size={12} />
                            卓別
                        </button>
                        <button
                            onClick={() => setViewMode('category')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                                viewMode === 'category' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white/80'
                            }`}
                            title="カテゴリ別"
                        >
                            <Layers size={12} />
                            分類別
                        </button>
                        <button
                            onClick={() => setViewMode('menu')}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                                viewMode === 'menu' ? 'bg-white/20 text-white shadow-sm' : 'text-white/50 hover:text-white/80'
                            }`}
                            title="メニュー別"
                        >
                            <List size={12} />
                            品別
                        </button>
                    </div>

                    <button
                        onClick={() => setShowFullView(!showFullView)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                            showFullView ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/30' : 'bg-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/10'
                        }`}
                    >
                        <Eye size={12} />
                        全体
                    </button>
                    <button
                        onClick={() => setSortNewest(!sortNewest)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                    >
                        <Clock size={12} />
                        {sortNewest ? '新' : '古'}
                    </button>
                    <button
                        onClick={() => setSoldOutPanel(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-all"
                    >
                        <X size={12} />
                        売切
                    </button>
                    <button
                        onClick={() => {
                            document.getElementById('kitchen-print-area').style.display = 'block';
                            window.print();
                            setTimeout(() => { document.getElementById('kitchen-print-area').style.display = 'none'; }, 500);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/10 transition-all"
                    >
                        🖨
                    </button>
                </div>
            </header>

            {/* ── Orders Grid ── */}
            <main className="p-3">
                {takeoutOrders.length > 0 && (
                    <section className="mb-4 rounded-xl ring-1 ring-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] font-black tracking-widest text-amber-300">🥡 テイクアウト</span>
                            <span className="text-[10px] text-amber-200/60 font-mono tabular-nums">{takeoutOrders.length}件</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            {takeoutOrders.map(o => {
                                const pending = (o.items || []).filter(i => i.status === 'pending' || !i.status);
                                const allDone = pending.length === 0 && (o.items || []).length > 0;
                                return (
                                    <div key={o.id} className="bg-[#161923] rounded-xl overflow-hidden flex flex-col ring-1 ring-amber-500/20" style={{ borderTop: '3px solid #f59e0b' }}>
                                        <div className="px-3 py-2 flex justify-between items-center bg-[#1c1f2e]">
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-lg font-black text-amber-300 leading-none">#{o.pickup_code || o.id}</span>
                                                <span className="text-[9px] font-bold text-amber-400/70">TAKEOUT</span>
                                            </div>
                                            <span className="text-[10px] font-semibold text-white/40 tabular-nums">
                                                {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="px-3 py-2 space-y-1">
                                            {(o.items || []).map((item, idx) => {
                                                const m = menus[String(item.menu_item_id)] || {};
                                                const done = item.status === 'cooking_complete' || item.status === 'pickup_ready' || item.status === 'served';
                                                return (
                                                    <div key={idx} className={`flex justify-between text-[12px] ${done ? 'text-white/30 line-through' : 'text-white/90'}`}>
                                                        <span className="truncate pr-2">{m.name_jp || m.name_ko || `#${item.menu_item_id}`}</span>
                                                        <strong className="tabular-nums">×{item.quantity}</strong>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {!allDone && (
                                            <button
                                                onClick={async () => {
                                                    for (const it of (o.items || []).filter(i => i.status === 'pending' || !i.status)) {
                                                        try { await axios.patch(`/api/orders/items/${it.id}/status`, { status: 'cooking_complete' }); } catch {}
                                                    }
                                                    setOrders(prev => prev.map(oo => oo.id === o.id ? { ...oo, items: oo.items.map(i => ({ ...i, status: 'cooking_complete' })) } : oo));
                                                }}
                                                className="mx-3 mb-2 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[11px] font-bold hover:bg-emerald-500/30 transition-all">
                                                全て完成
                                            </button>
                                        )}
                                        {allDone && (
                                            <div className="mx-3 mb-2 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-[11px] font-bold text-center">
                                                受渡待ち
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
                {kitchenOrders.length === 0 && takeoutOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[70vh]">
                        <div className="text-5xl mb-6">🍳</div>
                        <p className="text-lg font-bold text-white/50">注文待ち</p>
                        <p className="text-xs text-white/30 mt-1">新しい注文が入ると自動的に表示されます</p>
                    </div>
                ) : viewMode === 'table' ? (
                    /* ═══════════ TABLE VIEW (existing) ═══════════ */
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-start">
                        {mergedGroups.map((group) => {
                            const accent = getTableAccent(group.tableNumber);
                            const pendingItems = group.allItems.filter(i => i.status === 'pending' || !i.status);
                            const completedItems = group.allItems.filter(i => i.status === 'cooking_complete');
                            const servedItems = group.allItems.filter(i => i.status === 'served');
                            const allDone = pendingItems.length === 0 && group.allItems.length > 0;

                            return (
                                <div
                                    key={`${group.tableNumber}__${group.minTime}`}
                                    className="bg-[#161923] rounded-xl overflow-hidden flex flex-col ring-1 ring-white/[0.06]"
                                    style={{ borderTop: `3px solid ${accent}` }}
                                >
                                    <div className="px-3 py-2.5 flex justify-between items-center bg-[#1c1f2e]">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-2xl font-black tabular-nums leading-none" style={{ color: accent }}>
                                                {group.tableNumber}
                                            </span>
                                            {group.guestUuid && guestMap[group.guestUuid] && (() => {
                                                const g = guestMap[group.guestUuid];
                                                return (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-violet-500/25 text-violet-300">
                                                            {g.visit_count}回目
                                                        </span>
                                                        {g.days_since_last_visit !== null && g.days_since_last_visit !== undefined && (
                                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                                                                {g.days_since_last_visit === 0 ? '本日再来' : `${g.days_since_last_visit}日ぶり`}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {group.orders.length > 1 && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                                                    {group.orders.length}件
                                                </span>
                                            )}
                                            <span className="text-[10px] font-semibold text-white/40 tabular-nums">
                                                {new Date(group.minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {!allDone && (
                                                <div className="flex gap-[2px]">
                                                    {group.allItems.filter(i => i.status !== 'served').map((_, idx) => (
                                                        <div key={idx} className={`w-1 h-3 rounded-sm ${
                                                            group.allItems.filter(i => i.status !== 'served')[idx]?.status === 'cooking_complete'
                                                                ? 'bg-emerald-400'
                                                                : 'bg-white/15'
                                                        }`} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-1.5 flex-grow space-y-[3px]">
                                        {group.allItems.filter(i => i.status !== 'served' || showFullView).map((item, iIdx) => {
                                            const m = menus[String(item.menu_item_id)] || {};
                                            const itemName = m.name_jp || m.name_ko || `#${item.menu_item_id}`;
                                            const category = m.category || '';
                                            const catAccent = categoryAccentMap[category] || '#64748b';
                                            const isDone = item.status === 'cooking_complete';
                                            const isServed = item.status === 'served';
                                            const isPickupReady = item.status === 'pickup_ready';
                                            const isTakeoutItem = item.is_takeout_item;
                                            let options = {};
                                            try { options = item.option_details ? JSON.parse(item.option_details) : {}; } catch (e) {}

                                            return (
                                                <div
                                                    key={item.id || iIdx}
                                                    className={`rounded-lg flex items-center gap-2 transition-all ${
                                                        isTakeoutItem && !isServed ? 'bg-amber-50 ring-1 ring-amber-300' :
                                                        isPickupReady ? 'bg-purple-500/15' :
                                                        isDone ? 'bg-emerald-500/10' :
                                                        isServed ? 'bg-white/[0.03] opacity-40' :
                                                        'bg-white/[0.05]'
                                                    }`}
                                                    style={{ borderLeft: `3px solid ${
                                                        isPickupReady ? '#a855f7' :
                                                        isDone ? (isTakeoutItem ? '#f59e0b' : '#34d399') :
                                                        isServed ? '#475569' :
                                                        isTakeoutItem ? '#f59e0b' : catAccent
                                                    }` }}
                                                >
                                                    <div className="flex-1 min-w-0 py-2 pl-2.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {isTakeoutItem && (
                                                                <span className="text-[9px] font-black bg-amber-500 text-white px-1.5 py-0.5 rounded-full shrink-0">🥡 포장</span>
                                                            )}
                                                            <p className={`text-[13px] font-bold leading-snug ${
                                                                isTakeoutItem && !isServed ? 'text-amber-900' :
                                                                isPickupReady ? 'text-purple-200' :
                                                                isDone ? 'text-emerald-200' :
                                                                isServed ? 'text-white/40' : 'text-white'
                                                            }`}>{itemName}</p>
                                                        </div>
                                                        {Object.entries(options).length > 0 && (
                                                            <div className="mt-0.5 flex flex-wrap gap-1">
                                                                {Object.entries(options).map(([k, v]) => (
                                                                    <span key={k} className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${isTakeoutItem && !isServed ? 'bg-amber-200 text-amber-900' : 'bg-white/[0.08] text-white/50'}`}>{v}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <ElapsedTime since={item.orderTime} />
                                                    <span className={`text-lg font-black tabular-nums pr-1 ${
                                                        isTakeoutItem && !isServed ? 'text-amber-900' :
                                                        isPickupReady ? 'text-purple-300' :
                                                        isDone ? 'text-emerald-300' :
                                                        isServed ? 'text-white/30' : 'text-white/80'
                                                    }`}>{item.quantity}</span>
                                                    <div className="pr-1.5">
                                                        {!isDone && !isServed && !isPickupReady && (
                                                            <button onClick={() => handleItemComplete(item.id)}
                                                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-emerald-500/30 text-white/40 hover:text-emerald-300 flex items-center justify-center transition-all active:scale-90"
                                                                title="調理完了"><CheckCircle size={15} /></button>
                                                        )}
                                                        {isDone && !isTakeoutItem && (
                                                            <div className="w-7 h-7 rounded-lg bg-emerald-500/25 text-emerald-300 flex items-center justify-center"><CheckCircle size={15} /></div>
                                                        )}
                                                        {isDone && isTakeoutItem && (
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await axios.patch(`/api/orders/items/${item.id}/status`, { status: 'pickup_ready' });
                                                                        setOrders(prev => prev.map(o => ({
                                                                            ...o,
                                                                            items: o.items?.map(i => i.id === item.id ? { ...i, status: 'pickup_ready' } : i)
                                                                        })));
                                                                    } catch(e) { alert('エラーが発生しました'); }
                                                                }}
                                                                className="w-7 h-7 rounded-lg bg-amber-500/25 text-amber-300 hover:bg-purple-500/25 hover:text-purple-300 flex items-center justify-center transition-all active:scale-90 text-[9px] font-black"
                                                                title="ピックアップ準備完了">袋</button>
                                                        )}
                                                        {isPickupReady && (
                                                            <div className="w-7 h-7 rounded-lg bg-purple-500/25 text-purple-300 flex items-center justify-center text-[9px] font-black">準</div>
                                                        )}
                                                        {isServed && (
                                                            <div className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/30 flex items-center justify-center text-[9px] font-bold">済</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {!allDone && (
                                        <div className="px-1.5 pb-1.5">
                                            <button onClick={() => handleCompleteAllTable(group.allItems)}
                                                className="w-full py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors">
                                                <CheckCircle size={12} /> 全品完了
                                            </button>
                                        </div>
                                    )}
                                    {allDone && completedItems.length > 0 && (
                                        <div className="px-3 py-2.5 bg-emerald-500/10 border-t border-emerald-500/10">
                                            <p className="text-center text-emerald-300 text-[10px] font-bold">✓ 調理完了 — サーブ待ち</p>
                                        </div>
                                    )}
                                    {allDone && completedItems.length === 0 && servedItems.length > 0 && (
                                        <div className="px-3 py-2.5 bg-white/[0.03] border-t border-white/[0.06]">
                                            <p className="text-center text-white/30 text-[10px] font-bold">サーブ済み</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : viewMode === 'category' ? (
                    /* ═══════════ CATEGORY VIEW ═══════════ */
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-start">
                        {categoryGroups.map((group) => {
                            const pendingItems = group.items.filter(i => i.status === 'pending' || !i.status);
                            const allDone = pendingItems.length === 0 && group.items.length > 0;

                            return (
                                <div
                                    key={group.category}
                                    className="bg-[#161923] rounded-xl overflow-hidden flex flex-col ring-1 ring-white/[0.06]"
                                    style={{ borderTop: `3px solid ${group.accent}` }}
                                >
                                    {/* Category Header */}
                                    <div className="px-3 py-2.5 flex justify-between items-center bg-[#1c1f2e]">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.accent }} />
                                            <span className="text-sm font-bold" style={{ color: group.accent }}>
                                                {group.category}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-bold text-white/40">
                                            {pendingItems.length}品 残
                                        </span>
                                    </div>

                                    {/* Items */}
                                    <div className="p-1.5 flex-grow space-y-[3px]">
                                        {group.items.map((item, iIdx) => {
                                            const m = item.menuData || {};
                                            const itemName = m.name_jp || m.name_ko || `#${item.menu_item_id}`;
                                            const isDone = item.status === 'cooking_complete';
                                            const isServed = item.status === 'served';
                                            const tableAccent = getTableAccent(item.tableNumber);
                                            let options = {};
                                            try { options = item.option_details ? JSON.parse(item.option_details) : {}; } catch (e) {}

                                            return (
                                                <div
                                                    key={item.id || iIdx}
                                                    className={`rounded-lg flex items-center gap-2 transition-all ${
                                                        isDone ? 'bg-emerald-500/10' : isServed ? 'bg-white/[0.03] opacity-40' : 'bg-white/[0.05]'
                                                    }`}
                                                    style={{ borderLeft: `3px solid ${isDone ? '#34d399' : isServed ? '#475569' : tableAccent}` }}
                                                >
                                                    {/* Table number badge */}
                                                    <div className="pl-2 shrink-0">
                                                        <span className="text-xs font-black tabular-nums px-1.5 py-0.5 rounded-md" style={{ color: tableAccent, backgroundColor: `${tableAccent}20` }}>
                                                            {item.tableNumber}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0 py-2">
                                                        <p className={`text-[13px] font-bold leading-snug ${
                                                            isDone ? 'text-emerald-200' : isServed ? 'text-white/40' : 'text-white'
                                                        }`}>{itemName}</p>
                                                        {Object.entries(options).length > 0 && (
                                                            <div className="mt-0.5 flex flex-wrap gap-1">
                                                                {Object.entries(options).map(([k, v]) => (
                                                                    <span key={k} className="text-[8px] px-1.5 py-0.5 bg-white/[0.08] text-white/50 rounded-full font-medium">{v}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <ElapsedTime since={item.orderTime} />
                                                    <span className={`text-lg font-black tabular-nums pr-1 ${
                                                        isDone ? 'text-emerald-300' : isServed ? 'text-white/30' : 'text-white/80'
                                                    }`}>{item.quantity}</span>
                                                    <div className="pr-1.5">
                                                        {!isDone && !isServed && (
                                                            <button onClick={() => handleItemComplete(item.id)}
                                                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-emerald-500/30 text-white/40 hover:text-emerald-300 flex items-center justify-center transition-all active:scale-90">
                                                                <CheckCircle size={15} /></button>
                                                        )}
                                                        {isDone && (
                                                            <div className="w-7 h-7 rounded-lg bg-emerald-500/25 text-emerald-300 flex items-center justify-center"><CheckCircle size={15} /></div>
                                                        )}
                                                        {isServed && (
                                                            <div className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/30 flex items-center justify-center text-[9px] font-bold">済</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {!allDone && pendingItems.length > 0 && (
                                        <div className="px-1.5 pb-1.5">
                                            <button onClick={() => {
                                                    pendingItems.forEach(i => handleItemComplete(i.id));
                                                }}
                                                className="w-full py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors">
                                                <CheckCircle size={12} /> 全品完了
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ═══════════ MENU VIEW ═══════════ */
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-start">
                        {menuGroups.map((group) => {
                            const pendingItems = group.items.filter(i => i.status === 'pending' || !i.status);

                            return (
                                <div
                                    key={group.menuName}
                                    className="bg-[#161923] rounded-xl overflow-hidden flex flex-col ring-1 ring-white/[0.06]"
                                    style={{ borderTop: `3px solid ${group.accent}` }}
                                >
                                    {/* Menu Header */}
                                    <div className="px-3 py-2.5 flex justify-between items-center bg-[#1c1f2e]">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.accent }} />
                                            <span className="text-sm font-bold truncate" style={{ color: group.accent }}>
                                                {group.menuName}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {group.pendingQty > 0 && (
                                                <span className="text-base font-black tabular-nums px-2 py-0.5 rounded-lg" style={{ color: group.accent, backgroundColor: `${group.accent}20` }}>
                                                    x{group.pendingQty}
                                                </span>
                                            )}
                                            <span className="text-[10px] font-bold text-white/40">
                                                計{group.totalQty}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Individual orders for this menu */}
                                    <div className="p-1.5 flex-grow space-y-[3px]">
                                        {group.items.map((item, iIdx) => {
                                            const isDone = item.status === 'cooking_complete';
                                            const isServed = item.status === 'served';
                                            const tableAccent = getTableAccent(item.tableNumber);
                                            let options = {};
                                            try { options = item.option_details ? JSON.parse(item.option_details) : {}; } catch (e) {}

                                            return (
                                                <div
                                                    key={item.id || iIdx}
                                                    className={`rounded-lg flex items-center gap-2 transition-all ${
                                                        isDone ? 'bg-emerald-500/10' : isServed ? 'bg-white/[0.03] opacity-40' : 'bg-white/[0.05]'
                                                    }`}
                                                    style={{ borderLeft: `3px solid ${isDone ? '#34d399' : isServed ? '#475569' : tableAccent}` }}
                                                >
                                                    {/* Table number badge */}
                                                    <div className="pl-2 shrink-0">
                                                        <span className="text-xs font-black tabular-nums px-1.5 py-0.5 rounded-md" style={{ color: tableAccent, backgroundColor: `${tableAccent}20` }}>
                                                            {item.tableNumber}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0 py-2">
                                                        {Object.entries(options).length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {Object.entries(options).map(([k, v]) => (
                                                                    <span key={k} className="text-[10px] px-1.5 py-0.5 bg-white/[0.08] text-white/50 rounded-full font-medium">{v}</span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className={`text-[11px] ${isDone ? 'text-emerald-200/60' : 'text-white/40'}`}>
                                                                T{item.tableNumber}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <ElapsedTime since={item.orderTime} />
                                                    <span className={`text-lg font-black tabular-nums pr-1 ${
                                                        isDone ? 'text-emerald-300' : isServed ? 'text-white/30' : 'text-white/80'
                                                    }`}>{item.quantity}</span>
                                                    <div className="pr-1.5">
                                                        {!isDone && !isServed && (
                                                            <button onClick={() => handleItemComplete(item.id)}
                                                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-emerald-500/30 text-white/40 hover:text-emerald-300 flex items-center justify-center transition-all active:scale-90">
                                                                <CheckCircle size={15} /></button>
                                                        )}
                                                        {isDone && (
                                                            <div className="w-7 h-7 rounded-lg bg-emerald-500/25 text-emerald-300 flex items-center justify-center"><CheckCircle size={15} /></div>
                                                        )}
                                                        {isServed && (
                                                            <div className="w-7 h-7 rounded-lg bg-white/[0.06] text-white/25 flex items-center justify-center text-[9px] font-bold">済</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {pendingItems.length > 0 && (
                                        <div className="px-1.5 pb-1.5">
                                            <button onClick={() => {
                                                    pendingItems.forEach(i => handleItemComplete(i.id));
                                                }}
                                                className="w-full py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1 transition-colors">
                                                <CheckCircle size={12} /> 全品完了
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* ── Sold-Out Panel ── */}
            {soldOutPanel && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSoldOutPanel(false)} />
                    <div className="relative ml-auto w-full max-w-sm bg-[#14161f] border-l border-white/[0.06] flex flex-col h-full shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                            <div>
                                <h2 className="text-sm font-bold text-white">売り切れ設定</h2>
                                <p className="text-[10px] text-white/30">メニューの販売状況を管理</p>
                            </div>
                            <button onClick={() => setSoldOutPanel(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors text-white/50">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-5">
                            {Object.entries(soldOutCategories).map(([cat, items], catIdx) => {
                                const accent = CATEGORY_ACCENTS[catIdx % CATEGORY_ACCENTS.length];
                                return (
                                    <div key={cat}>
                                        <div className="flex items-center gap-2 mb-2 px-1">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                                            <h3 className="text-[11px] font-semibold text-white/60 uppercase tracking-wider">{cat}</h3>
                                            <span className="text-[10px] text-white/20">({items.length})</span>
                                        </div>
                                        <div className="space-y-1">
                                            {items.map(item => (
                                                <div
                                                    key={item.id}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                                                        item.is_available ? 'bg-white/[0.04] hover:bg-white/[0.07]' : 'bg-red-500/[0.08]'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                        {item.image_url && (
                                                            <img src={item.image_url} alt="" className="w-8 h-8 rounded-md object-cover shrink-0" />
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className={`text-xs font-medium truncate ${item.is_available ? 'text-white/80' : 'text-red-300/80 line-through'}`}>
                                                                {item.name_jp || item.name_ko}
                                                            </p>
                                                            <p className="text-[10px] text-white/20">¥{item.price?.toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleSoldOut(item.id, item.is_available)}
                                                        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
                                                            item.is_available ? 'bg-emerald-500' : 'bg-white/10'
                                                        }`}
                                                    >
                                                        <div className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${
                                                            item.is_available ? 'left-[19px]' : 'left-[3px]'
                                                        }`} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-4 py-2.5 border-t border-white/[0.06]">
                            <div className="flex items-center justify-between text-[10px] text-white/25">
                                <span>売り切れ: {allMenus.filter(m => !m.is_available).length}品</span>
                                <span>販売中: {allMenus.filter(m => m.is_available).length}品</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {!hideNav && <StaffBottomNav activePage="kitchen" />}
            </div>{/* end main content wrapper */}
        </div>
    );
}
