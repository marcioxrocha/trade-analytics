import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { ModalConfig, DashboardModalContextType } from '../types';

const DashboardModalContext = createContext<DashboardModalContextType | undefined>(undefined);

export const DashboardModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);

  const showModal = useCallback((config: ModalConfig) => {
    setModalConfig(config);
    setIsModalOpen(true);
  }, []);

  const hideModal = useCallback(() => {
    setIsModalOpen(false);
    // Delay clearing config to allow for fade-out animations if any
    setTimeout(() => {
        setModalConfig(null);
    }, 300);
  }, []);
  
  const value = {
    isModalOpen,
    modalConfig,
    showModal,
    hideModal,
  };

  return (
    <DashboardModalContext.Provider value={value}>
      {children}
    </DashboardModalContext.Provider>
  );
};

export const useDashboardModal = (): DashboardModalContextType => {
  const context = useContext(DashboardModalContext);
  if (context === undefined) {
    throw new Error('useDashboardModal must be used within a DashboardModalProvider');
  }
  return context;
};
