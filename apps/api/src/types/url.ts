/** One row of the `urls` table, mapped to camelCase. */
export interface UrlRecord {
  /** BIGSERIAL primary key. Internal only — never exposed as the short code. */
  id: number;
  shortCode: string;
  originalUrl: string;
  /** NULL when the row uses a generated code; set for custom aliases (M6). */
  customAlias: string | null;
  /** Owner. NULL for anonymous creates and pre-account legacy rows. */
  userId: string | null;
  /** Guest owner for anonymous creates. Meaningful only while userId is NULL. */
  guestId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** NULL means "never expires". Expiry is checked lazily at redirect time. */
  expiresAt: Date | null;
  /** Soft-delete flag. Rows are deactivated, never hard-deleted. */
  isActive: boolean;
}

/** Input for {@link UrlRepository.create}. Nullable, never optional-ish. */
export interface CreateUrlInput {
  shortCode: string;
  originalUrl: string;
  customAlias: string | null;
  expiresAt: Date | null;
  /** Owner. Account id for signed-in creates, NULL for anonymous ones. */
  userId: string | null;
  /** Guest anchor for anonymous creates, NULL for account-owned rows. */
  guestId: string | null;
}

/** Patch for {@link UrlRepository.update}. `undefined` means "leave unchanged". */
export interface UpdateUrlPatch {
  originalUrl?: string | undefined;
  expiresAt?: Date | null | undefined;
  isActive?: boolean | undefined;
}
