"use client";

import {
  confirmDepositIntentBatch,
  fetchDepositIntentAdminOverview,
  generateDepositIntentBatch,
  type DepositIntentAdminOverview,
  type GeneratedDepositIntentBatch,
} from "@/lib/deposit-intent";
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
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

type GeneratedBatchState = GeneratedDepositIntentBatch & {
  safeTxHashes: Record<string, string>;
  txHashes: Record<string, string>;
};

const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS || "";

function formatTimestamp(value?: number) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function formatDeadline(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString();
}

function getOrigin(tx: SafeMultisigTransactionResponse): string | undefined {
  const value = (tx as { origin?: unknown }).origin;
  return typeof value === "string" ? value : undefined;
}

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

  const [depositOverview, setDepositOverview] =
    useState<DepositIntentAdminOverview | null>(null);
  const [selectedIntentIds, setSelectedIntentIds] = useState<string[]>([]);
  const [activeBatch, setActiveBatch] = useState<GeneratedBatchState | null>(
    null,
  );
  const [isRefreshingDepositOverview, setIsRefreshingDepositOverview] =
    useState(false);
  const [isGeneratingDepositBatch, setIsGeneratingDepositBatch] =
    useState(false);
  const [isProposingDepositBatch, setIsProposingDepositBatch] = useState(false);
  const [isConfirmingDepositBatch, setIsConfirmingDepositBatch] =
    useState(false);

  const visibleTransactions = useMemo(() => transactions, [transactions]);

  const getInjectedProvider = useCallback(() => {
    if (typeof window === "undefined" || !window.haha) {
      throw new Error(
        "window.haha provider not found. Please install/enable your wallet.",
      );
    }

    return window.haha as Eip1193Provider;
  }, []);

  const clearWalletState = useCallback(() => {
    setAccount("");
    setConnectError("");
    setGeneratedSafeTxHash("");
    setSuccess("");
    setTransactions([]);
    setDepositOverview(null);
    setSelectedIntentIds([]);
    setActiveBatch(null);
  }, []);

  const connectWallet = useCallback(async () => {
    setConnectError("");

    try {
      const injectedProvider = getInjectedProvider();

      const accounts = (await injectedProvider.request({
        method: "eth_requestAccounts",
      })) as string[];

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

  const refreshDepositOverview = useCallback(async () => {
    setIsRefreshingDepositOverview(true);
    try {
      const overview = await fetchDepositIntentAdminOverview(undefined, 25);
      setDepositOverview(overview);
      setSelectedIntentIds((current) =>
        current.filter((intentId) =>
          overview.pendingIntents.some((intent) => intent.intentId === intentId),
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load deposit intent overview.",
      );
    } finally {
      setIsRefreshingDepositOverview(false);
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
        const executedTxHash = await SafeWalletService.executeTransaction(tx);
        setSuccess(
          executedTxHash
            ? `Executed transaction ${tx.safeTxHash} on-chain as ${executedTxHash}.`
            : `Executed transaction ${tx.safeTxHash}.`,
        );

        setActiveBatch((current) => {
          if (!current || !executedTxHash) {
            return current;
          }

          const matchingIntentId = Object.entries(current.safeTxHashes).find(
            ([, safeTxHash]) =>
              safeTxHash.toLowerCase() === tx.safeTxHash.toLowerCase(),
          )?.[0];

          if (!matchingIntentId) {
            return current;
          }

          return {
            ...current,
            txHashes: {
              ...current.txHashes,
              [matchingIntentId]: executedTxHash,
            },
          };
        });

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

  const generateDepositBatchAction = useCallback(async () => {
    setError("");
    setSuccess("");
    setIsGeneratingDepositBatch(true);

    try {
      const batch = await generateDepositIntentBatch({
        intentIds: selectedIntentIds.length > 0 ? selectedIntentIds : undefined,
        executorAddress: SAFE_ADDRESS || undefined,
      });

      const nextBatch: GeneratedBatchState = {
        ...batch,
        safeTxHashes: {},
        txHashes: Object.fromEntries(batch.intentIds.map((id) => [id, ""])),
      };

      setActiveBatch(nextBatch);
      setSuccess(
        `Generated deposit batch ${batch.batchId} with ${batch.intentCount} intent(s).`,
      );
      await refreshDepositOverview();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to generate deposit batch.",
      );
    } finally {
      setIsGeneratingDepositBatch(false);
    }
  }, [refreshDepositOverview, selectedIntentIds]);

  const proposeDepositBatchToSafe = useCallback(async () => {
    if (!activeBatch || !depositOverview) {
      setError("Generate a deposit batch before proposing it to the Safe.");
      return;
    }

    setError("");
    setSuccess("");
    setIsProposingDepositBatch(true);

    try {
      const nextSafeTxHashes: Record<string, string> = {
        ...activeBatch.safeTxHashes,
      };

      for (let index = 0; index < activeBatch.intentIds.length; index += 1) {
        const intentId = activeBatch.intentIds[index];
        if (nextSafeTxHashes[intentId]) {
          continue;
        }

        const safeTxHash = await SafeWalletService.proposeTransaction(
          {
            transactions: [
              {
                to: depositOverview.vaultState.vaultAddress,
                value: "0",
                data: activeBatch.calldatas[index],
                operation: OperationType.Call,
              },
            ],
          },
          `deposit-intent:${activeBatch.batchId}:${intentId}`,
        );

        nextSafeTxHashes[intentId] = safeTxHash;
      }

      setActiveBatch((current) =>
        current
          ? {
              ...current,
              safeTxHashes: nextSafeTxHashes,
            }
          : current,
      );

      setSuccess(
        `Proposed ${Object.keys(nextSafeTxHashes).length} deposit transaction(s) to the Safe.`,
      );
      await refreshTransactions();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to propose deposit transactions to the Safe.",
      );
    } finally {
      setIsProposingDepositBatch(false);
    }
  }, [activeBatch, depositOverview, refreshTransactions]);

  const confirmDepositBatchAction = useCallback(async () => {
    if (!activeBatch) {
      setError("No generated deposit batch to confirm.");
      return;
    }

    setError("");
    setSuccess("");
    setIsConfirmingDepositBatch(true);

    try {
      const results = activeBatch.intentIds.map((intentId) => ({
        intentId,
        txHash: activeBatch.txHashes[intentId]?.trim(),
      }));

      const missing = results.find((entry) => !entry.txHash);
      if (missing) {
        throw new Error(`Missing on-chain tx hash for intent ${missing.intentId}.`);
      }

      const invalid = results.find(
        (entry) => !/^0x[a-fA-F0-9]{64}$/.test(entry.txHash),
      );
      if (invalid) {
        throw new Error(`Invalid tx hash for intent ${invalid.intentId}.`);
      }

      const confirmation = await confirmDepositIntentBatch({
        batchId: activeBatch.batchId,
        results,
      });

      setSuccess(
        `Confirmed batch ${activeBatch.batchId}: ${confirmation.successCount} success, ${confirmation.failCount} failed.`,
      );
      setActiveBatch(null);
      await refreshDepositOverview();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to confirm deposit batch.",
      );
    } finally {
      setIsConfirmingDepositBatch(false);
    }
  }, [activeBatch, refreshDepositOverview]);

  useEffect(() => {
    connectWallet();
  }, [connectWallet]);

  useEffect(() => {
    if (!account) {
      return;
    }

    const connectedProvider = getInjectedProvider();
    SafeWalletService.initialize({
      provider: connectedProvider,
      signerAddress: account,
      chainId,
    })
      .then(async () => {
        const isOwner = await SafeWalletService.isOwner(account);

        if (isOwner) {
          await Promise.all([refreshTransactions(), refreshDepositOverview()]);
        } else {
          setTransactions([]);
          setDepositOverview(null);
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
  }, [
    account,
    chainId,
    getInjectedProvider,
    refreshDepositOverview,
    refreshTransactions,
  ]);

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
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-8">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-semibold">Safe Multi-Sig Admin (Monad)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Uses <code>window.haha</code>, Safe Protocol Kit, Safe Transaction
          Service, and the backend deposit-intent admin GraphQL surface.
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
          <span className="text-sm text-slate-300">
            Safe: <strong>{SAFE_ADDRESS ? shortAddress(SAFE_ADDRESS) : "-"}</strong>
          </span>
        </div>
        {connectError && (
          <p className="mt-3 text-sm text-red-400">{connectError}</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Deposit Intent Queue</h2>
            <p className="mt-1 text-sm text-slate-400">
              Generates one Safe proposal per intent so backend confirmation can
              verify each `depositWithPermit2` vault tx individually.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshDepositOverview}
            className="rounded bg-slate-700 px-3 py-2 text-sm hover:bg-slate-600 disabled:opacity-60"
            disabled={isRefreshingDepositOverview}
          >
            {isRefreshingDepositOverview ? "Refreshing..." : "Refresh Queue"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Gated
            </div>
            <div className="mt-2 text-lg font-semibold text-white">
              {depositOverview?.vaultState.depositsGated ? "Yes" : "No"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Capacity
            </div>
            <div className="mt-2 break-all text-sm text-white">
              {depositOverview?.vaultState.availableCapacity ?? "-"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Vault
            </div>
            <div className="mt-2 break-all font-mono text-xs text-white">
              {depositOverview?.vaultState.vaultAddress ?? "-"}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Execution mode
            </div>
            <div className="mt-2 text-lg font-semibold text-white">
              {depositOverview?.executionMode ?? "-"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={generateDepositBatchAction}
            className="rounded bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
            disabled={
              isGeneratingDepositBatch ||
              !depositOverview?.vaultState.depositsGated
            }
          >
            {isGeneratingDepositBatch ? "Generating..." : "Generate Deposit Batch"}
          </button>
          <button
            type="button"
            onClick={proposeDepositBatchToSafe}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            disabled={!activeBatch || isProposingDepositBatch}
          >
            {isProposingDepositBatch ? "Proposing..." : "Propose Batch To Safe"}
          </button>
          <button
            type="button"
            onClick={confirmDepositBatchAction}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            disabled={!activeBatch || isConfirmingDepositBatch}
          >
            {isConfirmingDepositBatch ? "Confirming..." : "Confirm Executed Batch"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Pending Deposit Intents</h2>
          <span className="text-sm text-slate-400">
            {depositOverview?.pendingIntents.length ?? 0} shown
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-slate-300">
                <th className="px-3 py-2">Pick</th>
                <th className="px-3 py-2">Depositor</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Nonce</th>
                <th className="px-3 py-2">Deadline</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {(depositOverview?.pendingIntents ?? []).length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={6}>
                    No pending deposit intents found.
                  </td>
                </tr>
              )}
              {(depositOverview?.pendingIntents ?? []).map((intent) => {
                const checked = selectedIntentIds.includes(intent.intentId);
                return (
                  <tr key={intent.intentId} className="border-b border-slate-800">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedIntentIds((current) =>
                            checked
                              ? current.filter((value) => value !== intent.intentId)
                              : [...current, intent.intentId],
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {shortAddress(intent.depositor)}
                    </td>
                    <td className="px-3 py-2">{intent.amount}</td>
                    <td className="px-3 py-2">{intent.nonce}</td>
                    <td className="px-3 py-2">{formatDeadline(intent.deadline)}</td>
                    <td className="px-3 py-2">
                      {formatTimestamp(intent.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {activeBatch && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Active Deposit Batch</h2>
              <p className="mt-1 text-sm text-slate-400">
                Batch ID: <code>{activeBatch.batchId}</code>
              </p>
            </div>
            <span className="text-sm text-slate-400">
              {activeBatch.intentCount} intent(s)
            </span>
          </div>

          <div className="space-y-4">
            {activeBatch.intentIds.map((intentId, index) => (
              <article
                key={intentId}
                className="rounded-lg border border-slate-800 bg-slate-950 p-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm text-slate-300">
                      Intent: <code>{intentId}</code>
                    </div>
                    <div className="text-sm text-slate-300">
                      SafeTxHash:{" "}
                      <code>{activeBatch.safeTxHashes[intentId] || "-"}</code>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-sm text-slate-300">
                        On-chain vault tx hash
                      </span>
                      <input
                        value={activeBatch.txHashes[intentId] || ""}
                        onChange={(event) =>
                          setActiveBatch((current) =>
                            current
                              ? {
                                  ...current,
                                  txHashes: {
                                    ...current.txHashes,
                                    [intentId]: event.target.value,
                                  },
                                }
                              : current,
                          )
                        }
                        placeholder="0x..."
                        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-sm text-slate-300">Calldata</span>
                    <textarea
                      readOnly
                      value={activeBatch.calldatas[index]}
                      className="min-h-32 w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs"
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recent Deposit Batches</h2>
          <span className="text-sm text-slate-400">
            {depositOverview?.recentBatches.length ?? 0} shown
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {(depositOverview?.recentBatches ?? []).map((batch) => (
            <article
              key={batch.batchId}
              className="rounded-lg border border-slate-800 bg-slate-950 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-white">{batch.batchId}</div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                  {batch.status}
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-400">
                <div>Trigger: {batch.trigger}</div>
                <div>Total amount: {batch.totalAmount}</div>
                <div>Intents: {batch.intentIds.length}</div>
                <div>Started: {formatTimestamp(batch.startedAt)}</div>
                <div>Finished: {formatTimestamp(batch.finishedAt)}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Send Generic Transaction</h2>
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
          <h2 className="text-lg font-semibold">Pending Safe Transactions</h2>
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
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">Origin</th>
                <th className="px-3 py-2">Confirmations</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-slate-400" colSpan={7}>
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
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {getOrigin(tx) || "-"}
                    </td>
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
