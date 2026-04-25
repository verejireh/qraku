export default function MagnoliaFloatingCart({ count, onClick }) {
    if (count === 0) return null;

    return (
        <div className="fixed bottom-28 right-6 z-40">
            <button
                onClick={onClick}
                className="relative bg-[#c21e2f] hover:bg-[#9f1239] w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#c21e2f]/40 active:scale-95 transition-all"
            >
                <span className="material-symbols-outlined text-2xl fill-[1]">shopping_bag</span>
                <div className="absolute -top-1 -right-1 bg-white text-[#c21e2f] text-[11px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#c21e2f]">
                    {count}
                </div>
            </button>
        </div>
    )
}
