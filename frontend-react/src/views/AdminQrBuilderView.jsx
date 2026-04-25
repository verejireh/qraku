import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { QRCodeCanvas } from 'qrcode.react'

export default function AdminQrBuilderView() {
    const { shop_id } = useParams()
    const navigate = useNavigate()

    const [storeData, setStoreData] = useState(null)
    const [tables, setTables] = useState([])
    const [loading, setLoading] = useState(true)

    const [rangeStart, setRangeStart] = useState(1)
    const [rangeEnd, setRangeEnd] = useState(8)
    const [useExistingTables, setUseExistingTables] = useState(true)
    const [previewTables, setPreviewTables] = useState([])
    const [qrType, setQrType] = useState('eat_in')  // 'eat_in' | 'take_out'

    useEffect(() => {
        const fetchData = async () => {
            try {
                const storeRes = await axios.get(`/api/stores/${shop_id}`)
                setStoreData(storeRes.data)
                const storeIdNum = storeRes.data.id

                const tablesRes = await axios.get(`/api/stores/${storeIdNum}/tables`)
                let rawData = Array.isArray(tablesRes.data) ? tablesRes.data : (tablesRes.data?.data || [])

                const sorted = rawData.sort((a, b) =>
                    String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })
                )
                setTables(sorted)
                setPreviewTables(sorted)
            } catch (e) {
                console.error('Fetch error:', e)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [shop_id])

    const applyRange = () => {
        const nums = []
        for (let i = parseInt(rangeStart); i <= parseInt(rangeEnd); i++) {
            nums.push({
                table_number: String(i),
                qr_token: `preview-${i}`,
                id: `range-${i}`
            })
        }
        setPreviewTables(nums)
    }

    const useDB = () => {
        setUseExistingTables(true)
        setPreviewTables(tables)
    }

    const switchToRange = () => {
        setUseExistingTables(false)
        applyRange()
    }

    const getQrUrl = (tableNum) => {
        const base = `${window.location.protocol}//${window.location.host}`
        if (qrType === 'take_out') {
            return `${base}/${shop_id}/takeout`
        }
        return `${base}/${shop_id}/table/${tableNum}`
    }

    const padNum = (n) => String(n).padStart(2, '0')
    const storeName = storeData?.name_jp || storeData?.name_ko || storeData?.name || 'Sakura Café'

    if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>🌸 QR 시스템 최적화 중...</div>

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#fff5f8' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');
                * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body { margin: 0; font-family: 'Noto Sans JP', sans-serif; }

                @media print {
                    .no-print { display: none !important; }
                    @page { size: A4 landscape; margin: 0; }
                    body { background: white !important; }
                    #qr-grid { 
                        display: grid !important; 
                        grid-template-columns: repeat(4, 1fr) !important; 
                        grid-template-rows: repeat(2, 1fr) !important;
                        width: 297mm !important;
                        height: 210mm !important;
                        padding: 15mm !important;
                        gap: 12mm !important;
                    }
                    .qr-card { border: 1.2px solid #fda4af !important; height: 85mm !important; }
                }
            `}</style>

            {/* 컨트롤 패널 */}
            <div className="no-print" style={{ padding: '15px 20px', backgroundColor: 'white', borderBottom: '1px solid #fbcfe8', position: 'sticky', top: 0, zIndex: 100 }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <h1 style={{ margin: 0, color: '#be185d', fontSize: '18px', fontWeight: '900' }}>🌸 QR Builder</h1>
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                            <button onClick={useDB} style={{ padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', background: useExistingTables ? '#ec4899' : 'transparent', color: useExistingTables ? 'white' : '#64748b' }}>DB 데이터</button>
                            <button onClick={switchToRange} style={{ padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', background: !useExistingTables ? '#ec4899' : 'transparent', color: !useExistingTables ? 'white' : '#64748b' }}>범위 설정</button>
                        </div>
                        {/* QR Type Selector */}
                        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                            <button onClick={() => setQrType('eat_in')} style={{ padding: '6px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', background: qrType === 'eat_in' ? '#0ea5e9' : 'transparent', color: qrType === 'eat_in' ? 'white' : '#64748b' }}>🍽 イートイン</button>
                            <button
                                onClick={() => {
                                    if (!storeData?.takeout_enabled) {
                                        alert('テイクアウトが無効です。「運営管理」ページでテイクアウトを ON にしてください。')
                                        return
                                    }
                                    setQrType('take_out')
                                }}
                                disabled={!storeData?.takeout_enabled}
                                title={!storeData?.takeout_enabled ? 'テイクアウトが無効です' : ''}
                                style={{
                                    padding: '6px 14px', border: 'none', borderRadius: '6px',
                                    cursor: !storeData?.takeout_enabled ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold', fontSize: '12px',
                                    background: qrType === 'take_out' ? '#f59e0b' : 'transparent',
                                    color: qrType === 'take_out' ? 'white' : '#64748b',
                                    opacity: !storeData?.takeout_enabled ? 0.4 : 1,
                                }}
                            >🥡 テイクアウト</button>
                        </div>
                    </div>

                    {!useExistingTables && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input type="number" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={{ width: '55px', padding: '5px', borderRadius: '5px', border: '1px solid #ddd' }} />
                            <span>~</span>
                            <input type="number" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={{ width: '55px', padding: '5px', borderRadius: '5px', border: '1px solid #ddd' }} />
                            <button onClick={applyRange} style={{ padding: '5px 12px', background: '#db2777', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>적용</button>
                        </div>
                    )}

                    <button onClick={() => window.print()} style={{ padding: '10px 25px', background: '#db2777', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>🖨️ A4 가로 인쇄</button>
                </div>
            </div>

            {/* QR 출력 그리드 */}
            <div style={{ padding: '25px' }}>
                <div id="qr-grid" style={{ display: 'grid', gridTemplateColumns: qrType === 'take_out' ? '1fr' : 'repeat(4, 1fr)', gap: '15px', maxWidth: qrType === 'take_out' ? '420px' : '1400px', margin: '0 auto' }}>
                    {(qrType === 'take_out' ? [{ id: 'takeout-single', table_number: 'TAKEOUT' }] : previewTables).map((table) => (
                        <div key={table.id} className="qr-card" style={{
                            background: 'white',
                            border: '1.5px solid #fce7f3',
                            borderRadius: '16px',
                            padding: '20px 15px',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            alignItems: 'center', // 가로 중앙 정렬
                            minHeight: '290px'
                        }}>
                            {/* 1. 상단 카페명 */}
                            <div style={{ width: '100%' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: '#be185d', letterSpacing: '0.05em' }}>{storeName}</p>
                                <div style={{ width: '20px', height: '1.5px', background: '#fb7185', margin: '4px auto' }}></div>
                            </div>

                            {/* 2. 중간 QR코드 (90px로 축소 및 중앙 배치) */}
                            <div style={{
                                padding: '10px',
                                background: 'white',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                border: '1px solid #fff1f2',
                                borderRadius: '12px',
                                boxShadow: '0 2px 8px rgba(251,113,133,0.05)'
                            }}>
                                <QRCodeCanvas value={getQrUrl(table.table_number)} size={90} />
                            </div>

                            {/* 3. 하단 안내문 (일본어 정석 + 영어 서브) */}
                            <div style={{ margin: '5px 0', width: '100%' }}>
                                <p style={{ margin: 0, fontSize: '13px', fontWeight: '900', color: '#1e293b', lineHeight: '1.5' }}>
                                    QRコードを読み取って<br />注文してください
                                </p>
                                <p style={{ margin: '5px 0 0', fontSize: '9px', color: '#94a3b8', fontWeight: '600', letterSpacing: '0.02em' }}>
                                    PLEASE SCAN TO PLACE YOUR ORDER
                                </p>
                            </div>

                            {/* 4. 최하단 뱃지 */}
                            <div style={{
                                background: qrType === 'take_out'
                                    ? 'linear-gradient(135deg, #fbbf24, #f59e0b)'
                                    : 'linear-gradient(135deg, #fb7185, #db2777)',
                                color: 'white',
                                borderRadius: '8px',
                                padding: '5px 20px',
                                boxShadow: '0 3px 8px rgba(219,39,119,0.2)'
                            }}>
                                {qrType === 'take_out' ? (
                                    <>
                                        <span style={{ fontSize: '8px', display: 'block', fontWeight: 'bold', letterSpacing: '0.1em', opacity: 0.9 }}>ORDER</span>
                                        <span style={{ fontSize: '18px', fontWeight: '900', lineHeight: '1' }}>テイクアウト</span>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontSize: '8px', display: 'block', fontWeight: 'bold', letterSpacing: '0.1em', opacity: 0.9 }}>TABLE</span>
                                        <span style={{ fontSize: '22px', fontWeight: '900', lineHeight: '1' }}>{padNum(table.table_number)}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}