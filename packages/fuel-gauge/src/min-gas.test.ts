import {
  bn,
  TransactionStatus,
  ScriptTransactionRequest,
  Address,
  Predicate,
  hexlify,
  getGasUsedFromReceipts,
  BigNumberCoder,
} from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import { ComplexPredicateAbi__factory } from '../test/typegen';

/**
 * @group node
 * @group browser
 */
describe(__filename, () => {
  // it('sets gas requirements (contract)', async () => {
  //   using launched = await launchTestNode({
  //     walletsConfig: {
  //       amountPerCoin: 500_000,
  //     },
  //   });

  //   const {
  //     provider,
  //     wallets: [wallet],
  //   } = launched;

  //   /**
  //    * Create a contract transaction
  //    */

  //   const { abiContents, binHexlified, storageSlots } = getFuelGaugeForcProject(
  //     FuelGaugeProjectsEnum.COVERAGE_CONTRACT
  //   );

  //   const contractFactory = new ContractFactory(binHexlified, abiContents, wallet);
  //   const { transactionRequest: request } = contractFactory.createTransactionRequest({
  //     storageSlots,
  //   });
  //   const resources = await provider.getResourcesToSpend(wallet.address, [
  //     {
  //       amount: bn(100_000),
  //       assetId: provider.getBaseAssetId(),
  //     },
  //   ]);
  //   request.addResources(resources);

  //   /**
  //    * Get the transaction cost to set a strict gasLimit and min gasPrice
  //    */
  //   const { maxFee } = await provider.getTransactionCost(request);

  //   request.maxFee = maxFee;

  //   /**
  //    * Send transaction
  //    */
  //   const result = await wallet.sendTransaction(request);
  //   const { status } = await result.waitForResult();

  //   expect(status).toBe(TransactionStatus.success);
  // });

  // it('sets gas requirements (script)', async () => {
  //   using launched = await launchTestNode({
  //     walletsConfig: {
  //       amountPerCoin: 500_000,
  //     },
  //   });

  //   const {
  //     provider,
  //     wallets: [sender],
  //   } = launched;

  //   /**
  //    * Create a script transaction
  //    */
  //   const { binHexlified } = getFuelGaugeForcProject(FuelGaugeProjectsEnum.COMPLEX_SCRIPT);

  //   const request = new ScriptTransactionRequest({
  //     script: binHexlified,
  //     scriptData: hexlify(new BigNumberCoder('u64').encode(bn(2000))),
  //   });
  //   request.addCoinOutput(Address.fromRandom(), bn(100), provider.getBaseAssetId());

  //   /**
  //    * Get the transaction cost to set a strict gasLimit and min gasPrice
  //    */
  //   const txCost = await provider.getTransactionCost(request);

  //   request.gasLimit = txCost.gasUsed;
  //   request.maxFee = txCost.maxFee;

  //   await sender.fund(request, txCost);

  //   /**
  //    * Send transaction
  //    */
  //   const result = await sender.sendTransaction(request);
  //   const { status, gasUsed: txGasUsed } = await result.wait();

  //   expect(status).toBe(TransactionStatus.success);
  //   expect(txCost.gasUsed.toString()).toBe(txGasUsed.toString());
  // });

  it('sets gas requirements (predicate)', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 100_000_000,
      },
    });

    const { provider } = launched;

    /**
     * Setup predicate
     */
    const predicate = new Predicate({
      bytecode: ComplexPredicateAbi__factory.bin,
      abi: ComplexPredicateAbi__factory.abi,
      provider,
      inputData: [bn(1000)],
    });

    /**
     * Fund the predicate
     */
    const fundRequest = new ScriptTransactionRequest();

    fundRequest.addCoinOutput(Address.fromRandom(), bn(500_000), provider.getBaseAssetId());

    const fundTxCost = await provider.getTransactionCost(fundRequest, {
      resourcesOwner: predicate,
    });

    fundRequest.gasLimit = fundTxCost.gasUsed;
    fundRequest.maxFee = fundTxCost.maxFee;

    await predicate.fund(fundRequest, fundTxCost);

    /**
     * Create a script transaction transfer
     */
    const request = new ScriptTransactionRequest();
    request.addCoinOutput(Address.fromRandom(), bn(100), provider.getBaseAssetId());

    /**
     * Get the transaction cost to set a strict gasLimit and min gasPrice
     */
    const txCost = await provider.getTransactionCost(request, { resourcesOwner: predicate });

    request.gasLimit = txCost.gasUsed;
    request.maxFee = txCost.maxFee;

    await predicate.fund(request, txCost);

    /**
     * Send transaction predicate
     */
    const result = await predicate.sendTransaction(request);
    const { status, receipts } = await result.waitForResult();
    const gasUsedFromReceipts = getGasUsedFromReceipts(receipts);

    expect(status).toBe(TransactionStatus.success);
    expect(txCost.gasUsed.toString()).toBe(gasUsedFromReceipts.toString());
  });

  // it('sets gas requirements (account and predicate with script)', async () => {
  //   using launched = await launchTestNode({
  //     walletsConfig: {
  //       amountPerCoin: 500_000,
  //     },
  //   });

  //   const {
  //     provider,
  //     wallets: [wallet],
  //   } = launched;
  //   const baseAssetId = provider.getBaseAssetId();

  //   /**
  //    * Setup predicate
  //    */
  //   const predicate = new Predicate({
  //     bytecode: ComplexPredicateAbi__factory.bin,
  //     abi: ComplexPredicateAbi__factory.abi,
  //     provider,
  //     inputData: [bn(1000)],
  //   });

  //   /**
  //    * Fund the predicate
  //    */
  //   const fundRequest = new ScriptTransactionRequest();
  //   fundRequest.addCoinOutput(predicate.address, bn(500_000), baseAssetId);

  //   const fundTxCost = await provider.getTransactionCost(fundRequest, {
  //     resourcesOwner: predicate,
  //   });

  //   await predicate.fund(fundRequest, fundTxCost);

  //   /**
  //    * Create a script transaction
  //    */
  //   const { binHexlified: scriptBin } = getFuelGaugeForcProject(
  //     FuelGaugeProjectsEnum.COMPLEX_SCRIPT
  //   );
  //   const request = new ScriptTransactionRequest({
  //     script: scriptBin,
  //     scriptData: hexlify(new BigNumberCoder('u64').encode(bn(2000))),
  //   });
  //   // add predicate transfer
  //   const resourcesPredicate = await predicate.getResourcesToSpend([
  //     {
  //       amount: bn(100_000),
  //       assetId: baseAssetId,
  //     },
  //   ]);
  //   request.addResources(resourcesPredicate);

  //   // add account transfer
  //   request.addCoinOutput(Address.fromRandom(), bn(100), baseAssetId);

  //   const txCost = await provider.getTransactionCost(request, {
  //     resourcesOwner: predicate,
  //   });
  //   request.gasLimit = txCost.gasUsed;
  //   request.maxFee = txCost.maxFee;

  //   await wallet.provider.estimatePredicates(request);

  //   await wallet.fund(request, txCost);

  //   /**
  //    * Get the transaction cost to set a strict gasLimit and min gasPrice
  //    */

  //   /**
  //    * Send transaction predicate
  //    */
  //   predicate.populateTransactionPredicateData(request);
  //   await wallet.populateTransactionWitnessesSignature(request);
  //   const result = await predicate.sendTransaction(request);
  //   const { status, receipts } = await result.wait();
  //   const txGasUsed = getGasUsedFromReceipts(receipts);

  //   expect(status).toBe(TransactionStatus.success);
  //   expect(txCost.gasUsed.toString()).toBe(txGasUsed.toString());
  // });
});
