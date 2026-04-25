import { createContext, useContext, useState, useEffect } from 'react'

const SessionContext = createContext()

export function SessionProvider({ children }) {
    const [sessionStoreId, setSessionStoreId] = useState(() => sessionStorage.getItem('storeId'))
    const [sessionTableNumber, setSessionTableNumber] = useState(() => sessionStorage.getItem('tableNumber'))
    const [sessionDeviceToken, setSessionDeviceToken] = useState(() => sessionStorage.getItem('deviceToken'))

    useEffect(() => {
        if (sessionStoreId) sessionStorage.setItem('storeId', sessionStoreId)
        else sessionStorage.removeItem('storeId')
    }, [sessionStoreId])

    useEffect(() => {
        if (sessionTableNumber) sessionStorage.setItem('tableNumber', sessionTableNumber)
        else sessionStorage.removeItem('tableNumber')
    }, [sessionTableNumber])

    useEffect(() => {
        if (sessionDeviceToken) sessionStorage.setItem('deviceToken', sessionDeviceToken)
        else sessionStorage.removeItem('deviceToken')
    }, [sessionDeviceToken])

    const setSession = (storeId, tableNumber, deviceToken) => {
        setSessionStoreId(storeId)
        setSessionTableNumber(tableNumber)
        if (deviceToken) setSessionDeviceToken(deviceToken)
    }

    const clearSession = () => {
        setSessionStoreId(null)
        setSessionTableNumber(null)
        setSessionDeviceToken(null)
    }

    return (
        <SessionContext.Provider value={{
            storeId: sessionStoreId,
            tableNumber: sessionTableNumber,
            deviceToken: sessionDeviceToken,
            setSession,
            setDeviceToken: setSessionDeviceToken,
            clearSession
        }}>
            {children}
        </SessionContext.Provider>
    )
}

export function useSession() {
    const context = useContext(SessionContext)
    if (!context) {
        throw new Error('useSession must be used within a SessionProvider')
    }
    return context
}
