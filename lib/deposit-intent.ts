export type DepositIntentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type DepositIntentRecord = {
  intentId: string;
  depositor: string;
  vaultAddress: string;
  token: string;
  amount: string;
  nonce: string;
  deadline: number;
  signature: string;
  status: DepositIntentStatus;
  batchId?: string;
  txHash?: string;
  sharesReceived?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
};

export type DepositBatchRecord = {
  batchId: string;
  vaultAddress: string;
  trigger: string;
  status: string;
  intentIds: string[];
  totalAmount: string;
  txHash?: string;
  calldatas?: string[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
};

export type DepositIntentAdminOverview = {
  executionMode: string;
  vaultState: {
    vaultAddress: string;
    underlyingAsset: string;
    depositsGated: boolean;
    maxDepositAmount: string;
    minDepositAmount: string;
    cachedTotalAssets: string;
    availableCapacity: string;
  };
  pendingIntents: DepositIntentRecord[];
  recentBatches: DepositBatchRecord[];
};

export type GeneratedDepositIntentBatch = {
  batchId: string;
  intentIds: string[];
  calldatas: string[];
  intentCount: number;
};

type GraphqlPayload<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
  error?: string;
};

async function adminGraphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/graphql/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as GraphqlPayload<T>;
  if (!response.ok) {
    throw new Error(
      payload.errors?.[0]?.message ??
        payload.error ??
        `Request failed with ${response.status}`,
    );
  }

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message ?? "GraphQL admin request failed.",
    );
  }

  if (!payload.data) {
    throw new Error("GraphQL admin response missing data.");
  }

  return payload.data;
}

export async function fetchDepositIntentAdminOverview(
  vaultAddress?: string,
  limit = 25,
): Promise<DepositIntentAdminOverview> {
  const query = `
    query DepositIntentAdminOverview($vaultAddress: String, $limit: Int) {
      depositIntentAdminOverview(vaultAddress: $vaultAddress, limit: $limit) {
        executionMode
        vaultState {
          vaultAddress
          underlyingAsset
          depositsGated
          maxDepositAmount
          minDepositAmount
          cachedTotalAssets
          availableCapacity
        }
        pendingIntents {
          intentId
          depositor
          vaultAddress
          token
          amount
          nonce
          deadline
          signature
          status
          batchId
          txHash
          sharesReceived
          errorMessage
          createdAt
          updatedAt
        }
        recentBatches {
          batchId
          vaultAddress
          trigger
          status
          intentIds
          totalAmount
          txHash
          calldatas
          startedAt
          finishedAt
          error
        }
      }
    }
  `;

  const data = await adminGraphqlRequest<{
    depositIntentAdminOverview: DepositIntentAdminOverview;
  }>(query, { vaultAddress, limit });

  return data.depositIntentAdminOverview;
}

export async function generateDepositIntentBatch(params: {
  vaultAddress?: string;
  intentIds?: string[];
  executorAddress?: string;
}): Promise<GeneratedDepositIntentBatch> {
  const query = `
    mutation GenerateDepositIntentBatch(
      $vaultAddress: String
      $intentIds: [String!]
      $executorAddress: String
    ) {
      generateDepositIntentBatch(
        vaultAddress: $vaultAddress
        intentIds: $intentIds
        executorAddress: $executorAddress
      ) {
        batchId
        intentIds
        calldatas
        intentCount
      }
    }
  `;

  const data = await adminGraphqlRequest<{
    generateDepositIntentBatch: GeneratedDepositIntentBatch;
  }>(query, params);

  return data.generateDepositIntentBatch;
}

export async function confirmDepositIntentBatch(params: {
  batchId: string;
  results: Array<{ intentId: string; txHash: string }>;
}): Promise<{ successCount: number; failCount: number }> {
  const query = `
    mutation ConfirmDepositIntentBatch($batchId: String!, $results: [ConfirmDepositIntentBatchEntryInput!]!) {
      confirmDepositIntentBatch(batchId: $batchId, results: $results) {
        successCount
        failCount
      }
    }
  `;

  const data = await adminGraphqlRequest<{
    confirmDepositIntentBatch: { successCount: number; failCount: number };
  }>(query, params);

  return data.confirmDepositIntentBatch;
}
