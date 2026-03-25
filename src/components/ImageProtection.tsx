'use client';

import { useEffect } from 'react';

export default function ImageProtection() {
  useEffect(() => {
    // Prevent right-click on images
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.closest('.protected-image')) {
        e.preventDefault();
        return false;
      }
    };

    // Prevent drag on images
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        e.preventDefault();
        return false;
      }
    };

    // Prevent keyboard shortcuts for save
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block Ctrl+S, Ctrl+Shift+I (DevTools), Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        return false;
      }
      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        return false;
      }
    };

    // Prevent copy
    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      if (selection && selection.toString()) return; // Allow text copy
      e.preventDefault();
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('copy', handleCopy);

    // Add CSS to prevent image selection and saving
    const style = document.createElement('style');
    style.textContent = `
      img:not(.admin-image) {
        -webkit-user-select: none !important;
        user-select: none !important;
        -webkit-touch-callout: none !important;
        pointer-events: none !important;
      }
      .protected-image {
        position: relative;
        overflow: hidden;
      }
      .protected-image::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        pointer-events: auto;
        z-index: 10;
      }
      /* Prevent text selection on specific areas */
      .no-select {
        -webkit-user-select: none;
        user-select: none;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('copy', handleCopy);
      document.head.removeChild(style);
    };
  }, []);

  return null;
}
