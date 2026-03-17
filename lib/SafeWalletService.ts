import SafeApiKit from "@safe-global/api-kit";
import type {
  CreateTransactionProps,
  Eip1193Provider,
} from "@safe-global/protocol-kit";
import Safe from "@safe-global/protocol-kit";
import type { SafeMultisigTransactionResponse } from "@safe-global/types-kit";
import { getAddress } from "ethers";

const SAFE_API_KEY = process.env.NEXT_PUBLIC_SAFE_API_KEY;
const SAFE_ADDRESS = process.env.NEXT_PUBLIC_SAFE_ADDRESS;

type InitializeParams = {
  provider: Eip1193Provider;
  signerAddress: string;
  chainId: string;
};

class SafeWalletServiceClass {
  private protocolKit: Safe | null = null;
  private apiKit: SafeApiKit | null = null;
  private signerAddress: string | null = null;
  private chainId: string | null = null;

  async initialize(params: InitializeParams) {
    if (!SAFE_API_KEY) {
      throw new Error("NEXT_PUBLIC_SAFE_API_KEY is not defined.");
    }

    if (!SAFE_ADDRESS) {
      throw new Error("NEXT_PUBLIC_SAFE_ADDRESS is not defined.");
    }

    const safeAddress = this.requireSafeAddress();
    const signerAddress = this.toChecksumAddress(
      params.signerAddress,
      "signerAddress",
    );

    const sameConfig =
      this.protocolKit &&
      this.apiKit &&
      this.signerAddress?.toLowerCase() === signerAddress.toLowerCase() &&
      this.chainId === params.chainId;

    if (sameConfig) return;

    this.protocolKit = await Safe.init({
      provider: params.provider,
      signer: signerAddress,
      safeAddress,
    });

    this.apiKit = new SafeApiKit({
      chainId: BigInt(params.chainId),
      apiKey: SAFE_API_KEY,
    });

    this.signerAddress = signerAddress;
    this.chainId = params.chainId;
  }

  async isOwner(address: string) {
    const safeAddress = this.requireSafeAddress();
    const apiKit = this.requireApiKit();
    const safeInfo = await apiKit.getSafeInfo(safeAddress);
    return safeInfo.owners.some(
      (owner) => owner.toLowerCase() === address.toLowerCase(),
    );
  }

  async getPendingTransactions(): Promise<SafeMultisigTransactionResponse[]> {
    const apiKit = this.requireApiKit();
    const pending = await apiKit.getPendingTransactions(
      this.requireSafeAddress(),
    );
    return pending.results;
  }

  async proposeTransaction(
    params: CreateTransactionProps,
    origin?: string,
  ): Promise<string> {
    const protocolKit = this.requireProtocolKit();
    const apiKit = this.requireApiKit();
    const signerAddress = this.requireSignerAddress();
    const safeAddress = this.requireSafeAddress();

    const safeTransaction = await protocolKit.createTransaction(params);

    const safeTxHash = await protocolKit.getTransactionHash(safeTransaction);
    const senderSignature = await protocolKit.signHash(safeTxHash);

    const proposeTransactionParams = {
      safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress: signerAddress,
      senderSignature: senderSignature.data,
      origin,
    };
    await apiKit.proposeTransaction(proposeTransactionParams);

    return safeTxHash;
  }

  async approveTransaction(safeTxHash: string) {
    const protocolKit = this.requireProtocolKit();
    const apiKit = this.requireApiKit();
    const ownerSignature = await protocolKit.signHash(safeTxHash);
    await apiKit.confirmTransaction(safeTxHash, ownerSignature.data);
  }

  async executeTransaction(tx: SafeMultisigTransactionResponse) {
    const protocolKit = this.requireProtocolKit();
    await protocolKit.executeTransaction(tx);
  }

  async rejectTransaction(nonce: string): Promise<string> {
    const protocolKit = this.requireProtocolKit();
    const apiKit = this.requireApiKit();
    const safeAddress = this.requireSafeAddress();
    const signerAddress = this.requireSignerAddress();

    const rejectionTx = await protocolKit.createRejectionTransaction(
      Number(nonce),
    );
    const rejectionHash = await protocolKit.getTransactionHash(rejectionTx);
    const rejectionSig = await protocolKit.signHash(rejectionHash);

    await apiKit.proposeTransaction({
      safeAddress,
      safeTransactionData: rejectionTx.data,
      safeTxHash: rejectionHash,
      senderAddress: signerAddress,
      senderSignature: rejectionSig.data,
    });

    return rejectionHash;
  }

  private requireProtocolKit(): Safe {
    if (!this.protocolKit)
      throw new Error("SafeWalletService not initialized.");
    return this.protocolKit;
  }

  private requireApiKit(): SafeApiKit {
    if (!this.apiKit) throw new Error("SafeWalletService not initialized.");
    return this.apiKit;
  }

  private requireSignerAddress(): string {
    if (!this.signerAddress)
      throw new Error("SafeWalletService not initialized.");
    return this.signerAddress;
  }

  private requireSafeAddress(): string {
    if (!SAFE_ADDRESS) {
      throw new Error("NEXT_PUBLIC_SAFE_ADDRESS is not defined.");
    }

    return this.toChecksumAddress(SAFE_ADDRESS, "NEXT_PUBLIC_SAFE_ADDRESS");
  }

  private toChecksumAddress(address: string, field: string): string {
    try {
      return getAddress(address);
    } catch {
      throw new Error(`${field} is not a valid Ethereum address: ${address}`);
    }
  }
}

const SafeWalletService = new SafeWalletServiceClass();

export default SafeWalletService;
