import { describeJobOrder } from '@mms/shared';

// The web's snake_case job order, summarised the same way the API titles it
// (picked services, then any additional services).
export function jobOrderSummary(order: {
  services?: string[] | null;
  incident_details?: string | null;
}): string | null {
  return describeJobOrder({
    services: order.services,
    incidentDetails: order.incident_details
  });
}
