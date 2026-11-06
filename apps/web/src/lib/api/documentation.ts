import type { DocumentationGuide } from '@mms/shared';
import { api } from './client';

export function getGpsGuide(): Promise<DocumentationGuide> {
  return api.get<DocumentationGuide>('/docs/gps');
}
