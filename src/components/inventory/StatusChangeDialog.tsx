import { useState } from "react";
import { api, ApiError } from "../../lib/api-client";
import { formatEnumLabel } from "../../lib/format";
import { VALID_VEHICLE_TRANSITIONS, vehicleDisplayName } from "../../lib/vehicle-helpers";
import { ConfirmDialog } from "../ConfirmDialog";
import { StatusBadge } from "../StatusBadge";
import type { Vehicle, VehicleStatus } from "../../types/vehicle";

interface StatusChangeDialogProps {
  vehicle: Vehicle;
  onClose: () => void;
  onChanged: () => void;
}

export function StatusChangeDialog({ vehicle, onClose, onChanged }: StatusChangeDialogProps) {
  const options = VALID_VEHICLE_TRANSITIONS[vehicle.status];
  const [newStatus, setNewStatus] = useState<VehicleStatus | "">(options[0] ?? "");
  const [reason, setReason] = useState("");

  if (options.length === 0) {
    return (
      <ConfirmDialog
        title="No status changes available"
        description={`${vehicleDisplayName(vehicle)} is ${formatEnumLabel(vehicle.status).toLowerCase()}, which has no further status transitions.`}
        confirmLabel="Close"
        onConfirm={onClose}
        onCancel={onClose}
      />
    );
  }

  async function handleConfirm() {
    if (!newStatus) return;
    try {
      await api.post(`/vehicles/${vehicle.id}/status`, { newStatus, reason: reason.trim() || undefined });
      onChanged();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : "Failed to change status");
    }
  }

  return (
    <ConfirmDialog
      title="Change vehicle status"
      description={`${vehicleDisplayName(vehicle)} (${vehicle.stockNumber})`}
      confirmLabel="Change Status"
      onConfirm={handleConfirm}
      onCancel={onClose}
      extraContent={
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <StatusBadge status={vehicle.status} />
            <span className="text-muted">→</span>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as VehicleStatus)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
            >
              {options.map((status) => (
                <option key={status} value={status}>
                  {formatEnumLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-ink">Reason (optional)</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-action focus:ring-1 focus:ring-action"
            />
          </label>
        </div>
      }
    />
  );
}
