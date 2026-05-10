/**
 * Staff API 유틸리티
 * - 마스터PIN 로그인 후 발급된 JWT를 Authorization 헤더에 자동 추가
 * - 401 응답 시 staffToken 제거 + 페이지 리로드 (스태프 로그인 화면으로)
 */
import axios from 'axios'

const STAFF_TOKEN_KEY = 'staffToken'

const staffApi = axios.create()

staffApi.interceptors.request.use(config => {
    const token = localStorage.getItem(STAFF_TOKEN_KEY)
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

staffApi.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem(STAFF_TOKEN_KEY)
            window.location.reload()
        }
        return Promise.reject(err)
    }
)

export function getStaffToken() {
    return localStorage.getItem(STAFF_TOKEN_KEY)
}

export function setStaffToken(token) {
    localStorage.setItem(STAFF_TOKEN_KEY, token)
}

export function clearStaffToken() {
    localStorage.removeItem(STAFF_TOKEN_KEY)
}

export default staffApi
