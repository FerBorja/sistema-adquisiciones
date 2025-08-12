// frontend/src/contexts/ToastContext.jsx
import React, { createContext, useContext, useState } from 'react';
import ToastNotification from '../components/UI/ToastNotification';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ message: '', type: '' });

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: '' }), 3000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast.message && (
        <ToastNotification message={toast.message} type={toast.type} />
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
