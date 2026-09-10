import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: {
        'Content-Type': 'application/json'
    }
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('sem_jwt_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use((response) => {
    const method = String(response.config?.method || 'get').toLowerCase();
    if (typeof window !== 'undefined' && ['post', 'put', 'patch', 'delete'].includes(method)) {
        window.dispatchEvent(new CustomEvent('sem:pms-mutated', {
            detail: {
                method,
                url: response.config?.url || '',
                occurredAt: Date.now(),
            },
        }));
    }
    return response;
}, (error) => Promise.reject(error));

export default api;
