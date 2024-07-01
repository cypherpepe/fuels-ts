import { BYTES_32 } from '@fuel-ts/abi-coder';
import { randomBytes } from '@fuel-ts/crypto';
import type { SnapshotConfigs } from '@fuel-ts/utils';
import { defaultConsensusKey, hexlify, defaultSnapshotConfigs } from '@fuel-ts/utils';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { getPortPromise } from 'portfinder';
import treeKill from 'tree-kill';

import { Provider } from '../providers';
import { Signer } from '../signer';
import type { WalletUnlocked } from '../wallet';

import { generateTestWallet } from './generateTestWallet';

const getFlagValueFromArgs = (args: string[], flag: string) => {
  const flagIndex = args.indexOf(flag);
  if (flagIndex === -1) {
    return undefined;
  }
  return args[flagIndex + 1];
};

const extractRemainingArgs = (args: string[], flagsToRemove: string[]) => {
  const newArgs = [...args];
  flagsToRemove.forEach((flag) => {
    const flagIndex = newArgs.indexOf(flag);
    if (flagIndex !== -1) {
      newArgs.splice(flagIndex, 2);
    }
  });
  return newArgs;
};

export type LaunchNodeOptions = {
  ip?: string;
  port?: string;
  args?: string[];
  fuelCorePath?: string;
  loggingEnabled?: boolean;
  debugEnabled?: boolean;
  basePath?: string;
  /**
   * The snapshot configuration to use.
   * Passing in a snapshot configuration path via the `--snapshot` flag in `args` will override this.
   * */
  snapshotConfig?: SnapshotConfigs;
};

export type LaunchNodeResult = Promise<{
  cleanup: () => void;
  ip: string;
  port: string;
  url: string;
  snapshotDir: string;
}>;

export type KillNodeParams = {
  child: ChildProcessWithoutNullStreams;
  configPath: string;
  killFn: (pid: number) => void;
  state: {
    isDead: boolean;
  };
};

export const killNode = (params: KillNodeParams) => {
  const { child, configPath, state, killFn } = params;
  if (!state.isDead) {
    if (child.pid) {
      state.isDead = true;
      killFn(Number(child.pid));
    }

    // Remove all the listeners we've added.
    child.stdout.removeAllListeners();
    child.stderr.removeAllListeners();

    // Remove the temporary folder and all its contents.
    if (existsSync(configPath)) {
      rmSync(configPath, { recursive: true });
    }
  }
};

