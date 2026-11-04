import { Suspense } from "react";
import { Badge, Card, PageHeader, Row, Skeleton } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { getClient, getClientUsers } from "@/lib/data/portal";
import { titleCase } from "@/lib/format";
import { ClientProfileForm, InviteForm } from "./forms";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Billing details and who can access this portal." />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { clientId, profile } = await requireClient();
  const [client, users] = await Promise.all([getClient(clientId), getClientUsers(clientId)]);
  const admin = profile.role === "client_admin";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Billing profile">
        {client && <ClientProfileForm client={{ legal_name: client.legal_name ?? "", billing_address: client.billing_address ?? "", finance_email: client.finance_email ?? "" }} readOnly={!admin} />}
      </Card>
      <div className="flex flex-col gap-4">
        <Card title="Portal users">
          {users.map((u) => (
            <Row key={u.id}>
              <div>
                <div className="text-sm font-medium">
                  {u.full_name || u.email} {u.id === profile.id && <span className="text-ink-muted">(you)</span>}
                </div>
                <div className="text-[13px] text-ink-muted">{u.email}</div>
              </div>
              <Badge tone={u.role === "client_admin" ? "blue" : "gray"}>{titleCase(u.role.replace("client_", ""))}</Badge>
            </Row>
          ))}
        </Card>
        {admin && (
          <Card title="Invite a colleague">
            <InviteForm />
          </Card>
        )}
      </div>
    </div>
  );
}
