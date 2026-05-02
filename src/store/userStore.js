import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Промокоды для тестировщиков (захардкожены для Phase 0)
const VALID_PROMO_CODES = {
  'LUMEA2026':   { tier: 'premium', label: 'Premium-доступ' },
  'ТЕСТЛУМЕА':   { tier: 'premium', label: 'Premium-доступ' },
};

export const useUserStore = create(
  persist(
    (set, get) => ({
      tier: 'free', // 'free' | 'premium'
      tokens: 0,
      activatedPromo: null, // какой промокод активирован
      
      setTier: (tier) => set({ tier }),
      addTokens: (amount) => set((state) => ({ tokens: state.tokens + amount })),
      useTokens: (amount) => set((state) => ({ 
        tokens: Math.max(0, state.tokens - amount) 
      })),
      
      hasAIAccess: () => {
        const state = get();
        return state.tier === 'premium' || state.tokens > 0;
      },

      /**
       * Активация промокода.
       * @returns {{ success: boolean, message: string }}
       */
      activatePromo: (code) => {
        const trimmed = code.trim().toUpperCase();
        const promo = VALID_PROMO_CODES[trimmed];
        
        if (!promo) {
          return { success: false, message: 'Промокод не найден' };
        }

        const state = get();
        if (state.activatedPromo === trimmed) {
          return { success: false, message: 'Этот промокод уже активирован' };
        }

        set({ 
          tier: promo.tier, 
          activatedPromo: trimmed 
        });

        return { success: true, message: `${promo.label} активирован!` };
      },
    }),
    {
      name: 'user-storage', // имя ключа в localStorage
    }
  )
);