function getFinalStateConfigJSON({ stateConfig, chainConfig }: SnapshotConfigs) {
  const defaultCoins = defaultSnapshotConfigs.stateConfig.coins.map((coin) => ({
    ...coin,
    amount: '18446744073709551615',
  }));
  const defaultMessages = defaultSnapshotConfigs.stateConfig.messages.map((message) => ({
    ...message,
    amount: '18446744073709551615',
  }));

  const coins = defaultCoins
    .concat(stateConfig.coins.map((coin) => ({ ...coin, amount: coin.amount.toString() })))
    .filter((coin, index, self) => self.findIndex((c) => c.tx_id === coin.tx_id) === index);
  const messages = defaultMessages
    .concat(stateConfig.messages.map((msg) => ({ ...msg, amount: msg.amount.toString() })))
    .filter((msg, index, self) => self.findIndex((m) => m.nonce === msg.nonce) === index);

  // If there's no genesis key, generate one and some coins to the genesis block.
  if (!process.env.GENESIS_SECRET) {
    const pk = Signer.generatePrivateKey();
    const signer = new Signer(pk);
    process.env.GENESIS_SECRET = hexlify(pk);

    coins.push({
      tx_id: hexlify(randomBytes(BYTES_32)),
      owner: signer.address.toHexString(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      amount: '18446744073709551615' as any,
      asset_id: chainConfig.consensus_parameters.V1.base_asset_id,
      output_index: 0,
      tx_pointer_block_height: 0,
      tx_pointer_tx_idx: 0,
    });
  }
  const json = JSON.stringify({
    ...stateConfig,
    coins,
    messages,
  });

  const regexMakeNumber = /("amount":)"(\d+)"/gm;
  return json.replace(regexMakeNumber, '$1$2');
}

// #region launchNode-launchNodeOptions
/**
 * Launches a fuel-core node.
 * @param ip - the ip to bind to. (optional, defaults to 0.0.0.0)
 * @param port - the port to bind to. (optional, defaults to 4000 or the next available port)
 * @param args - additional arguments to pass to fuel-core.
 * @param fuelCorePath - the path to the fuel-core binary. (optional, defaults to 'fuel-core')
 * @param loggingEnabled - whether the node should output logs. (optional, defaults to true)
 * @param debugEnabled - whether the node should log debug messages. (optional, defaults to false)
 * @param basePath - the base path to use for the temporary folder. (optional, defaults to os.tmpdir())
 * */
// #endregion launchNode-launchNodeOptions
export const launchNode = async ({
  ip,
  port,
  args = [],
  fuelCorePath = process.env.FUEL_CORE_PATH ?? undefined,
  loggingEnabled = true,
  debugEnabled = false,
  basePath,
  snapshotConfig = defaultSnapshotConfigs,
}: LaunchNodeOptions): LaunchNodeResult =>
  // eslint-disable-next-line no-async-promise-executor
  new Promise(async (resolve, reject) => {
    // filter out the flags chain, consensus-key, db-type, and poa-instant. we don't want to pass them twice to fuel-core. see line 214.
    const remainingArgs = extractRemainingArgs(args, [
      '--snapshot',
      '--consensus-key',
      '--db-type',
      '--poa-instant',
    ]);

    const snapshotDir = getFlagValueFromArgs(args, '--snapshot');
    const consensusKey = getFlagValueFromArgs(args, '--consensus-key') || defaultConsensusKey;

    const dbTypeFlagValue = getFlagValueFromArgs(args, '--db-type');
    const useInMemoryDb = dbTypeFlagValue === 'in-memory' || dbTypeFlagValue === undefined;

    const poaInstantFlagValue = getFlagValueFromArgs(args, '--poa-instant');
    const poaInstant = poaInstantFlagValue === 'true' || poaInstantFlagValue === undefined;

    const nativeExecutorVersion = getFlagValueFromArgs(args, '--native-executor-version') || '0';

    // This string is logged by the client when the node has successfully started. We use it to know when to resolve.
    const graphQLStartSubstring = 'Binding GraphQL provider to';

    const command = fuelCorePath ?? 'fuel-core';

    const ipToUse = ip || '0.0.0.0';

    const portToUse =
      port ||
      (
        await getPortPromise({
          port: 4000, // tries 4000 first, then 4001, then 4002, etc.
          stopPort: 5000, // don't try ports above 5000
        })
      ).toString();

    let snapshotDirToUse: string;

    const prefix = basePath || os.tmpdir();
    const suffix = basePath ? '' : randomUUID();
    const tempDir = path.join(prefix, '.fuels', suffix, 'snapshotDir');

    if (snapshotDir) {
      snapshotDirToUse = snapshotDir;
    } else {
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }
      const { metadata } = snapshotConfig;

      const metadataPath = path.join(tempDir, 'metadata.json');
      const chainConfigPath = path.join(tempDir, metadata.chain_config);
      const stateConfigPath = path.join(tempDir, metadata.table_encoding.Json.filepath);
      const stateTransitionPath = path.join(tempDir, 'state_transition_bytecode.wasm');

      writeFileSync(chainConfigPath, JSON.stringify(snapshotConfig.chainConfig), 'utf8');
      writeFileSync(stateConfigPath, getFinalStateConfigJSON(snapshotConfig), 'utf8');
      writeFileSync(metadataPath, JSON.stringify(metadata), 'utf8');
      writeFileSync(stateTransitionPath, JSON.stringify(''));

      snapshotDirToUse = tempDir;
    }

    const { spawn } = await import('child_process');

    const child = spawn(
      command,
      [
        'run',
        ['--ip', ipToUse],
        ['--port', portToUse],
        useInMemoryDb ? ['--db-type', 'in-memory'] : ['--db-path', tempDir],
        ['--min-gas-price', '1'],
        poaInstant ? ['--poa-instant', 'true'] : [],
        ['--native-executor-version', nativeExecutorVersion],
        ['--consensus-key', consensusKey],
        ['--snapshot', snapshotDirToUse as string],
        '--vm-backtrace',
        '--utxo-validation',
        '--debug',
        ...remainingArgs,
      ].flat(),
      {
        stdio: 'pipe',
      }
    );

    if (loggingEnabled) {
      child.stderr.pipe(process.stderr);
    }

    if (debugEnabled) {
      child.stdout.pipe(process.stdout);
    }

    const cleanupConfig: KillNodeParams = {
      child,
      configPath: tempDir,
      killFn: treeKill,
      state: {
        isDead: false,
      },
    };

    // Look for a specific graphql start point in the output.
    child.stderr.on('data', (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString(); // chunk is sometimes Buffer and sometimes string...
      // Look for the graphql service start.
      if (text.indexOf(graphQLStartSubstring) !== -1) {
        const rows = text.split('\n');
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const rowWithUrl = rows.find((row) => row.indexOf(graphQLStartSubstring) !== -1)!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [realIp, realPort] = rowWithUrl.split(' ').at(-1)!.trim().split(':'); // e.g. "2024-02-13T12:31:44.445844Z  INFO new{name=fuel-core}: fuel_core::graphql_api::service: 216: Binding GraphQL provider to 127.0.0.1:35039"

        // Resolve with the cleanup method.
        resolve({
          cleanup: () => killNode(cleanupConfig),
          ip: realIp,
          port: realPort,
          url: `http://${realIp}:${realPort}/v1/graphql`,
          snapshotDir: snapshotDirToUse as string,
        });
      }
      if (/error/i.test(text)) {
        reject(text.toString());
      }
    });

    // Process exit.
    process.on('exit', () => killNode(cleanupConfig));

    // Catches ctrl+c event.
    process.on('SIGINT', () => killNode(cleanupConfig));

    // Catches "kill pid" (for example: nodemon restart).
    process.on('SIGUSR1', () => killNode(cleanupConfig));
    process.on('SIGUSR2', () => killNode(cleanupConfig));

    // Catches uncaught exceptions.
    process.on('beforeExit', () => killNode(cleanupConfig));
    process.on('uncaughtException', () => killNode(cleanupConfig));

    child.on('error', reject);
  });

