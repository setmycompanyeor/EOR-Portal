import { Suspense } from "react";
import { Badge, Card, Empty, PageHeader, Skeleton, Table } from "@/components/ui";
import { ActionButton } from "@/components/action-controls";
import { requireOps } from "@/lib/auth";
import { getTemplates } from "@/lib/data/letters";
import { getClientsOverview } from "@/lib/data/ops";
import { formatDate, titleCase } from "@/lib/format";
import { AUTO_PLACEHOLDERS } from "@/lib/letters";
import { setTemplateActive } from "@/app/letters/actions";
import { UploadTemplateForm } from "./upload-form";

export const metadata = { title: "Letter templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Letter templates" subtitle="Word documents with {{placeholders}}. A client-specific template wins over the standard one." />
      <Suspense fallback={<Skeleton rows={2} />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { profile } = await requireOps();
  const [templates, clients] = await Promise.all([getTemplates(), getClientsOverview()]);
  const admin = profile.role === "ops_admin";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2" title="Templates">
        {templates.length === 0 ? (
          <Empty>No templates yet.</Empty>
        ) : (
          <Table head={["Template", "Type", "Scope", "Placeholders", "Added", ""]}>
            {templates.map((t) => (
              <tr key={t.id} className={t.active ? "" : "opacity-60"}>
                <td className="td font-medium">{t.name}</td>
                <td className="td">{titleCase(t.kind)}</td>
                <td className="td">{t.clients?.name ?? <Badge tone="blue">Standard</Badge>}</td>
                <td className="td text-[12px] text-ink-muted">{t.placeholders.join(", ")}</td>
                <td className="td">{formatDate(t.created_at)}</td>
                <td className="td">
                  {admin && (
                    <ActionButton
                      action={async () => {
                        "use server";
                        await setTemplateActive(t.id, !t.active);
                      }}
                    >
                      {t.active ? "Disable" : "Enable"}
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <div className="flex flex-col gap-4">
        <Card title="Upload a template">
          {admin ? <UploadTemplateForm clients={clients.map((c) => ({ id: c.id, name: c.name }))} /> : <p className="text-sm text-ink-muted">Only EOR admins can add templates.</p>}
        </Card>
        <Card title="Placeholders you can use">
          <p className="mb-2 text-[13px] text-ink-muted">
            Write them as {"{{name}}"} in Word. These are filled automatically (still editable); any other name becomes a field in the form.{" "}
            <a href="/templates/sample-offer-letter.docx" download>
              Download a sample template
            </a>
            .
          </p>
          <ul className="grid grid-cols-1 gap-1 text-[13px]">
            {Object.entries(AUTO_PLACEHOLDERS).map(([k, v]) => (
              <li key={k}>
                <code className="rounded bg-canvas px-1">{`{{${k}}}`}</code> <span className="text-ink-muted">{v}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-muted">
            Salary: <code className="rounded bg-canvas px-1">{"{{basic_monthly}}"}</code>, <code className="rounded bg-canvas px-1">{"{{hra_annual}}"}</code>, <code className="rounded bg-canvas px-1">{"{{flexible_benefits_monthly}}"}</code>, <code className="rounded bg-canvas px-1">{"{{employer_pf_annual}}"}</code>, <code className="rounded bg-canvas px-1">{"{{ctc_annual}}"}</code>, <code className="rounded bg-canvas px-1">{"{{ctc_annual_words}}"}</code>. For a table, put one row with <code className="rounded bg-canvas px-1">{"{{#salary}}{{component}}"}</code> · <code className="rounded bg-canvas px-1">{"{{monthly}}"}</code> · <code className="rounded bg-canvas px-1">{"{{annual}}{{/salary}}"}</code> and it expands to one row per component.
          </p>
        </Card>
      </div>
    </div>
  );
}
