import React, { createContext, useState, useEffect } from 'react';
import apiClient from '../api/apiClient'; // Axios instance with baseURL

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);

  useEffect(() => {
    if (token) {
      apiClient
        .get('/users/me/', { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          setUser(res.data); // log removed
        })
        .catch((err) => {
          console.error('Error fetching user profile:', err);
          logout();
        });
    }
  }, [token]);
  
  const login = async ({ employee_number, password }) => {
    try {
      const res = await apiClient.post('/token/', {
        employee_number,
        password,
      });
      const accessToken = res.data.access;
      localStorage.setItem('token', accessToken);
      setToken(accessToken);

      // Fetch profile after login
      const profileRes = await apiClient.get('/users/me/', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setUser(profileRes.data);
    } catch (err) {
      console.error('Login failed:', err);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
