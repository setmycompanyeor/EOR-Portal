"use client";

import { useActionState, useState } from "react";
import { useCloseOnSuccess } from "@/components/slide-over";
import { addShipmentEvent, createShipment, type ActionState } from "../actions";

const stages = ["ordered", "packed", "picked_up", "in_transit", "out_for_delivery", "delivered", "returned", "lost"];

export function ShipmentEventForm({ shipmentId, clientId, current }: { shipmentId: string; clientId: string; current: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addShipmentEvent, {});
  const next = stages[Math.min(stages.indexOf(current) + 1, 5)] ?? "delivered";
  return (
    <form action={action} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-6">
      <input type="hidden" name="shipment_id" value={shipmentId} />
      <input type="hidden" name="client_id" value={clientId} />
      <select className="input" name="status" defaultValue={next} aria-label="New status">
        {stages.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <input className="input" name="location" placeholder="Location" aria-label="Location" />
      <input className="input" name="courier" placeholder="Courier" aria-label="Courier" />
      <input className="input" name="awb" placeholder="AWB" aria-label="AWB" />
      <input className="input" name="tracking_url" placeholder="Tracking URL" aria-label="Tracking URL" />
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "…" : "Post update"}
      </button>
      <p aria-live="polite" className={`col-span-full min-h-4 text-[12px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
    </form>
  );
}

type Req = { id: string; title: string; client_id: string; employee_id: string | null; employee: string | null };

export function NewShipmentForm({ clients, requests, presetRequest, presetClient }: { clients: { id: string; name: string }[]; requests: Req[]; presetRequest?: string; presetClient?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createShipment, {});
  useCloseOnSuccess(state);
  const [reqId, setReqId] = useState(presetRequest ?? "");
  const [clientSel, setClientSel] = useState(presetClient ?? clients[0]?.id ?? "");
  const req = requests.find((r) => r.id === reqId);
  const clientId = req?.client_id ?? clientSel;
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="label">
        From approved request
        <select className="input" name="request_id" value={reqId} onChange={(e) => setReqId(e.target.value)}>
          <option value="">None (ad hoc)</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} {r.employee ? `· ${r.employee}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="label">
        Client
        <select className="input" name="client_id" value={clientId} onChange={(e) => setClientSel(e.target.value)} disabled={!!req}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {req && <input type="hidden" name="client_id" value={clientId} />}
      <input type="hidden" name="employee_id" value={req?.employee_id ?? ""} />
      <label className="label">
        Title
        <input className="input" name="title" defaultValue={req?.title ?? ""} key={req?.id ?? "none"} placeholder="e.g. Laptop for Kavya Reddy" required />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <input className="input" name="courier" placeholder="Courier" aria-label="Courier" />
        <input className="input" name="awb" placeholder="AWB" aria-label="AWB" />
        <input className="input" name="expected_date" type="date" aria-label="Expected date" />
        <input className="input" name="tracking_url" placeholder="Tracking URL" aria-label="Tracking URL" />
      </div>
      <input className="input" name="deliver_to" placeholder="Deliver to (name, address)" aria-label="Deliver to" />
      <div className="mt-1 text-[13px] font-medium text-[#3a4150]">Asset (optional)</div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input" name="asset_tag" placeholder="Tag, e.g. BL-LAP-0004" aria-label="Asset tag" />
        <select className="input" name="asset_kind" defaultValue="laptop" aria-label="Asset kind">
          {["laptop", "monitor", "phone", "accessory", "other"].map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input className="input" name="asset_model" placeholder="Model" aria-label="Asset model" />
        <input className="input" name="asset_serial" placeholder="Serial" aria-label="Asset serial" />
      </div>
      <p aria-live="polite" className={`min-h-5 text-[13px] ${state.error ? "text-red-ink" : "text-green-ink"}`}>
        {state.error ?? state.message}
      </p>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create shipment"}
      </button>
    </form>
  );
}
