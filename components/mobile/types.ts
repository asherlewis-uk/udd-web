import type { ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import type {
  NextAction,
  ProviderReadiness,
  RuntimeSummary,
  ValidationSummary,
} from "@/lib/workspace/next-action";
import type { AITaskStatus, ProjectStatus, RunStatus } from "@/lib/types";

export type MobileScreen = "chat" | "preview" | "settings";

export type MobileProject = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  updatedLabel: string;
  lastOpenedLabel: string | null;
  current: boolean;
};

export type MobileProfile = {
  email: string;
  displayName: string | null;
};

export type MobileConversationFact = {
  label: string;
  value: string;
  tone?: "default" | "destructive" | "success";
};

export type MobileConversationEntry = {
  id: string;
  role: "assistant" | "user";
  createdAt: string;
  body: string;
  badges?: string[];
  facts?: MobileConversationFact[];
  href?: {
    label: string;
    url: string;
  };
  status?: AITaskStatus | RunStatus;
  taskId?: string;
  canRepair?: boolean;
  canRetry?: boolean;
};

export type MobileFileSummary = {
  id: string;
  path: string;
  language: string | null;
  sizeLabel: string;
  updatedLabel: string;
};

export type MobileRunEvent = {
  id: string;
  level: string;
  source: string;
  message: string;
  createdLabel: string;
};

export type MobileRunSession = {
  id: string;
  status: RunStatus;
  previewUrl: string | null;
  error: string | null;
  createdLabel: string;
  startedLabel: string | null;
  stoppedLabel: string | null;
};

export type MobileTaskSummary = {
  id: string;
  title: string;
  kind: string;
  status: AITaskStatus;
  createdLabel: string;
  finishedLabel: string | null;
  href: string;
  canRepair: boolean;
  canRetry: boolean;
};

export type MobileShellProps = {
  project: MobileProject;
  projects: MobileProject[];
  profile: MobileProfile;
  conversation: MobileConversationEntry[];
  files: MobileFileSummary[];
  filesCount: number;
  latestTask: MobileTaskSummary | null;
  latestRunSession: MobileRunSession | null;
  latestRunSummary: RuntimeSummary | null;
  validationSummary: ValidationSummary | null;
  runEvents: MobileRunEvent[];
  nextAction: NextAction;
  activeProvider: ActiveProviderInfo;
  providerReadiness: ProviderReadiness;
  taskInFlight: boolean;
  runInFlight: boolean;
};
