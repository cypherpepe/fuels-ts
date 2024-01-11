import { generateTestWallet } from '@fuel-ts/wallet/test-utils';
import { Provider, Wallet, BaseAssetId, FUEL_NETWORK_URL, TransactionResponse } from 'fuels';

import { getSetupContract } from './utils';
/**
 * @group node
 */
describe('Edge Cases', () => {
  it('can run collision_in_fn_names', async () => {
    const contract = await getSetupContract('collision_in_fn_names')();

    const { minGasPrice } = contract.provider.getGasConfig();

    expect(
      (
        await contract.functions.new().txParams({ gasPrice: minGasPrice, gasLimit: 10_000 }).call()
      ).value.toNumber()
    ).toEqual(12345);
  });

  test("SSE subscriptions that are closed by the node don't hang a for-await-of loop", async () => {
    const provider = await Provider.create(FUEL_NETWORK_URL);
    const adminWallet = await generateTestWallet(provider, [[500_000]]);

    const destination = Wallet.generate({
      provider,
    });

    const { id: transactionId } = await adminWallet.transfer(
      destination.address,
      100,
      BaseAssetId,
      { gasPrice: provider.getGasConfig().minGasPrice, gasLimit: 10_000 }
    );

    const response = new TransactionResponse(transactionId, provider);

    await response.waitForResult();

    const subsciption = provider.operations.statusChange({ transactionId });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const iterator of subsciption) {
      // we leave this intentionally empty so that we test that the subscription will end the loop when the connection is closed
    }
  });
});
