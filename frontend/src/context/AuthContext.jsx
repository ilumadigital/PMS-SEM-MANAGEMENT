import React, { createContext, useState, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('sem_user');
        const token = localStorage.getItem('sem_jwt_token');

        if (savedUser && token) {
            try {
                setUser(JSON.parse(savedUser));
            } catch {
                localStorage.removeItem('sem_user');
                localStorage.removeItem('sem_jwt_token');
            }
        }
        setLoading(false);
    }, []);

    const persistSession = ({ token, user: userData, rememberDeviceToken }) => {
        localStorage.setItem('sem_jwt_token', token);
        localStorage.setItem('sem_user', JSON.stringify(userData));

        if (rememberDeviceToken) {
            localStorage.setItem('sem_device_token', rememberDeviceToken);
        }

        setUser(userData);
        return userData;
    };

    const loginStep1 = async (email, password) => {
        const deviceToken = localStorage.getItem('sem_device_token');
        const response = await api.post('/auth/login', { email, password, deviceToken });
        const data = response.data;

        if (data?.authenticated && data?.token && data?.user) {
            persistSession(data);
        }

        return data;
    };

    const loginStep2 = async (userId, code, rememberDevice) => {
        const response = await api.post('/auth/verify-2fa', { userId, code, rememberDevice });
        return persistSession(response.data);
    };

    const logout = () => {
        localStorage.removeItem('sem_jwt_token');
        localStorage.removeItem('sem_user');
        // sem_device_token intentionally remains when the user chose
        // "Trust this device" so the next sign-in on this device skips 2FA.
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, loginStep1, loginStep2, logout }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
