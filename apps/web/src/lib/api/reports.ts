import type { ReportQuery, ReportResult } from '@mms/shared';
import { api } from './client';
export const getReport = (query: ReportQuery) =>
  api.get<ReportResult>('/reports', { ...query });
