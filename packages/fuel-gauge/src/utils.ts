import { generateTestWallet } from '@fuel-ts/account/test-utils';
import { ASSET_A } from '@fuel-ts/utils/test-utils';
import { readFileSync } from 'fs';
import type { Interface, Contract, WalletUnlocked, JsonAbi, BytesLike } from 'fuels';
import { Script, Provider, ContractFactory, FUEL_NETWORK_URL } from 'fuels';
import { join } from 'path';

let contractInstance: Contract;
const deployContract = async (
  factory: ContractFactory,
  provider: Provider,
  useCache: boolean = true
) => {
  if (contractInstance && useCache) {
    return contractInstance;
  }
  contractInstance = await factory.deployContract();
  return contractInstance;
};

let walletInstance: WalletUnlocked;
export const createWallet = async () => {
  if (walletInstance) {
    return walletInstance;
  }
  const provider = await Provider.create(FUEL_NETWORK_URL);
  const baseAssetId = provider.getBaseAssetId();
  walletInstance = await generateTestWallet(provider, [
    [500_000_000, baseAssetId],
    [500_000_000, ASSET_A],
  ]);
  return walletInstance;
};

export type SetupConfig = {
  contractBytecode: BytesLike;
  abi: JsonAbi | Interface;
  cache?: boolean;
};

export const setup = async <T extends Contract = Contract>({
  contractBytecode,
  abi,
  cache,
}: SetupConfig) => {
  // Create wallet
  const wallet = await createWallet();
  const factory = new ContractFactory(contractBytecode, abi, wallet);
  const contract = await deployContract(factory, wallet.provider, cache);
  return contract as T;
};

const getFullPath = <T>(contractName: string, next: (fullPath: string) => T) =>
  next(
    join(__dirname, `../test/fixtures/forc-projects/${contractName}/out/release/${contractName}`)
  );

export const getScript = <TInput extends unknown[], TOutput>(
  scriptName: string,
  wallet: WalletUnlocked
): Script<TInput, TOutput> =>
  getFullPath(
    scriptName,
    (fullPath: string) =>
      new Script(
        readFileSync(`${fullPath}.bin`),
        JSON.parse(readFileSync(`${fullPath}-abi.json`, 'utf8')),
        wallet
      )
  );

export const getProgramDir = (name: string) =>
  join(__dirname, `../test/fixtures/forc-projects/${name}`);
