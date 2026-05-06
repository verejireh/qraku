import { useEffect, useState } from 'react'
import { Outlet, useParams, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useSession } from '../context/SessionContext'
import { useLanguage } from '../context/LanguageContext'
import axios from 'axios'

import ThemeWrapper from '../components/magnolia/ThemeWrapper'
import DynamicHeader from '../components/DynamicHeader'
import DynamicBottomNav from '../components/DynamicBottomNav'
import MagnoliaFloatingCart from '../components/magnolia/MagnoliaFloatingCart'
import MagnoliaCartModal from '../components/magnolia/MagnoliaCartModal'
import { useCart } from '../hooks/useCart'

export default function StoreLayout() {
    const { shop_id: paramShopId } = useParams()
    const { storeId: sessionStoreId, tableNumber, setSession } = useSession()
    const shop_id = paramShopId || sessionStoreId

    const location = useLocation()
    const navigate = useNavigate()
    const { currentTheme, setCurrentTheme, applyStoreTheme } = useTheme()
    const { setAvailableLanguages } = useLanguage()
    const [storeData, setStoreData] = useState(null)
    const [devTheme, setDevTheme] = useState(null)
    const [isCartOpen, setIsCartOpen] = useState(false)
    const { cart, removeFromCart, updateQuantity, clearCart, totalQuantity, totalAmount } = useCart()

    // URL マスキング: 顧客ページ遷移ごとに /table/XX 部分を隠す
    useEffect(() => {
        // テーブル情報をURLから抽出してSessionContextに保存（React 状態 + sessionStorage 同期）
        const tableMatch = location.pathname.match(/\/table\/([^/]+)/)
        if (tableMatch && shop_id) {
            const tNum = tableMatch[1]
            // SessionContext経由で保存（sessionStorage + React state 同期）
            if (tNum !== tableNumber || shop_id !== sessionStoreId) {
                setSession(shop_id, tNum)
            }
        }
        
        // 顧客ページのURLからテーブル情報を隠す（admin/kitchen/staffは除外）
        const isCustomerPath = !location.pathname.includes('/admin') && 
                              !location.pathname.includes('/kitchen') && 
                              !location.pathname.includes('/register') &&
                              !location.pathname.includes('/staff') &&
                              !location.pathname.includes('/setting')
        if (isCustomerPath && tableMatch) {
            const afterTable = location.pathname.replace(/\/table\/[^/]+/, '')
            const masked = afterTable || `/${shop_id}`
            window.history.replaceState(null, '', masked + location.search)
        }
    }, [location.pathname, shop_id])

    useEffect(() => {
        // Admin/Kitchen paths use URL param directly — never redirect them to root
        const isAdminOrKitchenPath = location.pathname.includes('/admin') || location.pathname.includes('/kitchen')
        if (!shop_id && !location.pathname.includes('/login') && !isAdminOrKitchenPath) {
            console.warn("No shop_id provided in URL. Cannot determine store context.")
        }
    }, [shop_id, location.pathname])

    useEffect(() => {
        const fetchStoreData = async () => {
            try {
                const res = await axios.get(`/api/stores/${shop_id}`)
                setStoreData(res.data)

                // Only apply store default theme if user hasn't manually selected one
                const themeParam = new URLSearchParams(window.location.search).get('theme')
                if (themeParam) {
                    applyStoreTheme(themeParam)
                } else if (res.data.theme && !localStorage.getItem('theme-user-selected')) {
                    applyStoreTheme(res.data.theme)
                }

                if (res.data.supported_languages) {
                    // 언어 순서 고정: JA → EN → KO → ZH
                    const ORDER = ['ja', 'en', 'ko', 'zh']
                    const langs = res.data.supported_languages.split(',').map(l => l.trim())
                    const sorted = ORDER.filter(l => langs.includes(l))
                    setAvailableLanguages(sorted.length > 0 ? sorted : langs)
                }
            } catch (e) {
                console.error("Store fetch failed", e)
            }
        }
        if (shop_id) {
            fetchStoreData()
        }
    }, [shop_id])

    // Handle ?theme= URL param changes separately (for dev/preview)
    useEffect(() => {
        const themeParam = new URLSearchParams(location.search).get('theme')
        if (themeParam) {
            applyStoreTheme(themeParam)
        }
    }, [location.search, applyStoreTheme])

    const themeParam = new URLSearchParams(location.search).get('theme')
    const activeTheme = themeParam || devTheme || currentTheme || storeData?.theme || 'tsubaki'
    const isAdmin = location.pathname.includes('/admin')
    const isKitchen = location.pathname.includes('/kitchen')
    const isCustomerPage = !isAdmin && !isKitchen

    const getPath = (route) => {
        const queryParams = window.location.search;
        const paramTableNumber = location.pathname.match(/\/table\/([^/]+)/)?.[1]
        const tNum = paramTableNumber || tableNumber
        if (tNum) return `/${shop_id}/table/${tNum}/${route}${queryParams}`
        return `/${shop_id}/${route}${queryParams}`
    }

    const handlePlaceOrder = () => {
        const paramTableNumber = location.pathname.match(/\/table\/([^/]+)/)?.[1] || tableNumber
        if (paramTableNumber) {
            navigate(`/${shop_id}/table/${paramTableNumber}/order-confirmation`)
        } else {
            navigate(`/${shop_id}/order-confirmation`)
        }
        setIsCartOpen(false)
    }

    return (
        <ThemeWrapper>
            {/* Global Header (Hidden for Admin/Kitchen) */}
            {!isAdmin && !isKitchen && (
                <DynamicHeader
                    currentTheme={activeTheme}
                    storeName={storeData?.name || 'Store'}
                    devTheme={devTheme}
                    setDevTheme={setDevTheme}
                />
            )}

            {/* Passes down global store context to all subpages */}
            <Outlet context={{ storeData, devTheme, setDevTheme }} />

            {/* Global Footer (Hidden for Admin/Kitchen) */}
            {!isAdmin && !isKitchen && <DynamicBottomNav currentTheme={activeTheme} />}

        </ThemeWrapper>
    )
}
