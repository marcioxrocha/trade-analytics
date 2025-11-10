import React from 'react';
import Icon from './Icon';

type ModalSize = 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, size = 'md' }) => {
  if (!isOpen) {
    return null;
  }

  const sizeClasses: Record<ModalSize, string> = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full m-4 transform transition-all ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b rounded-t dark:border-gray-600">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white" id="modal-title">
            {title}
          </h3>
          <button
            type="button"
            className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center dark:hover:bg-gray-600 dark:hover:text-white"
            onClick={onClose}
            aria-label="Close modal"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end p-4 space-x-2 border-t border-gray-200 rounded-b dark:border-gray-600">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;