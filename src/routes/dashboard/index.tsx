import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
  component: () => (
    <div className='text-black'>
      {" "}
      <div>
        <Link to='/drivers'>Go to Dashboard</Link>
      </div>
    </div>
  ),
});
