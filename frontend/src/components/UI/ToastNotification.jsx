import React, { useEffect, useState } from 'react';

export default function ToastNotification({ message, type = 'info' }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show toast (fade-in)
    setVisible(true);

    // Hide toast after 3 seconds (fade-out)
    const timer = setTimeout(() => setVisible(false), 3000);

    return () => clearTimeout(timer);
  }, [message]);

  const typeStyles = {
    success: 'bg-green-500',
    error: 'bg-red-600',
    info: 'bg-blue-600',
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded shadow-lg text-white
        transition-opacity duration-500 ease-in-out
        ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        ${typeStyles[type] || typeStyles.info}`}
      role="alert"
      aria-live="assertive"
    >
      {message}
    </div>
  );
}
