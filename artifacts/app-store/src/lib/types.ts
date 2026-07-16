export interface StoreAppSummary {
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
  isFeatured?: boolean;
  developerName?: string;
  createdAt: string;
}

export interface StoreApp extends StoreAppSummary {
  description: string;
  screenshots: string[];
  downloadUrl: string | null;
  webUrl: string | null;
  currentVersion: string | null;
  developerId: number;
  developerWebsite: string | null;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPolicyFlags: string | null;
  aiReviewScore: number | null;
  rejectionReason: string | null;
  updatedAt: string;
}

export interface StoreCategory {
  name: string;
  count: number;
  iconEmoji: string;
}

export interface StoreReview {
  id: number;
  appId: number;
  reviewerName: string;
  rating: number;
  comment: string | null;
  sentimentLabel: string | null;
  isFlagged: boolean;
  helpfulCount: number;
  createdAt: string;
}

export interface StoreAppVersion {
  id: number;
  appId: number;
  version: string;
  releaseNotes: string | null;
  fileUrl: string | null;
  status: string;
  createdAt: string;
}

export interface StoreDeveloper {
  id: number;
  clerkUserId: string;
  displayName: string;
  bio: string | null;
  website: string | null;
  company: string | null;
  avatarUrl: string | null;
  status: string;
  registrationFeePaid: boolean;
  totalApps: number;
  totalDownloads: number;
  createdAt: string;
}

export interface StoreAdminStats {
  totalApps: number;
  totalDevelopers: number;
  totalDownloads: number;
  totalReviews: number;
  pendingReview: number;
  approvedApps: number;
  rejectedApps: number;
  topApps: StoreAppSummary[];
}

export interface StoreAppPage {
  apps: StoreAppSummary[];
  total: number;
  page: number;
  limit: number;
}
