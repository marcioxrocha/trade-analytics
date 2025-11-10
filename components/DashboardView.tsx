

import React from 'react';
import { AppProvider } from '../contexts/AppContext';
import { DashboardModalProvider } from '../contexts/ModalContext';
import DashboardViewContent from './DashboardViewContent';
import ModalRenderer from './ModalRenderer';
import { ApiProvider } from '../contexts/ApiContext';

interface DashboardViewProps {
  instanceKey?: string;
  department?: string;
  owner?: string;
}

const DashboardView: React.FC<DashboardViewProps> = ({ instanceKey, department, owner }) => {
    return (
        <ApiProvider instanceKey={instanceKey}>
            <AppProvider instanceKey={instanceKey} department={department} owner={owner}>
                <DashboardModalProvider>
                    <DashboardViewContent instanceKey={instanceKey} department={department} owner={owner}/>
                    <ModalRenderer />
                </DashboardModalProvider>
            </AppProvider>
        </ApiProvider>
    );
};

export default DashboardView;