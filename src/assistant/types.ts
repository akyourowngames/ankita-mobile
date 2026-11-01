import type { MEMORY_CATEGORIES, TASK_STATUSES, LIBRARY_KINDS, TOOL_POLICIES, TOOL_STATUSES } from './config.ts';
import type { OutputArtifact } from './outputs.ts';

export type MemorySource = { kind: 'user' | 'manual'; conversationId: string; messageId: string; quote: string };
export type MemoryInput = { text: string; category: typeof MEMORY_CATEGORIES[number]; source: MemorySource; pinned: boolean };
export type Memory = MemoryInput & { id: string; createdAt: number; updatedAt: number };
export type TaskInput = { id?: string; title: string; notes: string; status: typeof TASK_STATUSES[number]; dueAt: number | null; notificationId?: string | null };
export type Task = TaskInput & { id: string; notificationId: string | null; createdAt: number; updatedAt: number };
export type LibraryAsset = { name: string; mimeType: 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string; bytes: number; ref?: string };
export type LibraryInput = { id?: string; title: string; content: string; kind: typeof LIBRARY_KINDS[number]; sourceUrl?: string; mimeType?: string; asset?: LibraryAsset };
export type LibraryItem = LibraryInput & { id: string; createdAt: number; updatedAt: number };
export type MemoryProposal = { id: string; text: string; category: MemoryInput['category']; source: MemorySource; createdAt: number };
export type ToolPolicy = typeof TOOL_POLICIES[number];
export type ToolReceipt = { id: string; name: string; title: string; status: typeof TOOL_STATUSES[number]; arguments: string; result: string; startedAt: number; finishedAt?: number };
export type DesktopLink = {
  enabled: boolean; baseUrl: string;
  name?: string; deviceId?: string; deviceName?: string; teammateName?: string; fingerprint?: string; pairedAt?: number;
};
export type AssistantState = {
  memories: Memory[]; tasks: Task[]; library: LibraryItem[]; proposals: MemoryProposal[]; artifacts: OutputArtifact[];
  preferences: { toolsEnabled: boolean; suggestMemories: boolean };
  toolPolicies: Record<string, ToolPolicy>;
  webSearch: { kind: 'none' | 'brave' | 'searxng'; baseUrl: string };
  desktop: DesktopLink;
};
export type RecordClock = { id: () => string; now: () => number };
export type RecordChange<T> = { state: AssistantState; record: T };
