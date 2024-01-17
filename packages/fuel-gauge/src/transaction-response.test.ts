import { generateTestWallet, launchNode } from '@fuel-ts/wallet/test-utils';
import type { BN } from 'fuels';
import {
  BaseAssetId,
  FUEL_NETWORK_URL,
  Provider,
  TransactionResponse,
  Wallet,
  randomBytes,
  WalletUnlocked,
} from 'fuels';

/**
 * @group node
 */
describe('TransactionSummary', () => {
  let provider: Provider;
  let adminWallet: WalletUnlocked;
  let gasPrice: BN;

  beforeAll(async () => {
    provider = await Provider.create(FUEL_NETWORK_URL);
    adminWallet = await generateTestWallet(provider, [[500_000]]);
    ({ minGasPrice: gasPrice } = provider.getGasConfig());
  });

  it('should ensure create method waits till a transaction response is given', async () => {
    const destination = Wallet.generate({
      provider,
    });

    const { id: transactionId } = await adminWallet.transfer(
      destination.address,
      100,
      BaseAssetId,
      { gasPrice, gasLimit: 10_000 }
    );

    const response = await TransactionResponse.create(transactionId, provider);

    expect(response.gqlTransaction).toBeDefined();
    expect(response.gqlTransaction?.status).toBeDefined();
    expect(response.gqlTransaction?.id).toBe(transactionId);
  });

  it('should ensure getTransactionSummary fetchs a transaction and assembles transaction summary', async () => {
    const destination = Wallet.generate({
      provider,
    });

    const { id: transactionId } = await adminWallet.transfer(
      destination.address,
      100,
      BaseAssetId,
      { gasPrice, gasLimit: 10_000 }
    );

    const response = new TransactionResponse(transactionId, provider);

    expect(response.gqlTransaction).toBeUndefined();

    const transactionSummary = await response.getTransactionSummary();

    expect(transactionSummary.id).toBeDefined();
    expect(transactionSummary.fee).toBeDefined();
    expect(transactionSummary.gasUsed).toBeDefined();
    expect(transactionSummary.operations).toBeDefined();
    expect(transactionSummary.type).toBeDefined();
    expect(transactionSummary.blockId).toBeDefined();
    expect(transactionSummary.time).toBeDefined();
    expect(transactionSummary.status).toBeDefined();
    expect(transactionSummary.receipts).toBeDefined();
    expect(transactionSummary.mintedAssets).toBeDefined();
    expect(transactionSummary.burnedAssets).toBeDefined();
    expect(transactionSummary.isTypeMint).toBeDefined();
    expect(transactionSummary.isTypeCreate).toBeDefined();
    expect(transactionSummary.isTypeScript).toBeDefined();
    expect(transactionSummary.isStatusFailure).toBeDefined();
    expect(transactionSummary.isStatusSuccess).toBeDefined();
    expect(transactionSummary.isStatusPending).toBeDefined();
    expect(transactionSummary.transaction).toBeDefined();

    expect(response.gqlTransaction).toBeDefined();
    expect(response.gqlTransaction?.status).toBeDefined();
    expect(response.gqlTransaction?.id).toBe(transactionId);
  });

  it('should ensure waitForResult always waits for the transaction to be processed', async () => {
    const { cleanup, ip, port } = await launchNode({
      /**
       * This is set to so long in order to test keep-alive message handling as well.
       * Keep-alive messages are sent every 15s.
       * It is very important to test this because the keep-alive messages are not sent in the same format as the other messages
       * and it is reasonable to expect subscriptions lasting more than 15 seconds.
       * We need a proper integration test for this
       * because if the keep-alive message changed in any way between fuel-core versions and we missed it,
       * all our subscriptions would break.
       * We need at least one long test to ensure that the keep-alive messages are handled correctly.
       * */
      args: ['--poa-interval-period', '17sec'],
    });
    const nodeProvider = await Provider.create(`http://${ip}:${port}/graphql`);

    const genesisWallet = new WalletUnlocked(
      process.env.GENESIS_SECRET || randomBytes(32),
      nodeProvider
    );

    const destination = Wallet.generate({ provider: nodeProvider });

    const { id: transactionId } = await genesisWallet.transfer(
      destination.address,
      100,
      BaseAssetId,
      { gasPrice, gasLimit: 10_000 }
    );
    const response = await TransactionResponse.create(transactionId, nodeProvider);

    expect(response.gqlTransaction?.status?.type).toBe('SubmittedStatus');

    await response.waitForResult();

    expect(response.gqlTransaction?.status?.type).toEqual('SuccessStatus');
    expect(response.gqlTransaction?.id).toBe(transactionId);

    cleanup();
  }, 18500);
});
