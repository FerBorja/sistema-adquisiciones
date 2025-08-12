// frontend/src/pages/NotFound.jsx

import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="mb-4">Sorry, the page you requested does not exist.</p>
      <Link to="/" className="text-blue-600 hover:underline">Go to Home</Link>
    </div>
  );
}
