export interface FileGitDates {
  createdAt?: string;
  createdCommit?: string;
  lastModified?: string;
  lastModifiedCommit?: string;
}

export interface GitDates extends FileGitDates {
  createdAt: string;
  lastModified: string;
}

export function getFileGitDates(filePath: string): FileGitDates;
export function getContentEntryGitDates(collection: string, entry: unknown): GitDates;

export function hasDistinctModification(dates: {
  createdAt: Date | string;
  createdCommit?: string;
  lastModified: Date | string;
  lastModifiedCommit?: string;
}): boolean;
