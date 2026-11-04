import { Badge, type Tone } from "@/components/ui";
import { titleCase } from "@/lib/format";
import type {
  EmployeeStatus,
  InvoiceStatus,
  OpsTaskStatus,
  RequestStatus,
  ShipmentStatus,
  StepStatus,
  AssetStatus,
  ClientStatus,
  DocumentStatus,
} from "@/lib/types";

const map: Record<string, { tone: Tone; label?: string }> = {
  // employees
  requested: { tone: "gray", label: "Hire requested" },
  estimate_sent: { tone: "blue", label: "Estimate sent" },
  estimate_approved: { tone: "blue", label: "Estimate approved" },
  offer_pending: { tone: "amber", label: "Offer pending" },
  contract_sent: { tone: "amber", label: "Contract sent" },
  active: { tone: "green", label: "Active" },
  offboarding: { tone: "amber" },
  exited: { tone: "gray" },
  withdrawn: { tone: "gray" },
  // invoices
  draft: { tone: "gray" },
  sent: { tone: "amber", label: "Due" },
  paid: { tone: "green" },
  overdue: { tone: "red" },
  void: { tone: "gray" },
  // requests
  open: { tone: "gray", label: "In review" },
  quoted: { tone: "amber", label: "Awaiting your approval" },
  approved: { tone: "green" },
  rejected: { tone: "red" },
  in_progress: { tone: "blue", label: "In progress" },
  fulfilled: { tone: "gray" },
  cancelled: { tone: "gray" },
  // shipments
  ordered: { tone: "gray" },
  packed: { tone: "gray" },
  picked_up: { tone: "blue", label: "Picked up" },
  in_transit: { tone: "blue", label: "In transit" },
  out_for_delivery: { tone: "blue", label: "Out for delivery" },
  delivered: { tone: "green" },
  returned: { tone: "gray" },
  lost: { tone: "red" },
  // steps / tasks
  pending: { tone: "gray" },
  done: { tone: "green" },
  blocked: { tone: "amber", label: "Blocked" },
  // assets
  issued: { tone: "green" },
  retired: { tone: "gray" },
  // clients
  onboarding: { tone: "blue" },
  suspended: { tone: "red" },
  closed: { tone: "gray" },
  // approvals
  synced: { tone: "green", label: "Applied" },
  // documents
  uploaded: { tone: "amber", label: "Awaiting verification" },
  verified: { tone: "green" },
};

type AnyStatus =
  | EmployeeStatus | InvoiceStatus | OpsTaskStatus | RequestStatus | ShipmentStatus
  | StepStatus | AssetStatus | ClientStatus | DocumentStatus;

export function StatusBadge({ status, label }: { status: AnyStatus | string; label?: string }) {
  const m = map[status] ?? { tone: "gray" as Tone };
  return <Badge tone={m.tone}>{label ?? m.label ?? titleCase(status)}</Badge>;
}
