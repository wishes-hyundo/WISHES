'use client';
import React from 'react';
export function ToastProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
export function useToast() { return { toast: (msg: string) => console.log(msg), dismiss: () => {} }; }
export default ToastProvider;
