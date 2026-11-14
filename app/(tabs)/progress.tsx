import React from 'react';

import ProgressScreen from '../../features/progress/ProgressScreen';
import TabScreen from '../../features/shell/TabScreen';

export default function ProgressTab() {
  return (
    <TabScreen>
      <ProgressScreen />
    </TabScreen>
  );
}
