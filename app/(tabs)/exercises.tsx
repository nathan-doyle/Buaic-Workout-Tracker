import React from 'react';

import LibraryScreen from '../../features/library/LibraryScreen';
import TabScreen from '../../features/shell/TabScreen';

export default function ExercisesTab() {
  return (
    <TabScreen>
      <LibraryScreen />
    </TabScreen>
  );
}
