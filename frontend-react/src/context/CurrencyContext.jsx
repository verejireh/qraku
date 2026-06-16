import { createContext, useContext, useMemo } from 'react'
import { currencyHelpers } from '../config/currency'

// 매장 통화 포매터를 트리 전체에 제공 (테마뷰→메뉴카드 등 깊은 중첩에 prop 스레딩 회피).
// 기본값은 JPY (storeData 로딩 전/없을 때 하위호환).
const CurrencyContext = createContext(currencyHelpers({}))

export function CurrencyProvider({ storeData, children }) {
    const value = useMemo(
        () => currencyHelpers({
            currency_symbol: storeData?.currency_symbol,
            currency_decimals: storeData?.currency_decimals,
        }),
        [storeData?.currency_symbol, storeData?.currency_decimals]
    )
    return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency() {
    return useContext(CurrencyContext)
}
