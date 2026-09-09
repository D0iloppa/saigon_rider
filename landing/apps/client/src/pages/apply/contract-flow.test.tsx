import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApplyPage from "./Index";
import PayReturnPage from "./PayReturn";

const { fetchAdContract, acceptAdContract, confirmCheckout } = vi.hoisted(() => ({
  fetchAdContract: vi.fn(),
  acceptAdContract: vi.fn(),
  confirmCheckout: vi.fn(),
}));

vi.mock("@/lib/adContractApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/adContractApi")>();
  return { ...original, fetchAdContract, acceptAdContract, confirmCheckout };
});

const contract = {
  status: "draft" as const,
  tier_name: "General",
  partner_name: "Test Shop",
  months: 1,
  amount_vnd: 199000,
  payment_code: "TEST",
  received_vnd: 0,
  due_at: null,
  bank: null,
  rails: [],
  period_start: null,
  period_end: null,
  contract_text: "SERVER CANONICAL CONTRACT TEXT",
  contract_text_version: "v2",
  contract_locale: "en" as const,
  contract_text_sha256: "presented-sha256",
  tier_price_options: {
    month_1_vnd: 199000,
    month_3_vnd: 539000,
    month_6_vnd: 999000,
    month_1_krw: 10900,
    month_3_krw: 28900,
    month_6_krw: 52900,
  },
  snapshot: null,
};

describe("ad contract presented-text flow", () => {
  beforeEach(() => {
    fetchAdContract.mockReset().mockResolvedValue(contract);
    acceptAdContract.mockReset().mockResolvedValue({ ...contract, status: "accepted" });
    confirmCheckout.mockReset();
  });

  afterEach(cleanup);

  it("renders server contract text and submits the exact presented version/hash/locale on click", async () => {
    render(<MemoryRouter initialEntries={["/apply?token=token-1"]}><ApplyPage /></MemoryRouter>);

    expect(await screen.findByText(contract.contract_text)).not.toBeNull();
    fireEvent.click(screen.getByLabelText("I agree to the terms above"));
    fireEvent.change(screen.getByLabelText("Signer's Name"), { target: { value: "Nguyen" } });
    fireEvent.click(screen.getByRole("button", { name: /Agree & Submit/ }));

    await waitFor(() => expect(acceptAdContract).toHaveBeenCalledWith(
      "token-1",
      1,
      "Nguyen",
      "en",
      { version: "v2", sha256: "presented-sha256", amountVnd: 199000, amountKrw: 10900 },
    ));
  });

  it("offers a controlled confirmation retry after a transient return failure", async () => {
    confirmCheckout.mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce({
      status: "active",
      approved: true,
    });
    render(
      <MemoryRouter initialEntries={["/apply/pay/return?token=token-1&paymentKey=pay-1&orderId=order-1&amount=10900"]}>
        <PayReturnPage />
      </MemoryRouter>,
    );

    const retry = await screen.findByRole("button", { name: "Retry confirmation" });
    expect(confirmCheckout).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    await waitFor(() => expect(confirmCheckout).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Payment complete. Your ad will go live shortly.")).not.toBeNull();
  });
});
