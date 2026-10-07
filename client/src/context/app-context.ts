import { createContext } from "react";
import type { AxiosInstance } from "axios";

export interface User {
    id: string;
    name: string;
    email: string;
    plan: string;
    analysisCount?: number;
}

export interface AppContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    api: AxiosInstance;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    register: (name: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
