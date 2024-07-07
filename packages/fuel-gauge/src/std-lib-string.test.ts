import { bn, Predicate, Wallet, Address } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import { PredicateStdLibStringAbi__factory, StdLibStringAbi__factory } from '../test/typegen';
import StdLibStringAbiHex from '../test/typegen/contracts/StdLibStringAbi.hex';

import { getScript, launchTestContract } from './utils';

/**
 * @group node
 * @group browser
 */

async function setupContract() {
  return launchTestContract({
    deployer: StdLibStringAbi__factory,
    bytecode: StdLibStringAbiHex,
  });
}

describe('std-lib-string Tests', () => {
  it('should test std-lib-string return', async () => {
    using contractInstance = await setupContract();
    const { value } = await contractInstance.functions.return_dynamic_string().call<string>();
    expect(value).toBe('Hello World');
  });

  it('should test std-lib-string input', async () => {
    using contractInstance = await setupContract();
    const INPUT = 'Hello World';

    const { value } = await contractInstance.functions.accepts_dynamic_string(INPUT).call();

    expect(value).toBeUndefined();
  });

  it('should test String input [predicate-std-lib-string]', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 1_000_000,
      },
    });

    const {
      provider,
      wallets: [wallet],
    } = launched;

    const receiver = Wallet.fromAddress(Address.fromRandom(), provider);

    const amountToPredicate = 300_000;
    const amountToReceiver = 50;
    type MainArgs = [number, number, string];
    const predicate = new Predicate<MainArgs>({
      bytecode: PredicateStdLibStringAbi__factory.bin,
      abi: PredicateStdLibStringAbi__factory.abi,
      provider,
      inputData: [1, 2, 'Hello World'],
    });

    // setup predicate
    const setupTx = await wallet.transfer(
      predicate.address,
      amountToPredicate,
      provider.getBaseAssetId(),
      {
        gasLimit: 10_000,
      }
    );
    await setupTx.waitForResult();

    const initialReceiverBalance = await receiver.getBalance();
    const tx = await predicate.transfer(
      receiver.address,
      amountToReceiver,
      provider.getBaseAssetId(),
      {
        gasLimit: 10_000,
      }
    );
    const { isStatusSuccess } = await tx.waitForResult();

    // Check the balance of the receiver
    const finalReceiverBalance = await receiver.getBalance();
    expect(bn(initialReceiverBalance).add(amountToReceiver).toHex()).toEqual(
      finalReceiverBalance.toHex()
    );

    expect(isStatusSuccess);
  });

  it('should test String input [script-std-lib-string]', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 1_000_000,
      },
    });

    const {
      wallets: [wallet],
    } = launched;

    type MainArgs = [string];
    const scriptInstance = getScript<MainArgs, void>('script-std-lib-string', wallet);
    const INPUT = 'Hello World';

    const { value } = await scriptInstance.functions.main(INPUT).call();

    expect(value).toBe(true);
  });
});
