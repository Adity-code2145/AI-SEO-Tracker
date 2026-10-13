import { createContext } from "react";
import type { AxiosInstance } from "axios";

export interface User {
    _id?: string;
    id?: string;
    name: string;
    email: string;
    plan: string;
    analysisCount?: number;
    lastAnalysisDate?: string | null;
}

export interface AppContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    api: AxiosInstance;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    register: (name: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
