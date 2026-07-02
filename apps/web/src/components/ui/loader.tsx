import { Loader2 } from 'lucide-react'; // Install lucide-react if not already: npm install lucide-react

export const Loading = () => {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="ml-2">Loading...</span>
    </div>
  );
};
