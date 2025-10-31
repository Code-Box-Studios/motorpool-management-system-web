import { useEffect } from 'react'; // Add useEffect
import { useAuth } from '@/hooks/use-auth';
import { useNavigate } from '@tanstack/react-router'; // Change to useNavigate

const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate({ to: '/dashboard' });
    }
  }, [session, navigate]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      {children}
    </div>
  );
};

export default PublicLayout;
