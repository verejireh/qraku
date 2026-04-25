import { motion } from 'framer-motion'
import { Store, ArrowRight, MapPin, Star } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function StoreSelectView() {
    const navigate = useNavigate()
    const [stores, setStores] = useState([])
    const [loading, setLoading] = useState(true)


    useEffect(() => {
        const fetchStores = async () => {
            try {
                const res = await axios.get('/api/stores/')
                setStores(res.data)
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }
        fetchStores()
    }, [])

    // No distance sorting needed anymore
    const sortedStores = [...stores]

    const handleSelectStore = (store) => {
        navigate(`/${store.id}/home`)
    }

    return (
        <div className="relative min-h-screen bg-charcoal flex flex-col items-center justify-start p-6 overflow-hidden">
            <div className="fixed inset-0 soft-glow-bg opacity-30 pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 w-full max-w-md pt-20 pb-12 text-center space-y-4"
            >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest">
                    <Star className="w-3 h-3 fill-primary" />
                    Elite Brand Collection
                </div>
                <h1 className="text-4xl font-serif italic text-white tracking-tight text-center">
                    Select Your <br />
                    <span className="text-primary not-italic font-bold">Destination</span>
                </h1>
                <p className="text-slate-500 text-sm max-w-[280px] mx-auto">
                    Discover the essence of Magnolia in every branch.
                </p>
            </motion.div>

            <div className="relative z-10 w-full max-w-md space-y-4">
                {loading ? (
                    <div className="space-y-4 animate-pulse">
                        {[1, 2].map(i => (
                            <div key={i} className="h-40 bg-white/5 border border-white/10 rounded-[2.5rem]" />
                        ))}
                    </div>
                ) : (
                    sortedStores.map((store, idx) => {
                        return (
                            <motion.div
                                key={store.id || `store-${idx}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                onClick={() => handleSelectStore(store)}
                                className="group relative p-8 glass rounded-[2.5rem] hover:border-primary/50 transition-all cursor-pointer shadow-2xl shadow-black/40 overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full translate-x-12 -translate-y-12 group-hover:bg-primary/10 transition-colors"></div>

                                <div className="relative flex justify-between items-center">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
                                                <Store className="text-primary w-6 h-6" />
                                            </div>
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-serif italic text-white leading-tight">
                                                {store.name_ko || store.name}
                                            </h2>
                                            <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
                                                <MapPin className="w-3 h-3" />
                                                <span>{store.address || 'Premium Location'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all">
                                        <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-white" />
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })
                )}

                {stores.length === 0 && !loading && (
                    <div className="py-20 text-center text-slate-700 italic font-serif">
                        No destinations found...
                    </div>
                )}
            </div>

            <footer className="mt-auto py-12 text-center relative z-10 w-full">
                <p className="text-[10px] text-slate-600 uppercase font-bold tracking-[0.3em]">Magnolia Dining Group © 2026</p>
            </footer>
        </div>
    )
}
