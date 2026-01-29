import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CompanySettings } from '../types';
import api from '../services/api';

interface SettingsState {
  settings: CompanySettings;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<CompanySettings>) => void;
}

const defaultSettings: CompanySettings = {
  logo_url: null,
  icon_vacation: 'Palmtree',
  icon_sick: 'Cross',
  icon_office: 'Building2',
  icon_remote: 'Monitor',
  icon_holiday: 'Gift',
  icon_excused: 'CircleCheckBig',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      isLoading: false,
      error: null,

      fetchSettings: async () => {
        set({ isLoading: true, error: null });
        try {
          const settings = await api.getCompanySettings();
          set({ settings: { ...defaultSettings, ...settings }, isLoading: false });
        } catch (error: any) {
          set({ error: 'Failed to load settings', isLoading: false });
        }
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },
    }),
    {
      name: 'settings-storage',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
