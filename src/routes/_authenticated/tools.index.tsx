import { createFileRoute } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import Tools from '../../components/pages/tools';

export const Route = createFileRoute('/_authenticated/tools/')({
  component: Tools,
  staticData: {
    title: 'Tools',
    icon: Settings,
    group: 'Assets'
  }
});
