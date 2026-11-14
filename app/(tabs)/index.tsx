import React from 'react';

import WorkoutHome from '../../features/workout/WorkoutHome';
import TabScreen from '../../features/shell/TabScreen';

export default function WorkoutTab() {
  return (
    <TabScreen>
      <WorkoutHome />
    </TabScreen>
  );
}
