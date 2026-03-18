# Safe Multi-Sig Demo (Monad)

Demo dApp for testing Safe multisig transaction flow using:

- Next.js + TypeScript (App Router)
- `@safe-global/protocol-kit`
- `@safe-global/api-kit`
- `@safe-global/types-kit`
- `ethers` v6
- Tailwind CSS
- Injected wallet provider via `window.haha`

## Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SAFE_API_KEY="your-safe-transaction-service-api-key"
NEXT_PUBLIC_SAFE_ADDRESS="0xYourSafeAddress"
GRAPHQL_ENDPOINT="https://your-backend/graphql"
DEPOSIT_INTENT_ADMIN_API_KEY="your-backend-admin-key"
```

Notes:

- `NEXT_PUBLIC_SAFE_ADDRESS` must be a valid checksum-compatible address.
- The app is configured to use chain ID `143`.
- Safe Transaction Service requests are authenticated with `NEXT_PUBLIC_SAFE_API_KEY`.
- Deposit-intent admin requests are proxied server-side to `GRAPHQL_ENDPOINT` using `DEPOSIT_INTENT_ADMIN_API_KEY`.
- If `GRAPHQL_ENDPOINT` is omitted, the app falls back to `https://dev.sv.haha.me/graphql`.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current app flow (`app/page.tsx`)

1. App attempts to auto-connect `window.haha` wallet on load.
2. You can manually **Connect Wallet** / **Disconnect Wallet**.
3. If connected account is not a Safe owner, actions are blocked with an error.
4. In **Send Transaction**, input:
   - `To Address`
   - `Amount (MON)`
5. Click **Send** to create and propose a Safe transaction.
6. `SafeTxHash` is shown after proposal succeeds.
7. In **Pending Transactions**, you can:
   - **Approve**: add your confirmation signature
   - **Execute**: execute when confirmation threshold is reached
   - **Reject**: propose a rejection transaction for the same nonce
8. Use **Refresh** to reload pending transactions.

## UI status handling

The page displays:

- wallet connection errors
- Safe/service/action errors
- success messages for propose/approve/reject/execute actions
