"use client";

import { formatMon, hasSigned, shortAddress } from "@/lib/safe";
import SafeWalletService from "@/lib/SafeWalletService";
import type {
  CreateTransactionProps,
  Eip1193Provider,
} from "@safe-global/protocol-kit";
import {
  OperationType,
  type SafeMultisigTransactionResponse,
} from "@safe-global/types-kit";
import { getAddress, parseEther } from "ethers";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type TxActionState = {
  safeTxHash: string;
  action: "approve" | "reject" | "execute";
} | null;

type EventfulEip1193Provider = Eip1193Provider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};

export default function Home() {
  const [chainId] = useState("143");

  const [account, setAccount] = useState("");
  const [connectError, setConnectError] = useState("");

  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [generatedSafeTxHash, setGeneratedSafeTxHash] = useState("");

  const [transactions, setTransactions] = useState<
    SafeMultisigTransactionResponse[]
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionState, setActionState] = useState<TxActionState>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const visibleTransactions = useMemo(() => transactions, [transactions]);

  const getInjectedProvider = useCallback(() => {
    if (typeof window === "undefined" || !window.haha) {
      throw new Error(
        "window.haha provider not found. Please install/enable your wallet.",
      );
    }

    return window.haha as Eip1193Provider;
  }, []);

  const connectWallet = useCallback(async () => {
    setConnectError("");

    try {
      const injectedProvider = getInjectedProvider();

      const accounts = (await injectedProvider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chain = (await injectedProvider.request({
        method: "eth_chainId",
      })) as string;

      if (!accounts?.[0]) {
        throw new Error("No account returned from wallet.");
      }

      setAccount(getAddress(accounts[0]));
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to connect wallet.",
      );
    }
  }, [getInjectedProvider]);

  const clearWalletState = useCallback(() => {
    setAccount("");
    setConnectError("");
    setGeneratedSafeTxHash("");
    setSuccess("");
    setTransactions([]);
  }, []);

  const disconnectWallet = useCallback(async () => {
    setConnectError("");
    try {
      const injectedProvider = getInjectedProvider();

      try {
        await injectedProvider.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {
        await injectedProvider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      }
    } catch (e) {
      setConnectError(
        e instanceof Error ? e.message : "Failed to disconnect wallet.",
      );
    } finally {
      clearWalletState();
    }
  }, [clearWalletState, getInjectedProvider]);

  const handleAccountsChanged = useCallback(
    (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0 || !accounts[0]) {
        clearWalletState();
        return;
      }

      try {
        setAccount(getAddress(String(accounts[0])));
        setConnectError("");
      } catch {
        setConnectError("Received invalid account address from wallet.");
        clearWalletState();
      }
    },
    [clearWalletState],
  );

  const refreshTransactions = useCallback(async () => {
    setError("");
    setSuccess("");
    setIsRefreshing(true);
    try {
      const pending = await SafeWalletService.getPendingTransactions();
      setTransactions(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load transactions.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const proposeTransaction = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError("");
      setSuccess("");
      setGeneratedSafeTxHash("");
      setIsSubmitting(true);

      try {
        if (!toAddress || !amount) {
          throw new Error("To Address and Amount are required.");
        }

        const createTransactionProps: CreateTransactionProps = {
          transactions: [
            {
              to: toAddress,
              value: parseEther(amount).toString(),
              data: "0x",
              operation: OperationType.Call,
            },
          ],
        };

        const safeTxHash = await SafeWalletService.proposeTransaction(
          createTransactionProps,
        );

        setGeneratedSafeTxHash(safeTxHash);
        setSuccess("Transaction proposed to Safe Transaction Service.");
        await refreshTransactions();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to propose transaction.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [amount, refreshTransactions, toAddress],
  );

  const approveTransaction = useCallback(
    async (safeTxHash: string) => {
      setError("");
      setSuccess("");
      setActionState({ safeTxHash, action: "approve" });
      try {
        await SafeWalletService.approveTransaction(safeTxHash);
        setSuccess(`Approved transaction ${safeTxHash}.`);
        await refreshTransactions();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to approve transaction.",
        );
      } finally {
        setActionState(null);
      }
    },
    [refreshTransactions],
  );

  const rejectTransaction = useCallback(
    async (nonce: string) => {
      setError("");
      setSuccess("");
      setActionState({ safeTxHash: nonce, action: "reject" });
      try {
        await SafeWalletService.rejectTransaction(nonce);

        setSuccess(`Proposed rejection transaction for nonce ${nonce}.`);
        await refreshTransactions();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Failed to propose rejection transaction.",
        );
      } finally {
        setActionState(null);
      }
    },
    [refreshTransactions],
  );

  const executeTransaction = useCallback(
    async (tx: SafeMultisigTransactionResponse) => {
      setError("");
      setSuccess("");
      setActionState({ safeTxHash: tx.safeTxHash, action: "execute" });
      try {
        await SafeWalletService.executeTransaction(tx);
        setSuccess(`Executed transaction ${tx.safeTxHash}.`);
        await refreshTransactions();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to execute transaction.",
        );
      } finally {
        setActionState(null);
      }
    },
    [refreshTransactions],
  );

  useEffect(() => {
    connectWallet();
  }, [connectWallet]);

  useEffect(() => {
    if (account) {
      const connectedProvider = getInjectedProvider();
      SafeWalletService.initialize({
        provider: connectedProvider,
        signerAddress: account,
        chainId,
      })
        .then(() => {
          if (SafeWalletService.isOwner(account)) {
            refreshTransactions();
          } else {
            setTransactions([]);
            setError("You are not the owner of the Safe Wallet.");
          }
        })
        .catch((e) => {
          setError(
            e instanceof Error
              ? e.message
              : "Failed to initialize Safe Wallet Service.",
          );
        });
    }
  }, [account, chainId, getInjectedProvider, refreshTransactions]);

  useEffect(() => {
    let provider: EventfulEip1193Provider;

    try {
      provider = getInjectedProvider() as EventfulEip1193Provider;
    } catch {
      return;
    }

    if (!provider.on || !provider.removeListener) {
      return;
    }

    provider.on("accountsChanged", handleAccountsChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [getInjectedProvider, handleAccountsChanged]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-8">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-semibold">Safe Multi-Sig Demo (Monad)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Uses <code>window.haha</code>, Safe Protocol Kit, and Safe Transaction
          Service to test multi-sig transaction flow.
        </p>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-wrap items-center gap-3">
          {!account ? (
            <button
              type="button"
              onClick={connectWallet}
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              type="button"
              onClick={disconnectWallet}
              disabled={!account}
              className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Disconnect Wallet
            </button>
          )}
          <span className="text-sm text-slate-300">
            Account: <strong>{account ? shortAddress(account) : "-"}</strong>
          </span>
        </div>
        {connectError && (
          <p className="mt-3 text-sm text-red-400">{connectError}</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Send Transaction</h2>
        <form
          onSubmit={proposeTransaction}
          className="grid gap-4 md:grid-cols-3"
        >
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm text-slate-300">To Address</span>
            <input
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              placeholder="0x..."
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm text-slate-300">Amount (MON)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.1"
              className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </label>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
        {generatedSafeTxHash && (
          <p className="mt-3 break-all text-sm text-emerald-300">
            SafeTxHash: <code>{generatedSafeTxHash}</code>
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Pending Transactions</h2>
          <button
            type="button"
            onClick={refreshTransactions}
            className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600 disabled:opacity-60"
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-300">
                <th className="px-3 py-2">Nonce</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Amount (MON)</th>
                <th className="px-3 py-2">Confirmations</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={6}>
                    No pending Safe transactions found.
                  </td>
                </tr>
              )}
              {visibleTransactions.map((tx) => {
                const confirmations = tx.confirmations?.length ?? 0;
                const required = tx.confirmationsRequired;
                const thresholdReached = confirmations >= required;
                const alreadySigned = hasSigned(tx, account);
                const busy =
                  actionState &&
                  (actionState.safeTxHash === tx.safeTxHash ||
                    actionState.safeTxHash === tx.nonce);

                return (
                  <tr key={tx.safeTxHash} className="border-b border-slate-800">
                    <td className="px-3 py-2">{tx.nonce}</td>
                    <td className="px-3 py-2 font-mono">
                      {shortAddress(tx.to)}
                    </td>
                    <td className="px-3 py-2">{formatMon(tx.value)}</td>
                    <td className="px-3 py-2">
                      {confirmations}/{required}
                    </td>
                    <td className="px-3 py-2">
                      {thresholdReached ? (
                        <span className="text-emerald-300">
                          Threshold reached
                        </span>
                      ) : !tx.isExecuted && !alreadySigned ? (
                        <span className="text-amber-300">Needs approvals</span>
                      ) : (
                        <span className="text-emerald-600">Approved</span>
                      )}
                    </td>
                    <td className="space-x-2 px-3 py-2">
                      {!tx.isExecuted && !alreadySigned && (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs hover:bg-emerald-500 disabled:opacity-60"
                          onClick={() => approveTransaction(tx.safeTxHash)}
                        >
                          Approve
                        </button>
                      )}
                      {!tx.isExecuted && thresholdReached && (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          className="rounded bg-blue-600 px-2 py-1 text-xs hover:bg-blue-500 disabled:opacity-60"
                          onClick={() => executeTransaction(tx)}
                        >
                          Execute
                        </button>
                      )}
                      {!tx.isExecuted && (
                        <button
                          type="button"
                          disabled={Boolean(busy)}
                          className="rounded bg-rose-600 px-2 py-1 text-xs hover:bg-rose-500 disabled:opacity-60"
                          onClick={() => rejectTransaction(tx.nonce)}
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <p className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-300">
          {success}
        </p>
      )}
    </main>
  );
}
