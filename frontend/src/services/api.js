import axios from 'axios';

// Αν υπάρχει το VITE_API_URL (στον server) το παίρνει, αλλιώς παίζει τοπικά (στο PC σου)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Αυτόματος έλεγχος για το Token πριν από κάθε αίτημα
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('sem_jwt_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export default api;