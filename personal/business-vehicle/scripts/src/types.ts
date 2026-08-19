/** Shape of data/vehicle.json. Optional members are facts that may not exist yet for a
    given vehicle; the renderer degrades to a stated gap rather than inventing a value. */

export interface VehicleData {
  meta: Meta;
  parties: Parties;
  fleet: Vehicle[];
  insuranceShopping: InsuranceShopping;
  compliance: Compliance;
  openQuestions: OpenQuestion[];
  nextActions: NextAction[];
}

export interface Meta {
  schemaVersion: number;
  asOf: string;
  maskingPolicy: string;
  sources: { id: string; file: string; pages: number; sensitive: boolean }[];
}

export interface Party {
  name?: string;
  legalName?: string;
  operatingAs?: string;
  role?: string;
  address?: string;
  [key: string]: unknown;
}

export interface Parties {
  driver: Party & {
    dateOfBirth?: string;
    licencedSince?: string;
    principalOperatorSince?: string;
    priorDrivingExperienceAbroadSince?: string;
    letterOfExperienceObtained?: boolean;
  };
  corporation: Party;
  lessor: Party;
  dealer: Party;
  insurer: Party & { brand?: string; underwriter?: string; channel?: string };
}

export interface Vehicle {
  id: string;
  status: "current" | "returned" | "ordered";
  identity: Identity;
  lease?: Lease;
  protection: Protection[];
  insurance: Policy[];
  service: ServiceVisit[];
}

export interface Identity {
  year: number;
  make: string;
  model: string;
  variant?: string;
  vin: string;
  colourName?: string;
  condition?: string;
  inServiceDate: string;
  [key: string]: unknown;
}

export interface Lease {
  agreementNumber?: string;
  dateOfLease?: string;
  termMonths?: number | null;
  kmPerYear?: number | null;
  excessKmRate?: number | null;
  monthlyPaymentBeforeTax?: number | null;
  monthlyPaymentTotal?: number | null;
  residualValue?: number | null;
  purchaseOptionPrice?: number | null;
  dueAtSigning?: number | null;
  totalOfPayments?: number | null;
  [key: string]: unknown;
}

export interface Protection {
  name: string;
  kind: "wear-and-tear" | "maintenance" | "mechanical" | "other";
  price?: number | null;
  termMonths?: number | null;
  termKm?: number | null;
  expiryDate?: string | null;
  expiryKm?: number | null;
  numberOfServices?: number | null;
  waiverLimit?: number | null;
  detail?: string;
  document?: string;
  [key: string]: unknown;
}

export interface CoverageLine {
  coverage: string;
  limit: number | null;
  deductible: number | null;
  premium: number | null;
  note: string | null;
}

export interface Endorsement {
  code: string;
  name: string;
  limit: number | null;
  premium: number | null;
  note: string | null;
}

export interface Policy {
  term: string;
  status: string;
  documentType: string;
  policyNumberMasked: string;
  insurer: string;
  underwriter: string;
  totalPremium: number;
  paymentFrequency: string;
  paymentAmount: number;
  billingCategory: string;
  coverages: CoverageLine[];
  endorsements: Endorsement[];
  optionalAccidentBenefits?: { benefit: string; limit: string; premium: number; basis?: string }[];
  notIncluded?: string[];
  rating: Rating;
  [key: string]: unknown;
}

export interface Rating {
  territory: string;
  parking: string;
  annualKm: number;
  businessKm: number | null;
  drivingRecord: number;
  rateGroups: Record<string, number>;
  discounts: { description: string; applied: string }[];
  convictionsPast3Years: { minor: number; major: number; serious: number };
  chargeableClaims: unknown[];
  [key: string]: unknown;
}

export interface ServiceVisit {
  invoiceNumber: string;
  date: string;
  dealer: string;
  serviceAdvisor?: string;
  odometerIn: number | null;
  odometerOut: number | null;
  coveredByPlan: boolean;
  customerPaid: number | null;
  lines: ServiceLine[];
  inspection?: {
    tireTreadDepthMm?: Record<string, number>;
    brakePadsMm?: Record<string, number>;
  };
  notes?: string;
  [key: string]: unknown;
}

export interface ServiceLine {
  code: string;
  description: string;
  hours?: number;
  charge?: number;
  finding?: string;
  outcome?: string;
  [key: string]: unknown;
}

export interface InsuranceShopping {
  objective: string;
  benchmark: { insurer: string; annualPremium: number; monthly: number; note: string };
  yearOverYear: { line: string; prior: number; renewal: number }[];
  whyItRose: { driver: string; detail: string; delta: number }[];
  unchangedRatingFactors: string[];
  coverageToMatch: { note: string; musts: string[] };
  brokers: Broker[];
  quotes: Quote[];
  rules: string[];
  [key: string]: unknown;
}

export interface Broker {
  name: string;
  contact?: string;
  email: string;
  phone?: string;
  location?: string;
  contactedOn: string;
  status: string;
  nextStep: string;
  marketNeutral: boolean;
  note: string | null;
}

export interface Quote {
  broker: string;
  carrier: string;
  receivedOn: string;
  annualPremium: number | null;
  newVehicleReplacement: string | null;
  notes: string | null;
}

export interface Compliance {
  corporateOwner: string;
  useSplit: {
    declared: string;
    businessKmOnPolicy: number | null;
    annualKmOnPolicy: number;
    businessUsePercent: number | null;
    risk: string;
  };
  mileageLog: { kept: boolean; note: string };
  taxTreatment: { topic: string; detail: string; status: string }[];
  note: string;
}

export interface OpenQuestion {
  id: string;
  question: string;
  askedOf: string;
  status: "open" | "answered";
  answer: string | null;
}

export interface NextAction {
  action: string;
  owner: string;
  due: string | null;
  status: string;
  priority: number;
  why: string;
}
