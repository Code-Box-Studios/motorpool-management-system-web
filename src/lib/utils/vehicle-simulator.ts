import { updateVehicleLocation } from '@/lib/supabase/vehicle-tracking';

// Davao Region coordinates and routes
const DAVAO_REGION_ROUTES = [
  // Route 1: Davao City downtown area
  [
    { lat: 7.0731, lng: 125.6128 }, // Roxas Avenue
    { lat: 7.0744, lng: 125.6089 }, // San Pedro Street
    { lat: 7.0789, lng: 125.6123 }, // CM Recto Avenue
    { lat: 7.0821, lng: 125.6156 }, // JP Laurel Avenue
    { lat: 7.0856, lng: 125.6189 }, // Quirino Avenue
    { lat: 7.0901, lng: 125.6234 }, // Ulas
    { lat: 7.0945, lng: 125.6267 }, // Agdao
    { lat: 7.0989, lng: 125.6301 }  // Buhangin
  ],
  // Route 2: Davao City to Tagum
  [
    { lat: 7.0731, lng: 125.6128 }, // Start: Davao City
    { lat: 7.1234, lng: 125.6534 },
    { lat: 7.1756, lng: 125.6945 },
    { lat: 7.2289, lng: 125.7234 },
    { lat: 7.2812, lng: 125.7567 },
    { lat: 7.3345, lng: 125.7890 },
    { lat: 7.3878, lng: 125.8123 },
    { lat: 7.4467, lng: 125.8078 }  // End: Tagum City
  ],
  // Route 3: Davao City coastal road
  [
    { lat: 7.0731, lng: 125.6128 },
    { lat: 7.0623, lng: 125.5989 },
    { lat: 7.0512, lng: 125.5867 },
    { lat: 7.0401, lng: 125.5734 },
    { lat: 7.0289, lng: 125.5612 },
    { lat: 7.0178, lng: 125.5489 }
  ]
];

interface SimulatorConfig {
  vehicleId: string;
  routeIndex?: number;
  speed?: number; // milliseconds between updates
  loop?: boolean;
}

class VehicleSimulator {
  private vehicleId: string;
  private route: Array<{ lat: number; lng: number }>;
  private currentIndex: number = 0;
  private intervalId: number | null = null;
  private speed: number;
  private loop: boolean;
  private isRunning: boolean = false;

  constructor(config: SimulatorConfig) {
    this.vehicleId = config.vehicleId;
    this.route = DAVAO_REGION_ROUTES[config.routeIndex || 0];
    this.speed = config.speed || 3000; // 3 seconds by default
    this.loop = config.loop ?? true;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log(`Starting vehicle simulator for ${this.vehicleId}`);
    
    // Update immediately
    this.updateLocation();
    
    // Then update at intervals
    this.intervalId = setInterval(() => {
      this.updateLocation();
    }, this.speed);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log(`Stopped vehicle simulator for ${this.vehicleId}`);
    }
  }

  private async updateLocation() {
    const location = this.route[this.currentIndex];
    
    try {
      await updateVehicleLocation(
        this.vehicleId,
        location.lat,
        location.lng
      );
      
      console.log(
        `Updated vehicle ${this.vehicleId} to:`,
        location.lat,
        location.lng
      );
      
      // Move to next point
      this.currentIndex++;
      
      // Loop or stop at end
      if (this.currentIndex >= this.route.length) {
        if (this.loop) {
          this.currentIndex = 0;
        } else {
          this.stop();
        }
      }
    } catch (error) {
      console.error('Error updating vehicle location:', error);
    }
  }

  isActive() {
    return this.isRunning;
  }
}

// Singleton manager for multiple vehicle simulators
class SimulatorManager {
  private simulators: Map<string, VehicleSimulator> = new Map();

  startSimulator(config: SimulatorConfig) {
    // Stop existing simulator if running
    this.stopSimulator(config.vehicleId);
    
    // Create and start new simulator
    const simulator = new VehicleSimulator(config);
    this.simulators.set(config.vehicleId, simulator);
    simulator.start();
    
    return simulator;
  }

  stopSimulator(vehicleId: string) {
    const simulator = this.simulators.get(vehicleId);
    if (simulator) {
      simulator.stop();
      this.simulators.delete(vehicleId);
    }
  }

  stopAll() {
    this.simulators.forEach((simulator) => simulator.stop());
    this.simulators.clear();
  }

  isRunning(vehicleId: string): boolean {
    const simulator = this.simulators.get(vehicleId);
    return simulator ? simulator.isActive() : false;
  }
}

export const simulatorManager = new SimulatorManager();
export { VehicleSimulator };
