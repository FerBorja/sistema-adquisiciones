// frontend/src/components/Layout/Footer.jsx

import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-gray-100 text-center p-4 text-sm text-gray-600">
      &copy; {new Date().getFullYear()} Sistema de Adquisiciones - Facultad de Ingeniería UACH
    </footer>
  );
}
