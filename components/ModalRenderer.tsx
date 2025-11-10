
import React from 'react';
import { useDashboardModal } from '../contexts/ModalContext';
import Modal from './Modal';

const ModalRenderer: React.FC = () => {
    const { isModalOpen, modalConfig, hideModal } = useDashboardModal();

    if (!modalConfig) return null;

    return (
        <Modal
            isOpen={isModalOpen}
            onClose={hideModal}
            title={modalConfig.title}
            footer={modalConfig.footer}
        >
            {modalConfig.content}
        </Modal>
    );
}

export default ModalRenderer;
