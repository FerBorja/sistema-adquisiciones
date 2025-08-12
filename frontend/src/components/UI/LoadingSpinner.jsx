// frontend/src/components/UI/LoadingSpinner.jsx

import React from 'react';

export default function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center py-8">
      <div className="w-10 h-10 border-4 border-blue-500 border-dashed rounded-full animate-spin"></div>
    </div>
  );
}
