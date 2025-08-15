import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function RequisitionsLayout({ children }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar minimal /> {/* Minimal navbar */}
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}
