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
  feeExempt?: boolean;
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
  packageName: string | null;
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

export interface OfflinePayment {
  id: number;
  appId: number;
  appName: string | null;
  appSlug: string | null;
  developerId: number;
  developerName: string | null;
  developerEmail: string | null;
  proofUrl: string;
  proofNote: string | null;
  amountPaid: string | null;
  bankReference: string | null;
  status: "submitted" | "admin_approved" | "super_approved" | "rejected" | "cancelled";
  adminNote: string | null;
  adminApprovedAt: string | null;
  superNote: string | null;
  superApprovedAt: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  createdAt: string;
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

// ── Platform linking ─────────────────────────────────────────────────────────

export type PlatformId =
  | "github" | "gitlab" | "gitbucket" | "bitbucket"
  | "heroku" | "netlify" | "vercel" | "render";

export interface LinkedAccount {
  id: number;
  developerId: number;
  platform: PlatformId;
  username: string | null;
  displayName: string | null;
  instanceUrl: string | null;
  avatarUrl: string | null;
  verified: boolean;
  createdAt: string;
}

export interface PlatformRepo {
  path: string;
  name: string;
  url: string;
  defaultBranch: string;
  description?: string;
}

export interface AppRepoLink {
  id: number;
  appId: number;
  linkedAccountId: number;
  platform: PlatformId;
  username: string | null;
  repoPath: string;
  branch: string;
  deploymentUrl: string | null;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastCommitAuthor: string | null;
  lastCommitUrl: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

// ── AI App Launcher ──────────────────────────────────────────────────────────

export interface AiLaunchGeneratedData {
  name?: string;
  tagline?: string;
  description?: string;
  category?: string;
  platform?: string;
  keywords?: string[];
  features?: string[];
  iconUrl?: string;
  screenshots?: string[];
  downloadUrl?: string;
  webUrl?: string;
  currentVersion?: string;
  packageName?: string;
}

export interface AiLaunchSession {
  sessionId: number;
  status: "uploading" | "processing" | "ready" | "failed" | "submitted";
  errorMessage?: string | null;
  extractedFiles?: {
    manifest?: Record<string, unknown>;
    iconUrl?: string;
    screenshotUrls?: string[];
  };
  aiGenerated?: AiLaunchGeneratedData;
  appId?: number | null;
}

export interface UpdateRequest {
  id: number;
  appId: number;
  appName: string;
  appSlug: string;
  developerName: string;
  developerId: number;
  platform: PlatformId;
  repoPath: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  commitUrl: string | null;
  commitAuthor: string | null;
  newVersion: string | null;
  newDownloadUrl: string | null;
  newDescription: string | null;
  changesSummary: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  adminUserId: string | null;
  adminNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
