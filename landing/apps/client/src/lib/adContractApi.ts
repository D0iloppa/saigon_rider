// Ad contract acceptance page (/apply?token=) — standalone fetch client.
// Deliberately independent from lib/api.ts / lib/api-base.ts (those wire up
// the unrelated, unconnected third-party-google-auth boilerplate). This talks
// directly to the BFF's public ad-contract endpoints, no auth involved.
//
// Schema mirrors backend/app/routers/ad_contract.py (260907_toss_payment_rail_design.md
// §8 P2-7). `rails[]` is seam-C's RailOffer — each entry is either
// bank_transfer (instructions) or toss_card (checkout), never both, and `wired`
// tells the UI whether to render it at all.

const BFF_PUBLIC_BASE_URL = (
  import.meta.env.VITE_BFF_PUBLIC_BASE_URL ?? "https://saigon.doil.me"
).replace(/\/+$/, "");

export type ContractStatus =
  | "draft"
  | "accepted"
  | "awaiting_payment"
  | "partially_paid"
  | "paid"
  | "active"
  | "cancelled"
  | "refunded";

export interface BankInfo {
  name: string;
  account_no: string;
  holder: string;
}

export interface RailInstructions {
  name: string;
  account_no: string;
  holder: string;
  payment_code: string;
  due_at: string | null;
}

export interface RailCheckout {
  client_key: string;
  order_id: string;
  order_name: string;
  amount: { currency: string; value: number };
  success_url: string;
  fail_url: string;
  customer_name: string;
  stub: boolean;
}

export interface RailOffer {
  rail: "bank_transfer" | "toss_card" | string;
  wired: boolean;
  instructions: RailInstructions | null;
  checkout: RailCheckout | null;
}

export interface TierPriceOptions {
  month_1_vnd: number;
  month_3_vnd: number | null;
  month_6_vnd: number | null;
}

export interface AdContractInfo {
  status: ContractStatus;
  tier_name: string;
  partner_name: string;
  months: number;
  amount_vnd: number;
  payment_code: string;
  received_vnd: number;
  due_at: string | null;
  bank: BankInfo | null;
  rails: RailOffer[];
  period_start: string | null;
  period_end: string | null;
  contract_text: string;
  contract_text_version: string;
  tier_price_options: TierPriceOptions;
  snapshot: Record<string, unknown> | null;
}

export interface CheckoutConfirmResult {
  status: ContractStatus;
  approved: boolean;
}

export class AdContractNotFoundError extends Error {}
export class AdContractRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function contractUrl(token: string) {
  return `${BFF_PUBLIC_BASE_URL}/api/bff/public/ad-contract/${encodeURIComponent(token)}`;
}

async function throwForResponse(response: Response, fallbackMessage: string): Promise<never> {
  if (response.status === 404) {
    throw new AdContractNotFoundError("Ad contract not found");
  }
  let detail = fallbackMessage;
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {
    // ignore — non-JSON error body
  }
  throw new AdContractRequestError(response.status, detail);
}

export async function fetchAdContract(token: string): Promise<AdContractInfo> {
  const response = await fetch(contractUrl(token));
  if (!response.ok) {
    await throwForResponse(response, `Ad contract fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function acceptAdContract(
  token: string,
  months: 1 | 3 | 6,
  signerName: string
): Promise<AdContractInfo> {
  const response = await fetch(`${contractUrl(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ months, signer_name: signerName }),
  });
  if (!response.ok) {
    await throwForResponse(response, `Ad contract accept failed: ${response.status}`);
  }
  return response.json();
}

export async function confirmCheckout(
  token: string,
  params: { paymentKey: string; orderId: string; amount: number }
): Promise<CheckoutConfirmResult> {
  const response = await fetch(`${contractUrl(token)}/checkout/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    await throwForResponse(response, `Checkout confirm failed: ${response.status}`);
  }
  return response.json();
}
