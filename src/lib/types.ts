// Hand-written row types matching supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once the CLI is set up.

export type UserRole = "client_admin" | "client_approver" | "client_viewer" | "ops_admin" | "ops_staff";
export type ClientStatus = "onboarding" | "active" | "suspended" | "closed";
export type StepStatus = "pending" | "in_progress" | "done" | "blocked";
export type DocumentStatus = "uploaded" | "verified" | "rejected";
export type EmployeeStatus =
  | "requested" | "estimate_sent" | "estimate_approved" | "offer_pending" | "contract_sent"
  | "active" | "offboarding" | "exited" | "withdrawn";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type InvoiceKind = "monthly" | "one_time" | "deposit";
export type RequestCategory = "equipment" | "benefit" | "salary_revision" | "learning" | "other";
export type RequestStatus = "open" | "quoted" | "approved" | "rejected" | "in_progress" | "fulfilled" | "cancelled";
export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "superseded";
export type ShipmentStatus = "ordered" | "packed" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "returned" | "lost";
export type AssetKind = "laptop" | "monitor" | "phone" | "accessory" | "other";
export type AssetStatus = "ordered" | "in_transit" | "issued" | "returned" | "retired";
export type OpsTaskType = "onboarding" | "quote" | "shipment" | "deposit" | "invoice" | "compliance" | "payroll" | "offboarding" | "other";
export type OpsTaskStatus = "open" | "in_progress" | "blocked" | "done";
export type DepositEntryKind = "received" | "refund" | "required_revised" | "adjustment";

export type Client = {
  id: string;
  name: string;
  legal_name: string | null;
  country: string;
  billing_address: string | null;
  invoice_currency: string;
  payment_terms_days: number;
  finance_email: string | null;
  status: ClientStatus;
  account_manager_id: string | null;
  zoho_contact_id: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  client_id: string | null;
  full_name: string;
  email: string;
  job_title: string | null;
  role: UserRole;
  created_at: string;
};

export type OnboardingStep = {
  id: string;
  client_id: string;
  key: string;
  label: string;
  sort: number;
  status: StepStatus;
  note: string | null;
  completed_at: string | null;
};

export type Document = {
  id: string;
  client_id: string;
  employee_id: string | null;
  kind: string;
  name: string;
  storage_path: string | null;
  size_bytes: number | null;
  status: DocumentStatus;
  uploaded_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
};

export type Employee = {
  id: string;
  client_id: string;
  full_name: string;
  email: string | null;
  job_title: string;
  location_city: string | null;
  location_state: string | null;
  employment_type: "permanent" | "fixed_term";
  probation_months: number;
  start_date: string | null;
  end_date: string | null;
  monthly_gross: number;
  status: EmployeeStatus;
  keka_employee_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type EmployeeTask = {
  id: string;
  employee_id: string;
  key: string;
  label: string;
  detail: string | null;
  owner: "client" | "ops" | "employee";
  sort: number;
  status: StepStatus;
  completed_at: string | null;
};

export type DepositEntry = {
  id: string;
  client_id: string;
  entry_date: string;
  kind: DepositEntryKind;
  amount: number;
  required_amount: number | null;
  reference: string | null;
  note: string | null;
  created_at: string;
};

export type DepositBalance = { client_id: string; held: number; required: number };

export type Invoice = {
  id: string;
  client_id: string;
  number: string;
  kind: InvoiceKind;
  period_start: string | null;
  period_end: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  gst: number;
  total: number;
  status: InvoiceStatus;
  paid_at: string | null;
  zoho_invoice_id: string | null;
  pdf_path: string | null;
  created_at: string;
};

export type InvoiceLine = { id: string; invoice_id: string; employee_id: string | null; description: string; amount: number; sort: number };

export type Request = {
  id: string;
  client_id: string;
  employee_id: string | null;
  number: number;
  category: RequestCategory;
  title: string;
  description: string | null;
  status: RequestStatus;
  raised_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export type Quote = {
  id: string;
  request_id: string;
  total: number;
  note: string | null;
  valid_until: string | null;
  status: QuoteStatus;
  created_by: string | null;
  created_at: string;
};

export type QuoteLine = { id: string; quote_id: string; label: string; amount: number; sort: number };

export type Asset = {
  id: string;
  client_id: string;
  tag: string;
  kind: AssetKind;
  model: string;
  serial: string | null;
  holder_employee_id: string | null;
  status: AssetStatus;
  purchase_cost: number | null;
  issued_at: string | null;
  returned_at: string | null;
  created_at: string;
};

export type Shipment = {
  id: string;
  client_id: string;
  request_id: string | null;
  employee_id: string | null;
  asset_id: string | null;
  title: string;
  courier: string | null;
  awb: string | null;
  tracking_url: string | null;
  deliver_to: string | null;
  status: ShipmentStatus;
  expected_date: string | null;
  delivered_at: string | null;
  created_at: string;
};

export type ShipmentEvent = { id: string; shipment_id: string; status: ShipmentStatus; note: string | null; location: string | null; occurred_at: string };

export type OpsTask = {
  id: string;
  client_id: string | null;
  type: OpsTaskType;
  title: string;
  detail: string | null;
  owner_id: string | null;
  due_date: string | null;
  status: OpsTaskStatus;
  link_table: string | null;
  link_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ComplianceFiling = {
  id: string;
  client_id: string | null;
  kind: string;
  period: string;
  due_date: string | null;
  filed_on: string | null;
  challan_path: string | null;
  note: string | null;
};

export type ApprovalKind = "leave" | "reimbursement";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "synced";

export type Approval = {
  id: string;
  client_id: string;
  employee_id: string;
  kind: ApprovalKind;
  title: string;
  detail: string | null;
  amount: number | null;
  from_date: string | null;
  to_date: string | null;
  leave_type: string | null;
  category: string | null;
  receipt_path: string | null;
  keka_reference: string | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  synced_by: string | null;
  synced_at: string | null;
  invoice_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type Activity = {
  id: number;
  client_id: string | null;
  actor_id: string | null;
  verb: string;
  subject_table: string | null;
  subject_id: string | null;
  summary: string;
  created_at: string;
};
