// ──────────────────────────────────────────────
// Modal: Confirm lorebook_update agent result
// ──────────────────────────────────────────────
//
// When the Lorebook Keeper agent has "Confirm before changes" enabled, its
// proposed entry creates/updates are NOT auto-persisted. Instead the server
// enriches the SSE result with existing entry content and this modal shows
// the user a before → after diff for each proposed change, just like the
// Card Evolution Auditor does for character cards.
import { useState } from "react";
import { BookOpen, Check, X, Loader2, AlertCircle, Plus, RefreshCw, Lock } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useAgentStore } from "../../stores/agent.store";
import { api } from "../../lib/api-client";
import type { LorebookEntryDiff } from "@marinara-engine/shared";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LorebookUpdateModal({ open, onClose }: Props) {
  const pending = useAgentStore((s) => s.pendingLorebookUpdates);
  const dismissPendingLorebookUpdate = useAgentStore((s) => s.dismissPendingLorebookUpdate);

  const entry = pending[0] ?? null;
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  if (!entry) return null;

  const closeAndAdvance = () => {
    dismissPendingLorebookUpdate(entry.id);
    setError(null);
    if (pending.length <= 1) {
      onClose();
    }
  };

  const handleApprove = async () => {
    if (!entry || entry.updates.length === 0) {
      closeAndAdvance();
      return;
    }

    setApplying(true);
    setError(null);

    try {
      // Build the updates payload — only include non-locked entries
      const applicableUpdates = entry.updates.filter((u) => !u.locked);
      if (applicableUpdates.length === 0) {
        closeAndAdvance();
        return;
      }

      const response = await api.post<{ success: boolean; error?: string }>(
        "/lorebooks/apply-agent-updates",
        {
          meta: entry.meta,
          updates: applicableUpdates.map((u) => ({
            action: u.action,
            entryName: u.entryName,
            content: u.content,
            keys: u.keys,
            tag: u.tag,
            reason: u.reason,
            existingEntryId: u.existingEntry?.id ?? null,
          })),
        },
      );

      if (!response.success) {
        setError(response.error ?? "Failed to apply lorebook updates");
        setApplying(false);
        return;
      }

      closeAndAdvance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply lorebook updates");
      setApplying(false);
    }
  };

  const handleReject = () => {
    closeAndAdvance();
  };

  const queueNote = pending.length > 1 ? ` (${pending.length - 1} more queued)` : "";

  return (
    <Modal open={open} onClose={closeAndAdvance} title="Review Lorebook Updates" width="max-w-2xl">
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-400/20">
            <BookOpen size="1.375rem" className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">
              {entry.meta.lorebookName ?? entry.meta.targetLorebookId ?? "Lorebook"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {entry.agentName} proposed {entry.updates.length}{" "}
              {entry.updates.length === 1 ? "change" : "changes"}
              {queueNote}
            </p>
          </div>
        </div>

        {/* Locked-only warning */}
        {entry.updates.every((u) => u.locked) && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--secondary)] p-2.5 text-xs text-[var(--muted-foreground)]">
            <AlertCircle size="0.75rem" className="shrink-0" />
            All proposed entries are locked. Reject to dismiss.
          </div>
        )}

        {/* Update entries */}
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {entry.updates.map((u, idx) => {
            const isCreate = u.action === "create";
            const isLocked = u.locked;
            return (
              <div
                key={idx}
                className={`flex flex-col gap-2 rounded-lg bg-[var(--secondary)] p-3 ring-1 ring-[var(--border)] ${
                  isLocked ? "opacity-50" : ""
                }`}
              >
                {/* Entry header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isCreate ? (
                      <Plus size="0.75rem" className="text-emerald-400" />
                    ) : (
                      <RefreshCw size="0.75rem" className="text-blue-400" />
                    )}
                    <span className="text-xs font-semibold text-[var(--foreground)]">{u.entryName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLocked && (
                      <span className="flex items-center gap-1 rounded-full bg-[var(--destructive)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--destructive)]">
                        <Lock size="0.5rem" />
                        locked
                      </span>
                    )}
                    {u.tag && (
                      <span className="rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--primary)]">
                        {u.tag}
                      </span>
                    )}
                  </div>
                </div>

                {u.reason && <p className="text-xs italic text-[var(--muted-foreground)]">{u.reason}</p>}

                {/* Before (only for updates) */}
                {!isCreate && u.existingEntry && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Current
                    </span>
                    <p className="whitespace-pre-wrap rounded-md bg-[var(--destructive)]/5 p-2 text-xs leading-relaxed text-[var(--foreground)]">
                      {u.existingEntry.content}
                    </p>
                    {u.existingEntry.keys.length > 0 && (
                      <p className="text-[10px] text-[var(--muted-foreground)]">
                        Keys: {u.existingEntry.keys.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {/* After (proposed) */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    {isCreate ? "New Entry" : "Proposed"}
                  </span>
                  <p className="whitespace-pre-wrap rounded-md bg-emerald-500/5 p-2 text-xs leading-relaxed text-[var(--foreground)]">
                    {u.content}
                  </p>
                  {u.keys.length > 0 && (
                    <p className="text-[10px] text-[var(--muted-foreground)]">
                      Keys: {u.keys.join(", ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--destructive)]/10 p-2.5 text-xs text-[var(--destructive)]">
            <AlertCircle size="0.75rem" className="shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={handleReject}
            disabled={applying}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] disabled:opacity-50"
          >
            <X size="0.75rem" />
            Reject
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={applying || entry.updates.every((u) => u.locked)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-medium text-[var(--primary-foreground)] transition-all hover:opacity-90 disabled:opacity-50"
          >
            {applying ? (
              <Loader2 size="0.75rem" className="animate-spin" />
            ) : (
              <Check size="0.75rem" />
            )}
            Approve
          </button>
        </div>
      </div>
    </Modal>
  );
}
