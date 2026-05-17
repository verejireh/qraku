import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { isAdminLoggedIn } from './useAdminApi';

export function useDisplayGuard(viewType) {
    const { shop_id } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [isAllowed, setIsAllowed] = useState(null); // null: checking, true: allowed, false: blocked
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        // ⚠️ 보안: ?demo=1 URL 파라미터는 "demo_tmp_" 접두사 임시 스토어에서만 허용
        //   (일반 매장에 ?demo=1 붙여 디스플레이 가드 우회하는 공격 차단)
        const isTempDemoStore = typeof shop_id === 'string' && shop_id.startsWith('demo_tmp_');
        const isDemoMode = searchParams.get('demo') === '1' && isTempDemoStore;
        if (isDemoMode) {
            setIsAllowed(true);
            setLoading(false);
            return;
        }

        // Admin bypass — admins can preview pages regardless of display toggle
        if (isAdminLoggedIn()) {
            setIsAllowed(true);
            setLoading(false);
            return;
        }

        const checkAccess = async () => {
            try {
                const res = await axios.get(`/api/stores/${shop_id}`);
                if (!isMounted) return;

                const store = res.data;
                const settings = store.display_settings || {};

                let allowed = true;
                if (viewType === 'kitchen') allowed = settings.use_kitchen_page !== false;
                else if (viewType === 'register') allowed = settings.use_register_page !== false;
                else if (viewType === 'staff') allowed = settings.use_staff_page !== false;

                setIsAllowed(allowed);
            } catch (error) {
                console.error("Display Guard check failed", error);
                setIsAllowed(false);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        checkAccess();
        return () => { isMounted = false; };
    }, [shop_id, viewType, searchParams]);

    // Auto-redirect to home when access is blocked
    useEffect(() => {
        if (isAllowed === false) {
            navigate(`/${shop_id}/home`);
        }
    }, [isAllowed, shop_id, navigate]);

    return { isAllowed, loading, shop_id };
}


export function BlockedScreen({ shop_id, viewName }) {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center shadow-inner">
            <span className="material-symbols-outlined text-6xl text-adminprimary/30 mb-6 drop-shadow-sm">block</span>
            <h1 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight mb-3">화면 비활성화 안내</h1>
            <p className="text-slate-500 mb-8 max-w-md leading-relaxed text-sm font-medium">
                해당 디스플레이 화면(<span className="font-bold text-slate-700">{viewName}</span>)은 관리자 설정에 의해 비활성화되어 접근할 수 없습니다. 다시 켜려면 관리자 페이지에서 설정을 변경해주세요.
            </p>
            <button
                onClick={() => navigate(`/${shop_id}/admin`)}
                className="px-6 py-3 bg-adminprimary text-white font-bold rounded-xl shadow-lg hover:bg-adminprimary/90 transition-all flex items-center gap-2"
            >
                <span className="material-symbols-outlined text-[18px]">settings</span>
                관리자 대시보드로 이동
            </button>
        </div>
    );
}
