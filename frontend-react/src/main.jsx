import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

// 전역 axios 인터셉터: admin_token이 localStorage에 있으면 모든 요청에 Authorization 헤더 자동 첨부
// (비인증 API는 헤더를 무시하므로 안전)
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('admin_token')
    if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

axios.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            const url = err.config?.url || ''
            // /api/admin/* 또는 관리자 보호 엔드포인트에서 401이면 토큰 제거
            if (url.includes('/api/admin') || url.includes('/api/stats') || url.includes('/api/billing')) {
                localStorage.removeItem('admin_token')
            }
        }

        // 402: 구독 만료 — 관리자 화면에서만 구독 페이지로 리다이렉트
        if (err.response?.status === 402) {
            const code = err.response?.data?.detail?.code || err.response?.data?.code
            if (code === 'SUBSCRIPTION_EXPIRED') {
                // 현재 URL에서 shop_id 추출 (/:shop_id/admin/...)
                const match = window.location.pathname.match(/^\/([^/]+)\/admin/)
                if (match) {
                    const shopId = match[1]
                    const target = `/${shopId}/admin/subscription`
                    if (window.location.pathname !== target) {
                        window.location.href = target
                    }
                }
            }
        }

        return Promise.reject(err)
    }
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
