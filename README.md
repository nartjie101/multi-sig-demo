# Safe Multi-Sig Demo (Next.js 14)

Demo website for testing Safe multi-sig transaction flow with:

- Next.js 14 + TypeScript + App Router
- `@safe-global/protocol-kit`
- `@safe-global/api-kit`
- `ethers` v6
- Tailwind CSS
- Injected wallet provider `window.haha`

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How to use

1. Click **Connect window.haha**.
2. Fill:
   - Safe Address
   - Chain ID
3. In **Send Transaction**, input:
   - To Address
   - Amount (MON)
4. Submit to create + propose a Safe tx and get the generated `SafeTxHash`.
5. In **Transaction List**, click:
   - **Approve** to add your confirmation signature
   - **Reject** to propose a rejection tx for that nonce

The transaction list shows up to 3 pending transactions and displays threshold state.

## Safe API key

The app now authenticates to Safe Transaction Service using API key auth (no URL input field in UI).
