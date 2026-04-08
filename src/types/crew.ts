export interface CrewMember {
  id: string;
  name: string;
  role: 'captain' | 'first-mate' | 'crew' | 'passenger';
  age?: number;
  isChild: boolean;
  canStandWatch: boolean;
  sailingExperience: 'none' | 'beginner' | 'intermediate' | 'experienced';
  certifications?: string[];
  medicalInfo?: string;
  medications?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dietaryRestrictions?: string[];
  phone?: string;
  email?: string;
}

export interface WatchSchedule {
  id: string;
  tripId: string;
  routeId?: string;
  watchLengthHours: number;
  startTime: string;
  endTime: string;
  rotations: WatchRotation[];
}

export interface WatchRotation {
  id: string;
  crewMemberId: string;
  crewMemberName: string;
  startTime: string;
  endTime: string;
  isOnWatch: boolean;
  notes?: string;
}
