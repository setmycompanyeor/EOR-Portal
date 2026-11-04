/**
 * Seeds demo data into a Supabase project: four users, four clients, employees,
 * deposits, invoices, requests with quotes, shipments, assets and ops tasks.
 *
 *   npm run seed            # refuses to run if demo data already exists
 *   npm run seed -- --reset # deletes the demo users and clients first
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Demo sign-ins (all share the same password, below):
 *   priya@brightline.example   client_admin     (Brightline Software Inc.)
 *   daniel@brightline.example  client_approver  (Brightline Software Inc.)
 *   rohan@eorhub.example       ops_admin
 *   meera@eorhub.example       ops_staff
 */
import { createClient } from "@supabase/supabase-js";

const DEMO_PASSWORD = "Demo-Pass-2026!";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with: node --env-file=.env.local --import=tsx scripts/seed.ts)");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const reset = process.argv.includes("--reset");

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const ts = (offset: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  if (data === null) throw new Error(`${what}: no data returned`);
  return data;
}

async function main() {
  const demoEmails = ["priya@brightline.example", "daniel@brightline.example", "rohan@eorhub.example", "meera@eorhub.example"];
  const { data: existing } = await sb.from("clients").select("id, name").eq("name", "Brightline Software Inc.");
  if (existing && existing.length > 0) {
    if (!reset) {
      console.error("Demo data already exists. Re-run with --reset to replace it.");
      process.exit(1);
    }
    console.log("Removing existing demo data…");
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? []) if (u.email && demoEmails.includes(u.email)) await sb.auth.admin.deleteUser(u.id);
    await sb.from("clients").delete().in("name", ["Brightline Software Inc.", "Helix Robotics GmbH", "Marigold Health Ltd", "Cobalt Ventures Pte"]);
    await sb.from("ops_tasks").delete().is("client_id", null);
  }

  // Clients -----------------------------------------------------------------
  const clients = await must(
    sb
      .from("clients")
      .insert([
        { name: "Brightline Software Inc.", legal_name: "Brightline Software Inc.", country: "USA", billing_address: "548 Market St, San Francisco, CA 94104, USA", finance_email: "finance@brightline.example", status: "active", created_at: ts(-116) },
        { name: "Helix Robotics GmbH", legal_name: "Helix Robotics GmbH", country: "Germany", billing_address: "Torstraße 12, 10119 Berlin", status: "active", created_at: ts(-200) },
        { name: "Marigold Health Ltd", legal_name: "Marigold Health Limited", country: "UK", billing_address: "20 Farringdon Rd, London EC1M 3HE", status: "active", created_at: ts(-90) },
        { name: "Cobalt Ventures Pte", legal_name: "Cobalt Ventures Pte. Ltd.", country: "Singapore", status: "onboarding", created_at: ts(-6) },
      ])
      .select("id, name"),
    "clients",
  );
  const byName = Object.fromEntries(clients.map((c) => [c.name, c.id]));
  const BL = byName["Brightline Software Inc."];
  const HX = byName["Helix Robotics GmbH"];
  const MG = byName["Marigold Health Ltd"];
  const CB = byName["Cobalt Ventures Pte"];

  // Users (profiles are created by the on_auth_user_created trigger) ---------
  async function user(email: string, full_name: string, role: string, client_id: string | null, job_title: string) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name, role, client_id: client_id ?? "" } });
    if (error) throw new Error(`user ${email}: ${error.message}`);
    await sb.from("profiles").update({ job_title }).eq("id", data.user.id);
    return data.user.id;
  }
  const priya = await user("priya@brightline.example", "Priya Nair", "client_admin", BL, "HR Lead");
  const daniel = await user("daniel@brightline.example", "Daniel Okafor", "client_approver", BL, "CFO");
  const rohan = await user("rohan@eorhub.example", "Rohan Desai", "ops_admin", null, "Account Manager");
  const meera = await user("meera@eorhub.example", "Meera Joshi", "ops_staff", null, "Operations");
  await sb.from("clients").update({ account_manager_id: rohan }).in("id", [BL, HX]);
  await sb.from("clients").update({ account_manager_id: meera }).in("id", [MG, CB]);

  // Onboarding steps ---------------------------------------------------------
  const stepDefs = [
    ["account_created", "Account created", 1],
    ["kyc", "Company KYC", 2],
    ["agreements", "MSA & DPA signed", 3],
    ["deposit", "Initial deposit", 4],
    ["first_hire", "First hire", 5],
  ] as const;
  const steps: Record<string, unknown>[] = [];
  for (const [cid, doneUpTo, note] of [
    [BL, 5, null],
    [HX, 5, null],
    [MG, 5, null],
    [CB, 1, "ACRA extract and director ID uploaded, verification pending"],
  ] as const) {
    stepDefs.forEach(([key, label, sort], i) => {
      const done = i < doneUpTo;
      steps.push({ client_id: cid, key, label, sort, status: done ? "done" : i === doneUpTo ? "in_progress" : "pending", completed_at: done ? ts(-110 + i * 4) : null, note: i === doneUpTo ? note : null });
    });
  }
  await must(sb.from("client_onboarding_steps").insert(steps), "steps");

  // Documents ----------------------------------------------------------------
  await must(
    sb.from("documents").insert([
      { client_id: BL, kind: "incorporation", name: "brightline-coi.pdf", size_bytes: 1_250_000, status: "verified", uploaded_by: priya, verified_by: rohan, verified_at: ts(-112), created_at: ts(-114) },
      { client_id: BL, kind: "board_resolution", name: "board-resolution.pdf", size_bytes: 400_000, status: "verified", uploaded_by: priya, verified_by: rohan, verified_at: ts(-112), created_at: ts(-114) },
      { client_id: BL, kind: "signatory_id", name: "passport-daniel-okafor.pdf", size_bytes: 820_000, status: "verified", uploaded_by: priya, verified_by: rohan, verified_at: ts(-112), created_at: ts(-113) },
      { client_id: BL, kind: "tax_residency", name: "w9-brightline.pdf", size_bytes: 210_000, status: "verified", uploaded_by: priya, verified_by: rohan, verified_at: ts(-110), created_at: ts(-113) },
      { client_id: BL, kind: "msa", name: "MSA-Brightline-v2.1-signed.pdf", size_bytes: 980_000, status: "verified", verified_by: rohan, verified_at: ts(-107), created_at: ts(-107) },
      { client_id: BL, kind: "dpa", name: "DPA-Brightline-signed.pdf", size_bytes: 540_000, status: "verified", verified_by: rohan, verified_at: ts(-107), created_at: ts(-107) },
      { client_id: CB, kind: "incorporation", name: "acra-bizfile-cobalt.pdf", size_bytes: 600_000, status: "uploaded", created_at: ts(-1) },
      { client_id: CB, kind: "signatory_id", name: "nric-director.pdf", size_bytes: 300_000, status: "uploaded", created_at: ts(-1) },
    ]),
    "documents",
  );

  // Employees ----------------------------------------------------------------
  const employees = await must(
    sb
      .from("employees")
      .insert([
        { client_id: BL, full_name: "Arjun Mehta", email: "arjun@brightline.example", job_title: "Senior Backend Engineer", location_city: "Bengaluru", location_state: "Karnataka", start_date: day(-96), monthly_gross: 180000, status: "active", created_by: priya },
        { client_id: BL, full_name: "Sneha Iyer", email: "sneha@brightline.example", job_title: "Product Designer", location_city: "Pune", location_state: "Maharashtra", start_date: day(-51), monthly_gross: 140000, status: "active", created_by: priya },
        { client_id: BL, full_name: "Rahul Verma", email: "rahul@brightline.example", job_title: "QA Engineer", location_city: "Hyderabad", location_state: "Telangana", start_date: day(-35), monthly_gross: 95000, status: "active", created_by: priya },
        { client_id: BL, full_name: "Kavya Reddy", email: "kavya@brightline.example", job_title: "Data Analyst", location_city: "Hyderabad", location_state: "Telangana", start_date: day(12), monthly_gross: 110000, status: "offer_pending", created_by: priya, created_at: ts(-8) },
        { client_id: HX, full_name: "Tanvi Kulkarni", job_title: "Robotics Engineer", location_city: "Pune", location_state: "Maharashtra", start_date: day(-180), monthly_gross: 160000, status: "active" },
        { client_id: HX, full_name: "Vikram Singh", job_title: "Embedded Engineer", location_city: "Bengaluru", location_state: "Karnataka", start_date: day(-170), monthly_gross: 150000, status: "active" },
        { client_id: HX, full_name: "Neha Sharma", job_title: "Controls Engineer", location_city: "Bengaluru", location_state: "Karnataka", start_date: day(-150), monthly_gross: 145000, status: "active" },
        { client_id: HX, full_name: "Imran Khan", job_title: "ML Engineer", location_city: "Hyderabad", location_state: "Telangana", start_date: day(-120), monthly_gross: 170000, status: "active" },
        { client_id: HX, full_name: "Divya Menon", job_title: "Technical Writer", location_city: "Kochi", location_state: "Kerala", start_date: day(-60), monthly_gross: 85000, status: "active" },
        { client_id: MG, full_name: "Tom Adeyemi", job_title: "Clinical Data Engineer", location_city: "Chennai", location_state: "Tamil Nadu", start_date: day(7), monthly_gross: 130000, status: "contract_sent" },
        { client_id: MG, full_name: "Aisha Khan", job_title: "Product Manager", location_city: "Mumbai", location_state: "Maharashtra", start_date: day(12), monthly_gross: 190000, status: "estimate_approved" },
        { client_id: MG, full_name: "Karthik Rao", job_title: "Frontend Engineer", location_city: "Bengaluru", location_state: "Karnataka", start_date: day(-70), monthly_gross: 120000, status: "active" },
        { client_id: MG, full_name: "Pooja Desai", job_title: "Support Specialist", location_city: "Ahmedabad", location_state: "Gujarat", start_date: day(-45), monthly_gross: 60000, status: "active" },
        { client_id: MG, full_name: "Suresh Pillai", job_title: "DevOps Engineer", location_city: "Thiruvananthapuram", location_state: "Kerala", start_date: day(-40), monthly_gross: 140000, status: "active" },
      ])
      .select("id, full_name, client_id"),
    "employees",
  );
  const emp = Object.fromEntries(employees.map((e) => [e.full_name, e.id]));

  // Employee tasks (Kavya: 5 of 7 done) ---------------------------------------
  const taskDefs = [
    ["hire_requested", "Hire request submitted", "client", 1, null],
    ["estimate_approved", "Cost estimate approved", "client", 2, "₹1,47,631 per month all-in"],
    ["documents", "Candidate documents uploaded", "employee", 3, "Aadhaar, PAN, bank proof, UAN, education, last 3 payslips"],
    ["bgv", "Background verification", "ops", 4, "Education and employment checks"],
    ["offer_signoff", "Offer letter signed off", "client", 5, "Review and sign off the draft offer letter"],
    ["contract", "Employment contract e-signed by candidate", "ops", 6, "Sent after your sign-off"],
    ["equipment", "Equipment delivered before day one", "ops", 7, "Quote awaiting approval"],
  ] as const;
  const tasks: Record<string, unknown>[] = [];
  for (const [name, doneCount] of [
    ["Kavya Reddy", 4],
    ["Arjun Mehta", 7],
    ["Sneha Iyer", 7],
    ["Rahul Verma", 7],
    ["Tom Adeyemi", 5],
    ["Aisha Khan", 2],
  ] as const) {
    taskDefs.forEach(([key, label, owner, sort, detail], i) => {
      tasks.push({ employee_id: emp[name], key, label, owner, sort, detail, status: i < doneCount ? "done" : "pending", completed_at: i < doneCount ? ts(-8 + i) : null });
    });
  }
  await must(sb.from("employee_onboarding_tasks").insert(tasks), "employee tasks");
  await must(
    sb.from("documents").insert([
      { client_id: BL, employee_id: emp["Kavya Reddy"], kind: "employee_id", name: "aadhaar-kavya.pdf", size_bytes: 300_000, status: "verified", verified_by: meera, verified_at: ts(-4) },
      { client_id: BL, employee_id: emp["Kavya Reddy"], kind: "employee_pan", name: "pan-kavya.pdf", size_bytes: 200_000, status: "verified", verified_by: meera, verified_at: ts(-4) },
      { client_id: BL, employee_id: emp["Kavya Reddy"], kind: "employee_bank", name: "cancelled-cheque.pdf", size_bytes: 150_000, status: "uploaded" },
    ]),
    "employee documents",
  );

  // Deposits -----------------------------------------------------------------
  await must(
    sb.from("deposit_entries").insert([
      { client_id: BL, entry_date: day(-100), kind: "received", amount: 900000, reference: "BRT-7781", note: "Initial deposit received (wire)" },
      { client_id: BL, entry_date: day(-96), kind: "required_revised", amount: 0, required_amount: 426978, note: "Required amount set: 2 × ₹2,13,489" },
      { client_id: BL, entry_date: day(-51), kind: "required_revised", amount: 0, required_amount: 671404, note: "Revised after Sneha Iyer joined" },
      { client_id: BL, entry_date: day(-35), kind: "required_revised", amount: 0, required_amount: 960622, note: "Revised after Rahul Verma joined" },
      { client_id: BL, entry_date: day(-2), kind: "required_revised", amount: 0, required_amount: 971762, note: "Revised for this month; top-up of ₹71,762 requested" },
      { client_id: HX, entry_date: day(-195), kind: "received", amount: 1500000, reference: "HLX-0012", note: "Initial deposit received" },
      { client_id: HX, entry_date: day(-60), kind: "required_revised", amount: 0, required_amount: 1424880, note: "Revised after Divya Menon joined" },
      { client_id: MG, entry_date: day(-85), kind: "received", amount: 800000, reference: "MGH-2210", note: "Initial deposit received" },
      { client_id: MG, entry_date: day(-40), kind: "required_revised", amount: 0, required_amount: 792210, note: "Revised after Suresh Pillai joined" },
    ]),
    "deposits",
  );

  // Invoices -----------------------------------------------------------------
  const inv = await must(
    sb
      .from("invoices")
      .insert([
        { client_id: BL, number: "INV-2026-0013", kind: "monthly", period_start: day(-4).slice(0, 8) + "01", period_end: day(26), issue_date: day(-2), due_date: day(5), subtotal: 477781, gst: 8100, total: 485881, status: "sent" },
        { client_id: BL, number: "INV-2026-0012", kind: "monthly", period_start: day(-34).slice(0, 8) + "01", period_end: day(-4), issue_date: day(-33), due_date: day(-26), subtotal: 472211, gst: 8100, total: 480311, status: "paid", paid_at: day(-3) },
        { client_id: BL, number: "INV-2026-0011", kind: "monthly", period_start: day(-64).slice(0, 8) + "01", period_end: day(-34), issue_date: day(-63), due_date: day(-56), subtotal: 330302, gst: 5400, total: 335702, status: "paid", paid_at: day(-57) },
        { client_id: BL, number: "INV-2026-0009", kind: "monthly", period_start: day(-94).slice(0, 8) + "01", period_end: day(-64), issue_date: day(-93), due_date: day(-86), subtotal: 210789, gst: 2700, total: 213489, status: "paid", paid_at: day(-88) },
        { client_id: BL, number: "INV-2026-0007", kind: "one_time", issue_date: day(-54), due_date: day(-47), subtotal: 100500, gst: 1620, total: 102120, status: "paid", paid_at: day(-51) },
        { client_id: HX, number: "INV-2026-0010", kind: "monthly", period_start: day(-34).slice(0, 8) + "01", period_end: day(-4), issue_date: day(-33), due_date: day(-26), subtotal: 698940, gst: 13500, total: 712440, status: "paid", paid_at: day(-28) },
        { client_id: MG, number: "INV-2026-0014", kind: "monthly", period_start: day(-34).slice(0, 8) + "01", period_end: day(-4), issue_date: day(-33), due_date: day(-19), subtotal: 388005, gst: 8100, total: 396105, status: "overdue" },
      ])
      .select("id, number"),
    "invoices",
  );
  const inv13 = inv.find((i) => i.number === "INV-2026-0013")!.id;
  await must(
    sb.from("invoice_lines").insert([
      { invoice_id: inv13, employee_id: emp["Arjun Mehta"], description: "Arjun Mehta: gross salary", amount: 180000, sort: 1 },
      { invoice_id: inv13, employee_id: emp["Arjun Mehta"], description: "Arjun Mehta: employer PF, gratuity, insurance", amount: 6929, sort: 2 },
      { invoice_id: inv13, employee_id: emp["Sneha Iyer"], description: "Sneha Iyer: gross salary", amount: 140000, sort: 3 },
      { invoice_id: inv13, employee_id: emp["Sneha Iyer"], description: "Sneha Iyer: employer PF, gratuity, insurance", amount: 5967, sort: 4 },
      { invoice_id: inv13, employee_id: emp["Rahul Verma"], description: "Rahul Verma: gross salary", amount: 95000, sort: 5 },
      { invoice_id: inv13, employee_id: emp["Rahul Verma"], description: "Rahul Verma: employer PF, gratuity, insurance", amount: 4885, sort: 6 },
      { invoice_id: inv13, description: "Management fee, 3 employees", amount: 45000, sort: 7 },
    ]),
    "invoice lines",
  );

  // Requests, quotes ---------------------------------------------------------
  const reqs = await must(
    sb
      .from("requests")
      .insert([
        { client_id: BL, employee_id: emp["Kavya Reddy"], category: "equipment", title: "Laptop for new joiner", description: "Standard engineering laptop for Kavya, to be delivered to her Hyderabad address before her start date. Device stays on the EOR Hub asset register and is recovered on exit.", status: "quoted", raised_by: priya, created_at: ts(-8) },
        { client_id: BL, employee_id: emp["Sneha Iyer"], category: "benefit", title: "Add parental cover to health insurance", description: "Extend the group health policy to cover both parents of Sneha Iyer, sum insured ₹3 lakh, from the 1st of next month.", status: "open", raised_by: priya, created_at: ts(-6) },
        { client_id: BL, employee_id: emp["Arjun Mehta"], category: "equipment", title: '27" 4K monitor', description: "Dell U2723QE monitor shipped to Arjun Mehta, Bengaluru.", status: "in_progress", raised_by: priya, decided_by: daniel, decided_at: ts(-12), created_at: ts(-14) },
        { client_id: BL, category: "benefit", title: "Meal card for all employees", description: "Sodexo meal card, ₹2,200 per month per employee, tax-efficient under the Income-tax Rules.", status: "fulfilled", raised_by: priya, decided_by: daniel, decided_at: ts(-32), created_at: ts(-34) },
        { client_id: MG, employee_id: emp["Tom Adeyemi"], category: "equipment", title: "Laptop for Tom Adeyemi", description: "Windows laptop, 32 GB RAM, ship to Chennai before start.", status: "approved", decided_at: ts(-3), created_at: ts(-5) },
      ])
      .select("id, title"),
    "requests",
  );
  const rq = Object.fromEntries(reqs.map((r) => [r.title, r.id]));
  const quotes = await must(
    sb
      .from("quotes")
      .insert([
        { request_id: rq["Laptop for new joiner"], total: 114900, status: "sent", valid_until: day(10), created_by: meera, note: "Alternative: lease the same device at ₹4,200 per month for 36 months, billed with payroll. Ask for a requote if you prefer that.", created_at: ts(-2) },
        { request_id: rq['27" 4K monitor'], total: 53640, status: "approved", created_by: meera, created_at: ts(-13) },
        { request_id: rq["Meal card for all employees"], total: 6900, status: "approved", created_by: meera, created_at: ts(-33) },
        { request_id: rq["Laptop for Tom Adeyemi"], total: 98500, status: "approved", created_by: meera, created_at: ts(-4) },
      ])
      .select("id, request_id"),
    "quotes",
  );
  const q = (reqId: string) => quotes.find((x) => x.request_id === reqId)!.id;
  await must(
    sb.from("quote_lines").insert([
      { quote_id: q(rq["Laptop for new joiner"]), label: 'MacBook Air 13" M4, 16 GB / 512 GB, purchase', amount: 114900, sort: 1 },
      { quote_id: q(rq["Laptop for new joiner"]), label: "AppleCare+ 3 years", amount: 14900, sort: 2 },
      { quote_id: q(rq["Laptop for new joiner"]), label: "Asset tagging, MDM enrolment and insured courier", amount: 2500, sort: 3 },
      { quote_id: q(rq["Laptop for new joiner"]), label: "Less: bulk purchase discount", amount: -17400, sort: 4 },
      { quote_id: q(rq['27" 4K monitor']), label: 'Dell UltraSharp U2723QE 27" 4K', amount: 52990, sort: 1 },
      { quote_id: q(rq['27" 4K monitor']), label: "Insured courier", amount: 650, sort: 2 },
      { quote_id: q(rq["Meal card for all employees"]), label: "Monthly load, 3 employees", amount: 6600, sort: 1 },
      { quote_id: q(rq["Meal card for all employees"]), label: "Card issuance (one-time)", amount: 300, sort: 2 },
      { quote_id: q(rq["Laptop for Tom Adeyemi"]), label: "Dell Latitude 5550, 32 GB / 1 TB", amount: 96000, sort: 1 },
      { quote_id: q(rq["Laptop for Tom Adeyemi"]), label: "Insured courier", amount: 2500, sort: 2 },
    ]),
    "quote lines",
  );

  // Assets and shipments -----------------------------------------------------
  const assets = await must(
    sb
      .from("assets")
      .insert([
        { client_id: BL, tag: "BL-LAP-0001", kind: "laptop", model: 'MacBook Pro 14" M4', serial: "C02XK1A1", holder_employee_id: emp["Arjun Mehta"], status: "issued", issued_at: day(-95) },
        { client_id: BL, tag: "BL-LAP-0002", kind: "laptop", model: 'MacBook Air 13" M4', serial: "C02XK2B2", holder_employee_id: emp["Sneha Iyer"], status: "issued", issued_at: day(-53) },
        { client_id: BL, tag: "BL-LAP-0003", kind: "laptop", model: "Dell Latitude 5450", serial: "DL5450-7781", holder_employee_id: emp["Rahul Verma"], status: "issued", issued_at: day(-37) },
        { client_id: BL, tag: "BL-MON-0007", kind: "monitor", model: 'Dell U2723QE 27"', serial: "CN-0U27-23QE", holder_employee_id: emp["Arjun Mehta"], status: "in_transit" },
      ])
      .select("id, tag"),
    "assets",
  );
  const asset = (tag: string) => assets.find((a) => a.tag === tag)!.id;
  const ships = await must(
    sb
      .from("shipments")
      .insert([
        { client_id: BL, request_id: rq['27" 4K monitor'], employee_id: emp["Arjun Mehta"], asset_id: asset("BL-MON-0007"), title: 'Dell 27" 4K monitor to Arjun Mehta', courier: "Delhivery", awb: "2214 8873 0019", tracking_url: "https://www.delhivery.com/track/package/221488730019", deliver_to: "Arjun Mehta, Indiranagar, Bengaluru 560038", status: "out_for_delivery", expected_date: day(0), created_at: ts(-6) },
        { client_id: BL, employee_id: emp["Rahul Verma"], asset_id: asset("BL-LAP-0003"), title: "Laptop to Rahul Verma", courier: "Blue Dart", awb: "7781 2234 9900", status: "delivered", expected_date: day(-37), delivered_at: ts(-37, 15), created_at: ts(-42) },
        { client_id: BL, employee_id: emp["Sneha Iyer"], asset_id: asset("BL-LAP-0002"), title: "Laptop to Sneha Iyer", courier: "Delhivery", awb: "2214 1120 0456", status: "delivered", expected_date: day(-53), delivered_at: ts(-53, 12), created_at: ts(-58) },
      ])
      .select("id, title"),
    "shipments",
  );
  const monitorShip = ships.find((s) => s.title.startsWith("Dell 27"))!.id;
  await must(
    sb.from("shipment_events").insert([
      { shipment_id: monitorShip, status: "ordered", note: "Order placed with vendor", occurred_at: ts(-6, 11) },
      { shipment_id: monitorShip, status: "packed", note: "Asset tagged BL-MON-0007, serial recorded", occurred_at: ts(-4, 16) },
      { shipment_id: monitorShip, status: "picked_up", location: "Pune hub", occurred_at: ts(-3, 10) },
      { shipment_id: monitorShip, status: "in_transit", location: "Bengaluru gateway", occurred_at: ts(-2, 22) },
      { shipment_id: monitorShip, status: "out_for_delivery", note: "Delivery agent assigned", occurred_at: ts(0, 8) },
      ...ships.filter((s) => s.id !== monitorShip).flatMap((s) => [
        { shipment_id: s.id, status: "ordered", occurred_at: ts(-45, 10) },
        { shipment_id: s.id, status: "in_transit", occurred_at: ts(-40, 10) },
        { shipment_id: s.id, status: "delivered", occurred_at: ts(-37, 15) },
      ]),
    ]),
    "shipment events",
  );

  // Ops tasks ----------------------------------------------------------------
  await must(
    sb.from("ops_tasks").insert([
      { client_id: BL, type: "shipment", title: "Confirm delivery of REQ monitor to Arjun", detail: "Delhivery shows out for delivery; confirm receipt with Arjun", owner_id: meera, due_date: day(0), status: "in_progress", link_table: "requests", link_id: rq['27" 4K monitor'] },
      { client_id: BL, type: "deposit", title: "Chase deposit top-up ₹71,762", detail: "Requested two days ago; reminder email + WhatsApp to Daniel Okafor", owner_id: rohan, due_date: day(0), status: "open" },
      { client_id: BL, type: "onboarding", title: "Send offer letter for Kavya Reddy", detail: "Waiting on client sign-off; nudge Priya Nair", owner_id: rohan, due_date: day(0), status: "blocked", link_table: "employees", link_id: emp["Kavya Reddy"] },
      { client_id: BL, type: "quote", title: "Quote parental cover for Sneha Iyer", detail: "Awaiting insurer pricing", owner_id: meera, due_date: day(2), status: "open", link_table: "requests", link_id: rq["Add parental cover to health insurance"] },
      { client_id: CB, type: "onboarding", title: "Verify KYC documents", detail: "ACRA extract and director ID uploaded yesterday", owner_id: meera, due_date: day(0), status: "open" },
      { client_id: HX, type: "invoice", title: "Issue this month's invoice", detail: "Create in Zoho Books; 5 employees + meal cards", owner_id: rohan, due_date: day(-1), status: "open" },
      { client_id: MG, type: "shipment", title: "Order laptop for Tom Adeyemi", detail: "Quote approved; ship to Chennai before start", owner_id: meera, due_date: day(0), status: "open", link_table: "requests", link_id: rq["Laptop for Tom Adeyemi"] },
      { client_id: null, type: "compliance", title: "File PF ECR and ESI for last month", detail: "All clients; challans to be uploaded to portals", owner_id: rohan, due_date: day(10), status: "open" },
      { client_id: MG, type: "onboarding", title: "Draft employment contract, Aisha Khan", detail: "Start in 12 days; 6-month probation", owner_id: meera, due_date: day(-1), status: "open", link_table: "employees", link_id: emp["Aisha Khan"] },
      { client_id: MG, type: "invoice", title: "Chase overdue INV-2026-0014", detail: "₹3,96,105 overdue by 19 days", owner_id: meera, due_date: day(0), status: "open" },
    ]),
    "ops tasks",
  );

  // Activity -----------------------------------------------------------------
  await must(
    sb.from("activity_log").insert([
      { client_id: BL, actor_id: meera, verb: "shipment.event", summary: "Monitor for Arjun Mehta is out for delivery", created_at: ts(0, 8) },
      { client_id: BL, actor_id: rohan, verb: "invoice.paid", summary: "INV-2026-0012 for ₹4,80,311 marked paid", created_at: ts(-3, 9) },
      { client_id: BL, actor_id: rohan, verb: "compliance.filed", summary: "PF ECR and ESI filed for last month; challans available", created_at: ts(-20, 17) },
      { client_id: BL, actor_id: priya, verb: "request.raised", summary: "Raised request: Add parental cover to health insurance", created_at: ts(-6, 14) },
      { client_id: BL, actor_id: meera, verb: "quote.sent", summary: "Quote of ₹1,14,900 sent for Laptop for new joiner", created_at: ts(-2, 11) },
    ]),
    "activity",
  );

  console.log("Seeded. Sign in with the demo accounts listed at the top of scripts/seed.ts.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
