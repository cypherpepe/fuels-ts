import { bn, Predicate, Wallet, Address } from 'fuels';
import type { BN } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import { RawSliceAbi__factory } from '../test/typegen/contracts';
import RawSliceAbiHex from '../test/typegen/contracts/RawSliceAbi.hex';
import { PredicateRawSliceAbi__factory } from '../test/typegen/predicates';

import { getScript, launchTestContract } from './utils';

type SomeEnum = {
  First?: boolean;
  Second?: number[];
};

type Wrapper = {
  inner: number[][];
  inner_enum: SomeEnum;
};

async function setupRawSliceContract() {
  return launchTestContract({
    deployer: RawSliceAbi__factory,
    bytecode: RawSliceAbiHex,
  });
}
/**
 * @group node
 * @group browser
 */
describe('Raw Slice Tests', () => {
  it('should test raw slice output', async () => {
    using contractInstance = await setupRawSliceContract();

    const INPUT = 10;

    const { value } = await contractInstance.functions.return_raw_slice(INPUT).call();

    expect(value).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('should test raw slice input', async () => {
    using contractInstance = await setupRawSliceContract();

    const INPUT = [40, 41, 42];

    const { value } = await contractInstance.functions.accept_raw_slice(INPUT).call<number[]>();

    expect(value).toBeUndefined();
  });

  it('should test raw slice input [nested]', async () => {
    using contractInstance = await setupRawSliceContract();

    const slice = [40, 41, 42];
    const INPUT = {
      inner: [slice, slice],
      inner_enum: { Second: slice },
    };

    const { value } = await contractInstance.functions
      .accept_nested_raw_slice(INPUT)
      .call<number[]>();

    expect(value).toBeUndefined();
  });

  it('should test raw slice input [predicate-raw-slice]', async () => {
    using launched = await launchTestNode();

    const {
      provider,
      wallets: [wallet],
    } = launched;

    const receiver = Wallet.fromAddress(Address.fromRandom(), provider);
    const amountToPredicate = 300_000;
    const amountToReceiver = 50;
    type MainArgs = [Wrapper];

    const bytes = [40, 41, 42];
    const INPUT: Wrapper = {
      inner: [bytes, bytes],
      inner_enum: { Second: bytes },
    };

    const predicate = new Predicate<MainArgs>({
      bytecode: PredicateRawSliceAbi__factory.bin,
      abi: PredicateRawSliceAbi__factory.abi,
      provider: wallet.provider,
      inputData: [INPUT],
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

  it('should test raw slice input [script-raw-slice]', async () => {
    const wallet = await setup();
    type MainArgs = [number, Wrapper];
    const scriptInstance = getScript<MainArgs, void>('script-raw-slice', wallet);

    const bytes = [40, 41, 42];
    const INPUT: Wrapper = {
      inner: [bytes, bytes],
      inner_enum: { Second: bytes },
    };

    const { value } = await scriptInstance.functions.main(3, INPUT).call<BN[]>();
    expect(value).toStrictEqual([0, 1, 2]);
  });
});
