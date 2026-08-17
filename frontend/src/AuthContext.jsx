import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.me()
            .then((res) => setCustomer(res.customer))
            .catch(() => setCustomer(null))
            .finally(() => setLoading(false));
    }, []);

    async function login(email, password) {
        const res = await api.login({ email, password });
        setCustomer(res.customer);
        return res.customer;
    }

    async function register(name, email, password) {
        const res = await api.register({ name, email, password });
        setCustomer(res.customer);
        return res.customer;
    }

    async function logout() {
        await api.logout();
        setCustomer(null);
    }

    return (
        <AuthContext.Provider value={{ customer, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
