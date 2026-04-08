export interface ProvisionPlan {
  id: string;
  tripId: string;
  numberOfDays: number;
  numberOfCrew: number;
  meals: MealPlan[];
  waterPlan: WaterPlan;
  fuelPlan: FuelPlan;
  groceryList: GroceryItem[];
  createdAt: number;
  updatedAt: number;
}

export interface MealPlan {
  id: string;
  day: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  name: string;
  description?: string;
  ingredients: string[];
  isEasyToMake: boolean;
  notes?: string;
}

export interface WaterPlan {
  tankCapacityGallons: number;
  consumptionPerPersonPerDay: number;
  numberOfCrew: number;
  numberOfDays: number;
  totalNeeded: number;
  reserve: number;
  refillStops: string[];
}

export interface FuelPlan {
  tankCapacityGallons: number;
  consumptionGPH: number;
  estimatedMotoringHours: number;
  estimatedGeneratorHours: number;
  totalNeeded: number;
  reserve: number;
  refillStops: string[];
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: 'produce' | 'meat' | 'dairy' | 'dry-goods' | 'canned' | 'beverages' | 'snacks' | 'ice' | 'other';
  isPurchased: boolean;
  mealIds?: string[];
  notes?: string;
}
