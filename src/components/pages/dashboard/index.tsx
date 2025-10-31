import MetricCard from '@/components/shared/metric-card';

const Dashboard = () => {
  return (
    <div>
      <div className="grid grid-cols-4 gap-5">
        <MetricCard title="Available Vehicles" value={11} />
        <MetricCard title="Under Maintenance" value={5} />
        <MetricCard title="Waiting for Spare Parts" value={6} />
        <MetricCard title="Trips Completed" value={183} />
      </div>
    </div>
  );
};

export default Dashboard;