const generateWallets = async (count: number, provider: Provider) => {
  const baseAssetId = provider.getBaseAssetId();
  const wallets: WalletUnlocked[] = [];
  for (let i = 0; i < count; i += 1) {
    const wallet = await generateTestWallet(provider, [[100_000, baseAssetId]]);
    wallets.push(wallet);
  }
  return wallets;
};

export type LaunchNodeAndGetWalletsResult = Promise<{
  wallets: WalletUnlocked[];
  stop: () => void;
  provider: Provider;
}>;

/**
 * Launches a fuel-core node and returns a provider, 10 wallets, and a cleanup function to stop the node.
 * @param launchNodeOptions - options to launch the fuel-core node with.
 * @param walletCount - the number of wallets to generate. (optional, defaults to 10)
 * */
export const launchNodeAndGetWallets = async ({
  launchNodeOptions,
  walletCount = 10,
}: {
  launchNodeOptions?: Partial<LaunchNodeOptions>;
  walletCount?: number;
} = {}): LaunchNodeAndGetWalletsResult => {
  const { cleanup: closeNode, ip, port } = await launchNode(launchNodeOptions || {});

  const provider = await Provider.create(`http://${ip}:${port}/v1/graphql`);
  const wallets = await generateWallets(walletCount, provider);

  const cleanup = () => {
    closeNode();
  };

  return { wallets, stop: cleanup, provider };
};
