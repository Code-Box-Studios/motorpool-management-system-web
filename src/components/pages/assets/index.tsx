import MetricCard from '@/components/shared/metric-card';
import React from 'react';

const Assets = () => {
  return (
    <div>
      <div className="grid grid-cols-3 gap-5">
        <MetricCard title="Total Vehicles" value={11} />
        <MetricCard title="Available Vehicles" value={5} />
        <MetricCard title="Under Maintenance Vehicles" value={6} />
      </div>
    </div>
  );
};

export default Assets;
