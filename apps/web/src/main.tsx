import ReactDOM from 'react-dom/client';
import './index.css';
import { Toaster } from 'sonner';
import { AuthProvider } from './components/provider/auth-provider';
import { Application } from './components/provider/application';

const rootElement = document.getElementById('root')!;

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <AuthProvider>
      <Toaster position="top-center" />
      <Application />
    </AuthProvider>
  );
}
