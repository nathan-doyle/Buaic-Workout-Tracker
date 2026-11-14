import React from 'react';

import HistoryScreen from '../../features/history/HistoryScreen';
import TabScreen from '../../features/shell/TabScreen';

export default function HistoryTab() {
  return (
    <TabScreen>
      <HistoryScreen />
    </TabScreen>
  );
}
