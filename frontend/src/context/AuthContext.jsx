import React, { createContext, useState, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Αν ο χρήστης έχει ήδη ενεργό session, κάνε αυτόματο login
        const savedUser = localStorage.getItem('sem_user');
        const token = localStorage.getItem('sem_jwt_token');
        
        if (savedUser && token) {
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    // Βήμα 1: Email & Password
    const loginStep1 = async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        return response.data; // Επιστρέφει το { userId }
    };

    // Βήμα 2: Έλεγχος 2FA Κωδικού
    const loginStep2 = async (userId, code, rememberDevice) => {
        const response = await api.post('/auth/verify-2fa', { userId, code, rememberDevice });
        const { token, rememberDeviceToken, user: userData } = response.data;

        // Αποθήκευση σταθερών στοιχείων στο LocalStorage
        localStorage.setItem('sem_jwt_token', token);
        localStorage.setItem('sem_user', JSON.stringify(userData));
        
        if (rememberDeviceToken) {
            localStorage.setItem('sem_device_token', rememberDeviceToken);
        }

        setUser(userData);
        return userData;
    };

    const logout = () => {
        localStorage.removeItem('sem_jwt_token');
        localStorage.removeItem('sem_user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, loginStep1, loginStep2, logout }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};