import React, { useState, useEffect } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error);
    };
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  if (hasError) {
    let message = "ችግር ተፈጥሯል። እባክዎን ቆይተው እንደገና ይሞክሩ።";
    
    try {
      const firestoreError = JSON.parse(error?.message || "");
      if (firestoreError.error) {
        message = `የመረጃ ቋት ስህተት፦ ${firestoreError.error}። እባክዎን ፈቃድዎን ያረጋግጡ።`;
      }
    } catch (e) {
      // Not a JSON error
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-950 text-white">
        <div className="p-8 bg-slate-900 rounded-2xl shadow-xl max-w-md border border-slate-800">
          <h2 className="text-2xl font-bold text-red-500 mb-4">ይቅርታ!</h2>
          <p className="text-slate-400 mb-6">{message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-500 transition-colors"
          >
            መተግበሪያውን እንደገና ጫን
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
