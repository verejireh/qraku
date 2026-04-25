import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QRCodeCanvas } from 'qrcode.react';

export default function QRPrintView() {
    const { shop_id } = useParams();
    const navigate = useNavigate();
    const [storeInfo, setStoreInfo] = useState(null);
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch store info using slug
                const storeRes = await axios.get(`/api/stores/${shop_id}`);
                setStoreInfo(storeRes.data);
                const storeIdNum = storeRes.data.id;

                // 2. Fetch tables for this specific store
                const tablesRes = await axios.get(`/api/stores/${storeIdNum}/tables`);
                console.log("받은 데이터:", tablesRes.data);

                const rawData = Array.isArray(tablesRes.data)
                    ? tablesRes.data
                    : (tablesRes.data?.tables || tablesRes.data?.items || tablesRes.data?.data || []);

                // Sort ascending by table number
                const sortedTables = (Array.isArray(rawData) ? rawData : []).sort((a, b) =>
                    String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true })
                );
                setTables(sortedTables);
            } catch (error) {
                console.error("Failed to fetch data for QR printing:", error);
                alert("매장 정보를 불러오지 못했습니다.");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [shop_id]);

    // Auto-print once data is loaded
    useEffect(() => {
        if (!loading && storeInfo && tables.length > 0) {
            const timer = setTimeout(() => {
                window.print();
            }, 900);
            return () => clearTimeout(timer);
        }
    }, [loading, storeInfo, tables]);

    // Guest URL for QR code
    const getGuestUrl = (tableNum) => {
        return `${window.location.protocol}//${window.location.host}/${shop_id}/table/${tableNum}`;
    };

    // Chunk array into pages (8 cards per A4 landscape page)
    const CHUNK_SIZE = 8;
    const pages = [];
    for (let i = 0; i < tables.length; i += CHUNK_SIZE) {
        pages.push(tables.slice(i, i + CHUNK_SIZE));
    }


    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fdf2f8', fontFamily: 'sans-serif' }}>
                <div style={{ width: 56, height: 56, border: '4px solid #f9a8d4', borderTopColor: '#be185d', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
                <p style={{ color: '#9d174d', fontWeight: 600, fontSize: 16 }}>🌸 QR 코드를 준비하고 있습니다...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    if (!storeInfo || tables.length === 0) {
        return (
            <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
                <p style={{ fontSize: 20, color: '#ef4444', marginBottom: 16 }}>등록된 테이블이 없습니다.</p>
                <button onClick={() => navigate(`/${shop_id}/admin`)} style={{ padding: '8px 20px', background: '#1e293b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    관리자 메뉴로 돌아가기
                </button>
            </div>
        );
    }

    const storeName = storeInfo.name || 'Restaurant';

    return (
        <div className="qr-print-root">
            {/* ── Print-specific styles injected inline ── */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700&family=Noto+Sans+KR:wght@300;400;700&family=Noto+Sans+SC:wght@300;400;700&display=swap');

                * { box-sizing: border-box; }

                body {
                    margin: 0;
                    padding: 0;
                    background: #f3f4f6;
                    font-family: 'Noto Sans KR', 'Noto Sans JP', 'Noto Sans SC', sans-serif;
                }

                /* ── Screen preview wrapper ── */
                .qr-print-root {
                    min-height: 100vh;
                    background: #f3f4f6;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 32px 16px;
                }

                /* ── Non-print control bar ── */
                .control-bar {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                    padding: 20px 28px;
                    margin-bottom: 32px;
                    text-align: center;
                    max-width: 680px;
                    width: 100%;
                }

                .control-bar h2 {
                    font-size: 20px;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0 0 6px 0;
                }

                .control-bar p {
                    font-size: 13px;
                    color: #64748b;
                    margin: 0 0 16px 0;
                }

                .btn-row {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }

                .btn-print {
                    padding: 10px 24px;
                    background: #be185d;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .btn-print:hover { background: #9d174d; }

                .btn-back {
                    padding: 10px 24px;
                    background: #f1f5f9;
                    color: #475569;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .btn-back:hover { background: #e2e8f0; }

                .hint-text {
                    font-size: 11px;
                    color: #f97316;
                    margin-top: 10px;
                }

                /* ── A4 Landscape sheet (297mm × 210mm) ── */
                .print-sheet {
                    width: 297mm;
                    height: 210mm;
                    background: white;
                    margin: 0 auto 24px auto;
                    padding: 6mm;
                    border-radius: 4px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.12);
                    overflow: hidden;
                    page-break-after: always;
                    break-after: page;
                }

                /* ── 4-column × 2-row QR grid ── */
                .qr-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    grid-template-rows: repeat(2, 1fr);
                    width: 100%;
                    height: 100%;
                    gap: 0;
                }

                /* ── Individual QR card ── */
                .qr-card {
                    position: relative;
                    border: 0.5px dashed #fce7f3;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-evenly;
                    overflow: hidden;
                    padding: 8px 6px;
                    background: linear-gradient(160deg, #fffafb 0%, #fdf2f8 100%);
                    page-break-inside: avoid;
                    break-inside: avoid;
                }

                .qr-card.empty {
                    background: linear-gradient(160deg, #fafafa 0%, #f5f5f5 100%);
                }

                /* Sakura petal decorative background */
                .qr-card::before {
                    content: '🌸';
                    position: absolute;
                    font-size: 80px;
                    opacity: 0.04;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                    z-index: 0;
                }

                /* Content layers above pseudo-element */
                .qr-card > * { position: relative; z-index: 1; }

                /* Restaurant name */
                .store-name {
                    font-weight: 700;
                    font-size: 13px;
                    color: #be185d;
                    letter-spacing: 0.03em;
                    text-align: center;
                    line-height: 1.2;
                }

                /* Table badge */
                .table-badge {
                    background: #fdf2f8;
                    border: 1px solid #fbcfe8;
                    padding: 2px 12px;
                    border-radius: 9999px;
                    font-weight: 700;
                    color: #9d174d;
                    font-size: 11px;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }

                /* QR code wrapper */
                .qr-wrapper {
                    background: white;
                    padding: 6px;
                    border-radius: 10px;
                    box-shadow: 0 2px 8px rgba(190,24,93,0.1);
                    border: 1.5px solid #fce7f3;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* Multilingual instruction */
                .instructions {
                    text-align: center;
                    font-size: 6.5px;
                    color: #6b7280;
                    line-height: 1.45;
                    width: 100%;
                }
                .instructions b { color: #374151; }

                /* ── PRINT MEDIA: override screen styles for clean output ── */
                @page {
                    size: A4 landscape;
                    margin: 0;
                }

                @media print {
                    body {
                        background: white !important;
                    }

                    .qr-print-root {
                        padding: 0 !important;
                        background: white !important;
                        display: block;
                    }

                    .control-bar {
                        display: none !important;
                    }

                    .print-sheet {
                        margin: 0 !important;
                        padding: 4mm !important;
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        width: 297mm !important;
                        height: 210mm !important;
                    }

                    .qr-card::before {
                        opacity: 0.035 !important;
                    }
                }
            `}} />

            {/* ── Screen-only control bar ── */}
            <div className="control-bar no-print">
                <h2>✅ QR코드 A4 스티커 인쇄 준비 완료</h2>
                <p>인쇄 창이 자동으로 열립니다. 열리지 않으면 아래 버튼을 눌러주세요.</p>
                <div className="btn-row">
                    <button className="btn-print" onClick={() => window.print()}>
                        🖨️ 브라우저 인쇄 실행
                    </button>
                    <button className="btn-back" onClick={() => navigate(`/${shop_id}/admin/tables`)}>
                        ← 테이블 관리로
                    </button>
                </div>
                <p className="hint-text">
                    ⚠️ 인쇄 설정: 용지 &quot;A4&quot; · 방향 &quot;가로(Landscape)&quot; · 여백 &quot;없음(None)&quot;
                </p>
            </div>

            {/* ── A4 Page sheets ── */}
            {pages.map((pageTables, pageIndex) => (
                <main key={pageIndex} className="print-sheet">
                    <div className="qr-grid">
                        {Array.from({ length: CHUNK_SIZE }).map((_, slotIndex) => {
                            const table = pageTables[slotIndex];

                            if (!table) {
                                return (
                                    <section key={`empty-${pageIndex}-${slotIndex}`} className="qr-card empty" />
                                );
                            }

                            const qrUrl = getGuestUrl(table.table_number);
                            const tableLabel = `Table ${String(table.table_number).padStart(2, '0')}`;

                            return (
                                <section key={table.id} className="qr-card">
                                    {/* Restaurant name */}
                                    <div className="store-name">{storeName}</div>

                                    {/* Table number badge */}
                                    <div className="table-badge">{tableLabel}</div>

                                    {/* QR Code - High Resolution */}
                                    <div className="qr-wrapper">
                                        <QRCodeCanvas
                                            value={qrUrl}
                                            size={180}
                                            level="H"
                                            includeMargin={false}
                                            style={{ width: 96, height: 96, imageRendering: 'pixelated' }}
                                        />
                                    </div>

                                    {/* Multilingual instruction */}
                                    <div className="instructions">
                                        <b>QRコードをスキャンして注文</b><br />
                                        Please scan to order<br />
                                        QR코드를 스캔하여 주문하세요<br />
                                        请扫码点餐
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                </main>
            ))}
        </div>
    );
}
