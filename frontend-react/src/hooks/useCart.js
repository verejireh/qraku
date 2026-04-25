import { useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'order_cart_react';

export function useCart() {
    const [cart, setCart] = useState(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { return []; }
        }
        return [];
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    }, [cart]);

    const addToCart = (item, quantity = 1, options = {}, isTakeoutItem = false) => {
        setCart(prev => {
            const existing = prev.find(prevItem =>
                prevItem.menuId === item.id &&
                JSON.stringify(prevItem.options) === JSON.stringify(options) &&
                Boolean(prevItem.isTakeoutItem) === Boolean(isTakeoutItem)
            );

            if (existing) {
                return prev.map(prevItem =>
                    prevItem.id === existing.id
                        ? { ...prevItem, quantity: prevItem.quantity + quantity }
                        : prevItem
                );
            }

            // Calculate extra price sum from the selected options
            let extraPriceSum = 0;
            if (options && typeof options === 'object') {
                try {
                    const dbOptions = typeof item.options === 'string' ? JSON.parse(item.options) : item.options;
                    if (dbOptions && Array.isArray(dbOptions)) {
                        Object.entries(options).forEach(([groupName, choiceName]) => {
                            const group = dbOptions.find(g => g.group_name === groupName);
                            if (group) {
                                const choice = group.choices?.find(c => c.name === choiceName);
                                if (choice && choice.extra_price) {
                                    extraPriceSum += Number(choice.extra_price);
                                }
                            }
                        });
                    }
                } catch (e) {
                    console.error("Failed to calculate extra price", e);
                }
            }

            return [...prev, {
                id: Date.now(),
                menuId: item.id,
                name: item.name,
                name_ko: item.name_ko,
                price: item.price,
                extra_price_sum: extraPriceSum,
                image_url: item.image_url,
                quantity,
                options,
                isTakeoutItem: Boolean(isTakeoutItem)
            }];
        });
    };

    const removeFromCart = (id) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id, delta) => {
        setCart(prev => {
            const item = prev.find(i => i.id === id);
            if (!item) return prev;

            const newQuantity = item.quantity + delta;
            if (newQuantity <= 0) {
                return prev.filter(i => i.id !== id);
            }

            return prev.map(i =>
                i.id === id ? { ...i, quantity: newQuantity } : i
            );
        });
    };

    const clearCart = () => setCart([]);

    const totalQuantity = useMemo(() =>
        cart.reduce((sum, item) => sum + item.quantity, 0),
        [cart]);

    const totalAmount = useMemo(() =>
        cart.reduce((sum, item) => sum + ((item.price + (item.extra_price_sum || 0)) * item.quantity), 0),
        [cart]);

    return { cart, addToCart, removeFromCart, updateQuantity, clearCart, totalQuantity, totalAmount };
}
