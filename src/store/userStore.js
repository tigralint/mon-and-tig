import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUserStore = create(
  persist(
    (set, get) => ({
      tier: 'free', // 'free' | 'premium'
      tokens: 0,
      
      setTier: (tier) => set({ tier }),
      addTokens: (amount) => set((state) => ({ tokens: state.tokens + amount })),
      useTokens: (amount) => set((state) => ({ 
        tokens: Math.max(0, state.tokens - amount) 
      })),
      
      hasAIAccess: () => {
        const state = get();
        return state.tier === 'premium' || state.tokens > 0;
      }
    }),
    {
      name: 'user-storage', // имя ключа в localStorage
    }
  )
);
