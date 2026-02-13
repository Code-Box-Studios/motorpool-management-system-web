import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Calendar, Gauge, TrendingUp } from 'lucide-react';

interface PreventiveMaintenanceCardProps {
  id: string;
  plateNumber: string;
  vehicleName: string;
  mileage: number;
  maintenanceDue: number;
  lastMaintenance: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  predictedSchedule?: string;
  predictedDate?: string;
}

export const PreventiveMaintenanceCard = ({
  plateNumber,
  vehicleName,
  mileage,
  maintenanceDue,
  lastMaintenance,
  priority,
  reason,
  predictedSchedule,
  predictedDate
}: PreventiveMaintenanceCardProps) => {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold">{vehicleName}</h3>
              <p className="text-muted-foreground text-sm">{plateNumber}</p>
            </div>
            <Badge variant={priority === 'high' ? 'destructive' : 'default'}>
              {priority === 'high' ? 'High Priority' : 'Medium Priority'}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Gauge className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground">Current Mileage:</span>
              <span className="font-medium">{mileage.toLocaleString()} km</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-muted-foreground">Maintenance Due:</span>
              <span className="font-medium">
                {maintenanceDue.toLocaleString()} km
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="text-muted-foreground h-4 w-4" />
              <span className="text-muted-foreground">Last Service:</span>
              <span className="font-medium">
                {new Date(lastMaintenance).toLocaleDateString()}
              </span>
            </div>
            {predictedSchedule && (
              <div className="flex items-start gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="text-muted-foreground">Parts:</span>
                <span className="font-medium">{predictedSchedule}</span>
              </div>
            )}
            {predictedDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="text-muted-foreground h-4 w-4" />
                <span className="text-muted-foreground">Predicted:</span>
                <span className="font-medium">
                  {new Date(predictedDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {!predictedSchedule && (
            <div className="border-t pt-2">
              <p className="text-muted-foreground text-sm italic">{reason}</p>
            </div>
          )}

          {!predictedSchedule && (
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className={`h-2 rounded-full ${
                  priority === 'high' ? 'bg-red-500' : 'bg-orange-500'
                }`}
                style={{
                  width: `${(mileage / maintenanceDue) * 100}%`
                }}
              ></div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
