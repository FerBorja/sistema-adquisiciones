import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api', // Cambia según tu backend
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default apiClient;
