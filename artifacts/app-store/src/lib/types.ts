export interface DedicatedAccount {
  accountNumber: string;
  bankName: string;
  bankSlug?: string;
  routingNumber?: string;
}

export interface Developer {
  id: number;
  clerkUserId: string;
  displayName: string;
  email: string;
  bio?: string | null;
  website?: string | null;
  company?: string | null;
  country: string;
  avatarUrl?: string | null;
  status: "active" | "suspended";
  paystackCustomerCode?: string | null;
  dedicatedNgnAccount?: DedicatedAccount | null;
  dedicatedUsdAccount?: DedicatedAccount | null;
  totalApps?: number;
  totalDownloads?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppSummary {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  category: string;
  platform: string;
  iconUrl: string;
  rating: number;
  ratingCount: number;
  totalDownloads: number;
  status: string;
  isFeatured: boolean;
  publishingFeePaid: boolean;
  developerName: string;
  createdAt: string;
}

export interface App extends AppSummary {
  description: string;
  screenshots: string[];
  downloadUrl: string | null;
  webUrl: string | null;
  currentVersion: string | null;
  developerWebsite: string | null;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPolicyFlags: string | null;
  aiReviewScore: number | null;
  rejectionReason: string | null;
  publishingFeeGateway: string | null;
  developerId: number;
  updatedAt: string;
}

export interface Category {
  name: string;
  iconEmoji: string;
  color: string;
  count: number;
}

export interface Review {
  id: number;
  appId: number;
  reviewerName: string;
  rating: number;
  comment: string | null;
  sentimentLabel: string;
  createdAt: string;
}

export interface AppVersion {
  id: number;
  appId: number;
  version: string;
  releaseNotes: string | null;
  downloadUrl: string | null;
  createdAt: string;
}

export interface AdminStats {
  totalApps: number;
  pendingPayment: number;
  pendingReview: number;
  approvedApps: number;
  totalDevelopers: number;
  totalDownloads: number;
}

export interface PaystackInitResult {
  gateway: "paystack";
  authorizationUrl: string;
  reference: string;
}

export interface InterswitchInitResult {
  gateway: "interswitch";
  paymentUrl: string;
  formData: Record<string, string>;
  appId: number;
}

export type PaymentInitResult = PaystackInitResult | InterswitchInitResult;
