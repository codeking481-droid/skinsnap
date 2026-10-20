import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type RoutineStep = { id: string; title: string; done: boolean };
export type ProgressPhoto = { id: string; uri: string; date: string };
type StoredState = {
  onboarded: boolean;
  goals: string[];
  experience: string;
  complexity: string;
  routine: { morning: RoutineStep[]; evening: RoutineStep[] };
  completedDate: string;
  photos: ProgressPhoto[];
};
type AppContextValue = StoredState & {
  ready: boolean;
  setOnboarded: () => void;
  setGoals: (goals: string[]) => void;
  setPreferences: (experience: string, complexity: string) => void;
  toggleStep: (period: 'morning' | 'evening', id: string) => void;
  addStep: (period: 'morning' | 'evening', title: string) => void;
  updateStep: (period: 'morning' | 'evening', id: string, title: string) => void;
  removeStep: (period: 'morning' | 'evening', id: string) => void;
  savePhoto: (uri: string) => void;
  deletePhoto: (id: string) => void;
  clearPhotos: () => void;
  resetData: () => Promise<void>;
};

const initialState: StoredState = {
  onboarded: false,
  goals: [],
  experience: 'Finding my footing',
  complexity: 'Keep it simple',
  routine: {
    morning: [
      { id: 'm1', title: 'Gentle cleanser', done: false },
      { id: 'm2', title: 'Daily moisturiser', done: false },
      { id: 'm3', title: 'Broad-spectrum SPF', done: false },
    ],
    evening: [
      { id: 'e1', title: 'Remove the day', done: false },
      { id: 'e2', title: 'Gentle cleanser', done: false },
      { id: 'e3', title: 'Moisturiser', done: false },
    ],
  },
  completedDate: '',
  photos: [],
};

const STORAGE_KEY = 'skinsnap.local.v1';
const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoredState>(initialState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<StoredState>;
          setState({ ...initialState, ...parsed, routine: parsed.routine ?? initialState.routine });
        }
      })
      .catch((error: unknown) => console.warn('Unable to load SkinSnap data', error))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((error: unknown) =>
        console.warn('Unable to save SkinSnap data', error),
      );
    }
  }, [ready, state]);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      ready,
      setOnboarded: () => setState((current) => ({ ...current, onboarded: true })),
      setGoals: (goals) => setState((current) => ({ ...current, goals })),
      setPreferences: (experience, complexity) =>
        setState((current) => ({ ...current, experience, complexity })),
      toggleStep: (period, id) =>
        setState((current) => ({
          ...current,
          completedDate: new Date().toDateString(),
          routine: {
            ...current.routine,
            [period]: current.routine[period].map((step) =>
              step.id === id ? { ...step, done: !step.done } : step,
            ),
          },
        })),
      addStep: (period, title) =>
        setState((current) => ({
          ...current,
          routine: {
            ...current.routine,
            [period]: [...current.routine[period], { id: `${Date.now()}`, title, done: false }],
          },
        })),
      updateStep: (period, id, title) =>
        setState((current) => ({
          ...current,
          routine: {
            ...current.routine,
            [period]: current.routine[period].map((step) => (step.id === id ? { ...step, title } : step)),
          },
        })),
      removeStep: (period, id) =>
        setState((current) => ({
          ...current,
          routine: { ...current.routine, [period]: current.routine[period].filter((step) => step.id !== id) },
        })),
      savePhoto: (uri) =>
        setState((current) => ({
          ...current,
          photos: [{ id: `${Date.now()}`, uri, date: new Date().toLocaleDateString() }, ...current.photos],
        })),
      deletePhoto: (id) =>
        setState((current) => ({ ...current, photos: current.photos.filter((photo) => photo.id !== id) })),
      clearPhotos: () => setState((current) => ({ ...current, photos: [] })),
      resetData: async () => {
        await AsyncStorage.removeItem(STORAGE_KEY);
        setState(initialState);
      },
    }),
    [ready, state],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppState must be used inside AppProvider');
  return context;
}
