import axios from "axios";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppContext, type User } from "./app-context";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export function AppProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
    const [loading, setLoading] = useState(() => Boolean(localStorage.getItem("token")));

    const api = useMemo(() => {
        const instance = axios.create({ baseURL: BACKEND_URL });
        instance.interceptors.request.use((config) => {
            const storedToken = localStorage.getItem("token");
            if (storedToken) config.headers.Authorization = `Bearer ${storedToken}`;
            return config;
        });
        return instance;
    }, []);

    useEffect(() => {
        if (!token) return;

        let active = true;
        const loadUser = async () => {
            try {
                const { data } = await api.get("/api/auth/user");
                if (active && data.success) setUser(data.user);
            } catch {
                if (active) {
                    localStorage.removeItem("token");
                    setToken(null);
                    setUser(null);
                }
            } finally {
                if (active) setLoading(false);
            }
        };
        void loadUser();

        return () => {
            active = false;
        };
    }, [api, token]);

    const login = async (email: string, password: string) => {
        try {
            const { data } = await api.post("/api/auth/login", { email, password });
            if (!data.success) return { success: false, message: data.message };
            localStorage.setItem("token", data.token);
            setUser(data.user);
            setLoading(true);
            setToken(data.token);
            return { success: true };
        } catch (error: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message
                : undefined;
            return { success: false, message: message || "Login failed" };
        }
    };

    const register = async (name: string, email: string, password: string) => {
        try {
            const { data } = await api.post("/api/auth/register", { name, email, password });
            if (!data.success) return { success: false, message: data.message };
            localStorage.setItem("token", data.token);
            setUser(data.user);
            setLoading(true);
            setToken(data.token);
            return { success: true };
        } catch (error: unknown) {
            const message = axios.isAxiosError<{ message?: string }>(error)
                ? error.response?.data?.message
                : undefined;
            return { success: false, message: message || "Registration failed" };
        }
    };

    const logout = () => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
        setLoading(false);
    };

    return (
        <AppContext.Provider value={{ user, token, loading, api, login, register, logout }}>
            {children}
        </AppContext.Provider>
    );
}
