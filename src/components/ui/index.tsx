import React from 'react';
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("ui-card", className)} {...props}>
      {children}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

export function Button({ children, className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button className={cn("ui-btn", `ui-btn-${variant}`, className)} {...props}>
      {children}
    </button>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("ui-input", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("ui-input", className)} {...props} />;
}

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const safeProgress = Math.min(100, Math.max(0, progress));
  return (
    <div className={cn("ui-progress-bar", className)}>
      <div className="ui-progress-fill" style={{ width: `${safeProgress}%` }} />
    </div>
  );
}
