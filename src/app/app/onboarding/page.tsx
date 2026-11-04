import { Suspense } from "react";
import { Badge, Card, PageHeader, Row, Skeleton, Table, Empty, LinkButton } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { requireClient } from "@/lib/auth";
import { getClient, getClientDocuments, getClientUsers, getOnboardingSteps } from "@/lib/data/portal";
import { formatDate, titleCase } from "@/lib/format";
import { UploadDocument } from "./upload-document";

export const metadata = { title: "Client onboarding" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const { clientId, profile } = await requireClient();
  const [client, steps, documents, users] = await Promise.all([getClient(clientId), getOnboardingSteps(clientId), getClientDocuments(clientId), getClientUsers(clientId)]);
  const done = steps.filter((s) => s.status === "done").length;
  const canUpload = profile.role === "client_admin" || profile.role === "client_approver";

  return (
    <>
      <PageHeader
        title="Client onboarding"
        subtitle={`${client?.name} · started ${formatDate(client?.created_at)}`}
        actions={<Badge tone={done === steps.length && steps.length > 0 ? "green" : "amber"}>{done} of {steps.length} steps complete</Badge>}
      />

      <Card>
        <ol className="flex flex-wrap gap-y-4">
          {steps.map((s, i) => {
            const dot = s.status === "done" ? "bg-green-ink text-white" : s.status === "in_progress" ? "bg-brand text-white ring-4 ring-brand-soft" : s.status === "blocked" ? "bg-amber-ink text-white" : "bg-gray-soft text-ink-muted";
            const line = s.status === "done" ? "bg-green-ink" : s.status === "in_progress" ? "bg-[linear-gradient(90deg,#116b3a_50%,#e3e6ec_50%)]" : "bg-line";
            return (
              <li key={s.id} className="flex min-w-[160px] flex-1 flex-col gap-2 pr-3">
                <div className={`mt-3 h-[3px] rounded ${line}`} />
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${dot}`}>{i + 1}</span>
                  <div>
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-[13px] text-ink-muted">{s.status === "done" ? formatDate(s.completed_at) : s.note ?? titleCase(s.status)}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Company documents" action={canUpload && <UploadDocument />}>
          {documents.length === 0 ? (
            <Empty>No documents uploaded yet.</Empty>
          ) : (
            documents.map((d) => (
              <Row key={d.id}>
                <div>
                  <div className="text-sm font-medium">{d.name}</div>
                  <div className="text-[13px] text-ink-muted">
                    {titleCase(d.kind)} · {d.size_bytes ? `${(d.size_bytes / 1024 / 1024).toFixed(1)} MB · ` : ""}uploaded {formatDate(d.created_at)}
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </Row>
            ))
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Billing profile" action={<LinkButton href="/app/settings" small>Edit</LinkButton>}>
            <Table head={[]}>
              {[
                ["Billing entity", client?.legal_name ?? client?.name],
                ["Billing address", client?.billing_address ?? "—"],
                ["Invoice currency", client?.invoice_currency],
                ["Payment terms", `Net ${client?.payment_terms_days} from invoice date`],
                ["Finance contact", client?.finance_email ?? "—"],
                ["Zoho Books customer", client?.zoho_contact_id ? <Badge tone="blue">Linked</Badge> : <Badge tone="gray">Not linked</Badge>],
              ].map(([k, v], i) => (
                <tr key={i}>
                  <td className="td w-[42%] text-ink-muted">{k}</td>
                  <td className="td">{v}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Portal users" action={<LinkButton href="/app/settings" small>Manage</LinkButton>}>
            {users.map((u) => (
              <Row key={u.id}>
                <div>
                  <div className="text-sm font-medium">{u.full_name || u.email}</div>
                  <div className="text-[13px] text-ink-muted">
                    {u.job_title ? `${u.job_title} · ` : ""}
                    {titleCase(u.role.replace("client_", ""))}
                  </div>
                </div>
                <Badge tone="green">Active</Badge>
              </Row>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
