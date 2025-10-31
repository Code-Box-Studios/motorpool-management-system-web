import MetricCard from '../../shared/metric-card';

const Drivers = () => {
  return (
    <div>
      <div className="grid grid-cols-3 gap-5">
        <MetricCard title="Total Drivers" value={11} />
        <MetricCard title="On-trip Driver" value={5} />
        <MetricCard title="Available Drivers" value={6} />
      </div>
    </div>
  );
};

export default Drivers;
