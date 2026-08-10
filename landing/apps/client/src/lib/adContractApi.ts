// Ad contract acceptance page (/apply?token=) — standalone fetch client.
// Deliberately independent from lib/api.ts / lib/api-base.ts (those wire up
// the unrelated, unconnected third-party-google-auth boilerplate). This talks
// directly to the BFF's public ad-contract endpoints, no auth involved.

const BFF_PUBLIC_BASE_URL = (
  import.meta.env.VITE_BFF_PUBLIC_BASE_URL ?? "https://saigon.doil.me"
).replace(/\/+$/, "");

export interface AdContractInfo {
  tier_name: string;
  monthly_price_vnd: number;
  partner_name: string;
  already_accepted: boolean;
  contract_text_version: string;
}

export interface AdContractAcceptResult {
  accepted_at: string;
  bank_transfer_info: string;
}

export class AdContractNotFoundError extends Error {}

function contractUrl(token: string) {
  return `${BFF_PUBLIC_BASE_URL}/api/bff/public/ad-contract/${encodeURIComponent(token)}`;
}

export async function fetchAdContract(token: string): Promise<AdContractInfo> {
  const response = await fetch(contractUrl(token));
  if (response.status === 404) {
    throw new AdContractNotFoundError("Ad contract not found");
  }
  if (!response.ok) {
    throw new Error(`Ad contract fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function acceptAdContract(token: string, signerName: string): Promise<AdContractAcceptResult> {
  const response = await fetch(`${contractUrl(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signer_name: signerName }),
  });
  if (!response.ok) {
    throw new Error(`Ad contract accept failed: ${response.status}`);
  }
  return response.json();
}
