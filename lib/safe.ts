import type { SafeMultisigTransactionResponse } from "@safe-global/types-kit";
import { formatEther } from "ethers";

export function shortAddress(address?: string | null) {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatMon(value: string) {
  try {
    return Number(formatEther(value)).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  } catch {
    return value;
  }
}

export function hasSigned(tx: SafeMultisigTransactionResponse, owner?: string) {
  if (!owner) return false;
  return (tx.confirmations ?? []).some(
    (c) => c.owner.toLowerCase() === owner.toLowerCase(),
  );
}
