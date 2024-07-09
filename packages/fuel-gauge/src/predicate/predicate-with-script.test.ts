import type { BigNumberish } from 'fuels';
import { toNumber, Script, Predicate, Wallet } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import {
  PredicateMainArgsStructAbi__factory,
  ScriptMainArgsAbi__factory,
} from '../../test/typegen';
import type { Validation } from '../types/predicate';

import { fundPredicate } from './utils/predicate';

/**
 * @group node
 * @group browser
 */
describe('Predicate', () => {
  describe('With script', () => {
    it('calls a predicate and uses proceeds for a script call', async () => {
      using launched = await launchTestNode({
        walletsConfig: {
          amountPerCoin: 1_000_000_000_000,
        },
      });
      const {
        provider,
        wallets: [wallet],
      } = launched;

      const receiver = Wallet.generate({ provider });

      const initialReceiverBalance = toNumber(await receiver.getBalance());
      const scriptInstance = new Script<BigNumberish[], BigNumberish>(
        ScriptMainArgsAbi__factory.bin,
        ScriptMainArgsAbi__factory.abi,
        wallet
      );

      // calling the script with the receiver account (no resources)
      const scriptInput = 1;
      scriptInstance.account = receiver;

      await expect(scriptInstance.functions.main(scriptInput).call()).rejects.toThrow(
        /not enough coins to fit the target/
      );

      // setup predicate
      const amountToPredicate = 900_000;
      const amountToReceiver = 100_000;
      const predicate = new Predicate<[Validation]>({
        bytecode: PredicateMainArgsStructAbi__factory.bin,
        provider,
        abi: PredicateMainArgsStructAbi__factory.abi,
        inputData: [
          {
            has_account: true,
            total_complete: 100,
          },
        ],
      });

      await fundPredicate(wallet, predicate, amountToPredicate);

      // executing predicate to transfer resources to receiver
      const tx = await predicate.transfer(
        receiver.address,
        amountToReceiver,
        provider.getBaseAssetId(),
        {
          gasLimit: 1000,
        }
      );

      const { isStatusSuccess } = await tx.waitForResult();
      expect(isStatusSuccess).toBeTruthy();

      const res = await scriptInstance.functions.main(scriptInput).call();
      expect(res.transactionResult.isStatusSuccess).toBeTruthy();

      const receiverFinalBalance = await receiver.getBalance();

      expect(toNumber(initialReceiverBalance)).toBe(0);
      expect(receiverFinalBalance.gt(initialReceiverBalance)).toBeTruthy();
    });
  });
});
