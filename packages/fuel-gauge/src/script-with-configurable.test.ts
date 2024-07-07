import { Script } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import { ScriptWithConfigurableAbi__factory } from '../test/typegen';

const defaultValues = {
  FEE: 5,
};

/**
 * @group node
 * @group browser
 */
describe('Script With Configurable', () => {
  it('should returns true when input value matches default configurable constant', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 1_000_000,
      },
    });

    const {
      wallets: [wallet],
    } = launched;

    const script = new Script(
      ScriptWithConfigurableAbi__factory.bin,
      ScriptWithConfigurableAbi__factory.abi,
      wallet
    );

    script.setConfigurableConstants(defaultValues);

    const { value } = await script.functions.main(defaultValues.FEE).call();

    expect(value).toBe(true);
  });

  it('should returns false when input value differs from default configurable constant', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 1_000_000,
      },
    });

    const {
      wallets: [wallet],
    } = launched;

    const configurableConstants = { FEE: 71 };

    expect(configurableConstants.FEE).not.toEqual(defaultValues.FEE);

    const script = new Script(
      ScriptWithConfigurableAbi__factory.bin,
      ScriptWithConfigurableAbi__factory.abi,
      wallet
    );

    script.setConfigurableConstants(defaultValues);

    const { value } = await script.functions.main(configurableConstants.FEE).call();

    expect(value).toBe(false);
  });

  it('should returns true when input value matches manually set configurable constant', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 1_000_000,
      },
    });

    const {
      wallets: [wallet],
    } = launched;

    const configurableConstants = { FEE: 35 };

    const script = new Script(
      ScriptWithConfigurableAbi__factory.bin,
      ScriptWithConfigurableAbi__factory.abi,
      wallet
    );

    script.setConfigurableConstants(configurableConstants);

    const { value } = await script.functions.main(configurableConstants.FEE).call();

    expect(value).toBe(true);
  });

  it('should returns false when input value differs from manually set configurable constant', async () => {
    using launched = await launchTestNode({
      walletsConfig: {
        amountPerCoin: 1_000_000,
      },
    });

    const {
      wallets: [wallet],
    } = launched;

    const configurableConstants = { FEE: 10 };

    const input = { FEE: 15 };

    expect(configurableConstants.FEE).not.toEqual(input.FEE);

    const script = new Script(
      ScriptWithConfigurableAbi__factory.bin,
      ScriptWithConfigurableAbi__factory.abi,
      wallet
    );

    script.setConfigurableConstants(configurableConstants);

    const { value } = await script.functions.main(input.FEE).call();

    expect(value).toBe(false);
  });
});
