import { generateTestWallet } from '@fuel-ts/account/test-utils';
import type { FuelError } from '@fuel-ts/errors';
import type { Provider, WalletUnlocked } from 'fuels';
import { Script, bn } from 'fuels';

import { FuelGaugeProjectsEnum, getFuelGaugeForcProject } from '../test/fixtures';

import { setupContract } from './utils';

let provider: Provider;
let advancedLogId: string;
let otherLogId: string;
let baseAssetId: string;

beforeAll(async () => {
  using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);
  using otherAdvancedLogContract = await setupContract(
    FuelGaugeProjectsEnum.ADVANCED_LOGGING_OTHER_CONTRACT
  );

  provider = advancedLogContract.provider;
  advancedLogId = advancedLogContract.id.toB256();
  otherLogId = otherAdvancedLogContract.id.toB256();
  baseAssetId = provider.getBaseAssetId();
});

/**
 * @group node
 * @group browser
 */
describe('Advanced Logging', () => {
  it('can get log data', async () => {
    using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);

    const { value, logs } = await advancedLogContract.functions.test_function().call();

    expect(value).toBeTruthy();
    logs[5].game_id = logs[5].game_id.toHex();
    logs[9].game_id = logs[9].game_id.toHex();

    expect(logs).toEqual([
      'Game State',
      { Playing: 1 },
      'Contract Id',
      {
        bits: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      },
      'Game Ref',
      {
        score: 0,
        time_left: 100,
        ammo: 10,
        game_id: '0x18af8',
        state: { Playing: 1 },
        contract_Id: {
          bits: '0xfffffffffffffffffffffffffffffffff00fffffffffffffffffffffffffffff',
        },
        difficulty: { Medium: true },
      },
      'Game Ref Score',
      0,
      'Direct Game',
      {
        score: 101,
        time_left: 12,
        ammo: 3,
        game_id: '0x20157',
        state: { Playing: 1 },
        contract_Id: {
          bits: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        },
        difficulty: { Hard: true },
      },
      'Was True',
    ]);
  });

  it('can get log data from require [condition=true]', async () => {
    using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);

    const { value, logs } = await advancedLogContract.functions
      .test_function_with_require(1, 1)
      .call();

    expect(value).toBeTruthy();
    expect(logs).toEqual(['Hello Tester', { Playing: 1 }]);
  });

  it('can get log data from require [condition=false]', async () => {
    using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);

    const invocation = advancedLogContract.functions.test_function_with_require(1, 3);
    try {
      await invocation.call();

      throw new Error('it should have thrown');
    } catch (error) {
      if ((<Error>error).message) {
        expect(JSON.stringify((<FuelError>error).metadata.logs)).toMatch(
          JSON.stringify([
            {
              score: 0,
              time_left: 100,
              ammo: 10,
              game_id: bn(0x18af8),
              state: { Playing: 1 },
              contract_Id: {
                bits: '0xfffffffffffffffffffffffffffffffff00fffffffffffffffffffffffffffff',
              },
              difficulty: { Medium: true },
            },
          ])
        );
      } else {
        throw new Error('it should be possible to decode error from "require" statement');
      }
    }
  });

  it('can get log data from a downstream Contract', async () => {
    using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);
    using otherAdvancedLogContract = await setupContract(
      FuelGaugeProjectsEnum.ADVANCED_LOGGING_OTHER_CONTRACT
    );

    const INPUT = 3;
    const { value, logs } = await advancedLogContract.functions
      .test_log_from_other_contract(INPUT, otherAdvancedLogContract.id.toB256())
      .addContracts([otherAdvancedLogContract])
      .call();

    expect(value).toBeTruthy();
    expect(logs).toEqual([
      'Hello from main Contract',
      'Hello from other Contract',
      'Received value from main Contract:',
      INPUT,
    ]);
  });

  describe('should properly decode all logs in a multicall with inter-contract calls', async () => {
    using callTest = await setupContract(FuelGaugeProjectsEnum.CALL_TEST_CONTRACT);
    using configurable = await setupContract(FuelGaugeProjectsEnum.CONFIGURABLE_CONTRACT);
    using coverage = await setupContract(FuelGaugeProjectsEnum.COVERAGE_CONTRACT);

    let wallet: WalletUnlocked;
    const testStruct = {
      a: true,
      b: 100000,
    };

    const expectedLogs = [
      'Hello from main Contract',
      'Hello from other Contract',
      'Received value from main Contract:',
      10,
      bn(100000),
      { tag: '000', age: 21, scores: [1, 3, 4] },
      'fuelfuel',
    ];

    beforeAll(async () => {
      wallet = await generateTestWallet(provider, [[500_000, baseAssetId]]);
    });

    it('when using InvacationScope', async () => {
      using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);
      using otherAdvancedLogContract = await setupContract(
        FuelGaugeProjectsEnum.ADVANCED_LOGGING_OTHER_CONTRACT
      );

      const { logs } = await callTest
        .multiCall([
          advancedLogContract.functions
            .test_log_from_other_contract(10, otherLogId)
            .addContracts([otherAdvancedLogContract]),
          callTest.functions.boo(testStruct),
          configurable.functions.echo_struct(),
          coverage.functions.echo_str_8('fuelfuel'),
        ])
        .call();

      logs.forEach((log, i) => {
        expect(JSON.stringify(log)).toBe(JSON.stringify(expectedLogs[i]));
      });
    });

    it('when using ScriptTransactionRequest', async () => {
      using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);
      using otherAdvancedLogContract = await setupContract(
        FuelGaugeProjectsEnum.ADVANCED_LOGGING_OTHER_CONTRACT
      );

      const request = await callTest
        .multiCall([
          advancedLogContract.functions
            .test_log_from_other_contract(10, otherLogId)
            .addContracts([otherAdvancedLogContract]),
          callTest.functions.boo(testStruct),
          configurable.functions.echo_struct(),
          coverage.functions.echo_str_8('fuelfuel'),
        ])
        .getTransactionRequest();

      const txCost = await provider.getTransactionCost(request, {
        resourcesOwner: wallet,
      });

      request.gasLimit = txCost.gasUsed;
      request.maxFee = txCost.maxFee;

      await wallet.fund(request, txCost);

      const tx = await wallet.sendTransaction(request, { estimateTxDependencies: false });

      const { logs } = await tx.waitForResult();

      expect(logs).toBeDefined();

      logs?.forEach((log, i) => {
        if (typeof log === 'object') {
          expect(JSON.stringify(log)).toBe(JSON.stringify(expectedLogs[i]));
        } else {
          expect(log).toBe(expectedLogs[i]);
        }
      });
    });
  });

  describe('decode logs from a script set to manually call other contracts', () => {
    const { abiContents, binHexlified } = getFuelGaugeForcProject(
      FuelGaugeProjectsEnum.SCRIPT_CALL_CONTRACT
    );

    const amount = Math.floor(Math.random() * 10) + 1;

    let wallet: WalletUnlocked;

    const expectedLogs = [
      'Hello from script',
      'Hello from main Contract',
      'Hello from other Contract',
      'Received value from main Contract:',
      amount,
    ];

    beforeAll(async () => {
      wallet = await generateTestWallet(provider, [[300_000, baseAssetId]]);
    });

    it('when using InvocationScope', async () => {
      using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);
      using otherAdvancedLogContract = await setupContract(
        FuelGaugeProjectsEnum.ADVANCED_LOGGING_OTHER_CONTRACT
      );

      const script = new Script(binHexlified, abiContents, wallet);
      const { logs } = await script.functions
        .main(advancedLogId, otherLogId, amount)
        .addContracts([advancedLogContract, otherAdvancedLogContract])
        .call();

      expect(logs).toStrictEqual(expectedLogs);
    });

    it('when using ScriptTransactionRequest', async () => {
      using advancedLogContract = await setupContract(FuelGaugeProjectsEnum.ADVANCED_LOGGING);
      using otherAdvancedLogContract = await setupContract(
        FuelGaugeProjectsEnum.ADVANCED_LOGGING_OTHER_CONTRACT
      );

      const script = new Script(binHexlified, abiContents, wallet);

      const request = await script.functions
        .main(advancedLogId, otherLogId, amount)
        .addContracts([advancedLogContract, otherAdvancedLogContract])
        .getTransactionRequest();

      const txCost = await provider.getTransactionCost(request, {
        resourcesOwner: wallet,
      });

      request.gasLimit = txCost.gasUsed;
      request.maxFee = txCost.maxFee;

      await wallet.fund(request, txCost);

      const tx = await wallet.sendTransaction(request);

      const { logs } = await tx.waitForResult();

      expect(logs).toBeDefined();

      expect(logs).toStrictEqual(expectedLogs);
    });
  });
});
